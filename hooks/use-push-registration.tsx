import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { activeWorkspaceId, useSession, type SessionState } from '@/hooks/use-session';
import { newIdempotencyKey } from '@/lib/platform/client';
import { registerDevice } from '@/lib/platform/devices';
import { PlatformError } from '@/lib/platform/problem';
import { readPushNotNow, writePushNotNow } from '@/lib/platform/session-store';
import { selectActiveWorkspace } from '@/lib/platform/workspaces';

/**
 * Device push (build 11, D8 — BUILD-PLAN 24.13.6, ADR-0035). The owner's build
 * 10 item 13 asked "What do we need to do here?" of a card that said push was
 * not configured; the decision of 2026-10-03 was to add it, for held and failed
 * runs — the two things the inbox lists.
 *
 * Two halves share one state. `usePushRegistration`, mounted in the signed-in
 * tree, keeps a phone iOS already lets the app notify registered with the
 * platform, shows a push's banner while the app is open, and opens what a tap
 * names. `usePushAsk` is the inbox card's: the only place the app asks, and only
 * when the person taps "Turn on" — never at launch, the Face ID offer's rule.
 *
 * iOS phones only. Android has no FCM credential in build 11 and a simulator
 * gets no token, so neither registers anything and the card says so (backend
 * §12.1 #211). There is no web push.
 */

/** What this process's last registration came to. */
type Registration = 'registered' | 'not-yet' | 'no-build' | 'failed';

/** iOS lets the app notify, may still ask, or will take only its Settings' word. */
type Permission = 'granted' | 'ask' | 'denied';

/** What the card reads: the last registration, and "Not now" once said this session. */
type Shared = { registration: Registration | null; notNow: boolean };

let shared: Shared = { registration: null, notNow: false };
let listeners: (() => void)[] = [];
/** The registration in flight, which every caller in the meantime shares. */
let pending: Promise<Registration> | null = null;
/** Moves when a session ends, so an answer for the last person never settles the next one's. */
let generation = 0;
/** The device token the token listener heard last: what a change is measured from. */
let heardToken: string | null = null;
/** The notification a tap opened last, so one tap never opens two screens. */
let openedResponse: string | null = null;

function update(next: Partial<Shared>): void {
  shared = { ...shared, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
  };
}

function snapshot(): Shared {
  return shared;
}

/** A session ended: the next person registers afresh and is asked again. */
function forgetSession(): void {
  generation += 1;
  pending = null;
  heardToken = null;
  update({ registration: null, notNow: false });
}

/** iOS, on a phone: the only place build 11 registers. */
function pushSupported(): boolean {
  return Platform.OS === 'ios' && Device.isDevice;
}

function permissionOf(answer: Notifications.NotificationPermissionsStatus): Permission {
  if (answer.granted) return 'granted';
  // `canAskAgain` is false exactly when iOS has a "no" on record, which only its
  // Settings can change — the moment to offer Settings rather than ask.
  return answer.canAskAgain ? 'ask' : 'denied';
}

async function readPermission(): Promise<Permission | null> {
  try {
    return permissionOf(await Notifications.getPermissionsAsync());
  } catch {
    return null;
  }
}

/** The build that registered, for the operator's eyes only: "1.0.0 (11)". */
function appBuild(): string | undefined {
  const version = Constants.expoConfig?.version;
  const build = Constants.platform?.ios?.buildNumber;
  const label = [version, build ? `(${build})` : null].filter(Boolean).join(' ').slice(0, 40);
  return label || undefined;
}

/**
 * Expo's token service unreachable (`ERR_NOTIFICATIONS_NETWORK_ERROR`, its
 * fetch rejected) or answering badly (`ERR_NOTIFICATIONS_SERVER_ERROR`, not OK
 * or not the token's shape): the codes `getExpoPushTokenAsync` throws them
 * with, as `CodedError`s (expo-notifications 0.32). Another try may get past
 * either, so they ask again rather than say the build cannot (the build 11
 * review).
 */
const TOKEN_SERVICE_FAILURES: readonly string[] = ['ERR_NOTIFICATIONS_NETWORK_ERROR', 'ERR_NOTIFICATIONS_SERVER_ERROR'];

function tokenServiceFailed(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' && TOKEN_SERVICE_FAILURES.includes(code);
}

/**
 * One registration: this phone's Expo push token, then the platform's `PUT`.
 * `getExpoPushTokenAsync` asks Expo's token service from inside the library —
 * CLAUDE.md rule 5's third credential-less exception — and the token it answers
 * goes to the platform in that body and nowhere else.
 */
async function register(devicePushToken?: Notifications.DevicePushToken): Promise<Registration> {
  let token: string;
  try {
    const answer = await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId,
      // From the token listener, the token it heard: asking the device for its
      // token again would announce it again, to the same listener.
      ...(devicePushToken ? { devicePushToken } : {}),
    });
    token = answer.data;
  } catch (error) {
    // The token service offline or failing: worth another Turn on, in words.
    if (tokenServiceFailed(error)) return 'failed';
    // No push entitlement in this build, or no token for it at all.
    return 'no-build';
  }
  try {
    const build = appBuild();
    await registerDevice({ platform: 'ios', token, ...(build ? { appBuild: build } : {}) });
    return 'registered';
  } catch (error) {
    // A platform from before the devices route answers 404, and 503 while its
    // device store is unconfigured: not available yet, said in words.
    if (error instanceof PlatformError && (error.status === 404 || error.status === 503)) return 'not-yet';
    return 'failed';
  }
}

/** One registration at a time, shared by the signed-in tree and the card: an allowed phone registers once. */
function registerOnce(): Promise<Registration> {
  if (pending) return pending;
  const mine = generation;
  const attempt = register().then((next) => {
    if (mine === generation) {
      pending = null;
      update({ registration: next });
    }
    return next;
  });
  pending = attempt;
  return attempt;
}

/**
 * The token listener. Getting a token announces it, so the first one heard is
 * the echo of a registration this file made; a different one later is the
 * token changing, and is registered at once.
 */
function registerChanged(devicePushToken: Notifications.DevicePushToken): void {
  const heard = String(devicePushToken.data);
  const previous = heardToken;
  heardToken = heard;
  if (previous === null || previous === heard) return;
  const mine = generation;
  void register(devicePushToken).then((next) => {
    if (mine === generation) update({ registration: next });
  });
}

/** A push shown while the app is open: its banner, as with the app closed. */
const FOREGROUND: Notifications.NotificationBehavior = {
  shouldShowBanner: true,
  shouldShowList: true,
  shouldPlaySound: false,
  shouldSetBadge: false,
};

/** A run id from a push is an id: nothing that could carry a path or a query. */
const RUN_ID = /^[A-Za-z0-9_-]{1,128}$/u;

/** A workspace id from a push is a workspace id, as the platform writes one: a UUID. */
const WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** What a tap opens: a failed run's page, or Activity for a held one — nothing for anything else. */
function targetOf(data: Record<string, unknown>): Href | null {
  if (data.event === 'run-failed' && typeof data.runId === 'string' && RUN_ID.test(data.runId)) {
    return { pathname: '/(tabs)/(home)/run', params: { runId: data.runId } };
  }
  if (data.event === 'approval-requested') return '/(tabs)/activity';
  return null;
}

/**
 * The workspace a tap switches to before it opens: the one the push names, when
 * it is one of this person's — the session's list — and not the active one.
 * Anything else is null and the tap opens in the active workspace, as it did
 * before the platform named one: no id (every push until the NINETEENTH
 * promotion), an id of another shape, one that is not theirs, the active one.
 */
function switchFor(named: unknown, state: SessionState): string | null {
  if (typeof named !== 'string' || !WORKSPACE_ID.test(named)) return null;
  if (state.status !== 'signed-in' || named === activeWorkspaceId(state)) return null;
  return state.session.workspaces.some((workspace) => workspace.id === named) ? named : null;
}

/**
 * The signed-in tree's half, mounted in `app/(tabs)/_layout.tsx` and idle until
 * `signedIn` — which the layout passes only for an open session: signed in, and
 * not held by the Face ID lock, so a tap's screen waits for the lock as it
 * waits for a sign-in (the build 13 review). It asks nothing.
 */
export function usePushRegistration(signedIn: boolean): void {
  const router = useRouter();
  const session = useSession();
  const active = activeWorkspaceId(session);
  // The session as last drawn, which a tap reads, without its listener being
  // set up again at every change.
  const drawn = useRef(session);
  useEffect(() => {
    drawn.current = session;
  }, [session]);
  // A tap that switched workspace, owed its screen until the switched session is drawn.
  const [owed, setOwed] = useState<{ workspaceId: string; target: Href } | null>(null);

  // While someone is signed in, a push that arrives with the app open shows its
  // banner. When the session ends, the next person registers afresh and is
  // asked again.
  useEffect(() => {
    if (!signedIn) return;
    Notifications.setNotificationHandler({ handleNotification: async () => FOREGROUND });
    return () => {
      Notifications.setNotificationHandler(null);
      forgetSession();
    };
  }, [signedIn]);

  // Every sign-in, and so every cold start: a phone iOS already lets the app
  // notify registers again — the platform's PUT is idempotent and refreshes it —
  // and again whenever its token changes.
  useEffect(() => {
    if (!signedIn || !pushSupported()) return;
    let live = true;
    void readPermission().then((permission) => {
      if (live && permission === 'granted') void registerOnce();
    });
    const rolled = Notifications.addPushTokenListener(registerChanged);
    return () => {
      live = false;
      rolled.remove();
    };
  }, [signedIn]);

  // A tap opens the inbox's own target: a failed run's page, or Activity for a
  // held one — in the workspace the push names. While the app runs, and the tap
  // that opened it, once signed in.
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!live || !response) return;
      const id = response.notification.request.identifier;
      if (id === openedResponse) return;
      openedResponse = id;
      const data = response.notification.request.content.data ?? {};
      const target = targetOf(data);
      if (!target) return;
      const workspaceId = switchFor(data.workspaceId, drawn.current);
      if (workspaceId === null) {
        router.push(target);
        return;
      }
      // Another of this person's workspaces: switched to as the switcher does —
      // the platform's active workspace, then the session read again — and
      // opened once that session is drawn (below). A switch or a read that
      // fails opens nothing, and the person stays where they are, rather than
      // on a page reading a workspace the push did not name.
      const { reload } = drawn.current;
      void (async () => {
        try {
          await selectActiveWorkspace(workspaceId, newIdempotencyKey('workspace-activate'));
          if (!live) return;
          await reload();
          if (live) setOwed({ workspaceId, target });
        } catch {
          // Not switched: nothing opens.
        }
      })();
    };
    const tapped = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync().then(open, () => undefined);
    return () => {
      live = false;
      tapped.remove();
    };
  }, [signedIn, router]);

  // A switched tap opens only once the switched session is drawn: a run's page
  // binds to the workspace it opens in (24.11.9), so opened a render early it
  // would bind to the one being left, and leave. And only if the session read
  // made the push's workspace the active one — a read that failed, or answered
  // another, opens nothing.
  useEffect(() => {
    if (!owed) return;
    setOwed(null);
    if (active === owed.workspaceId) router.push(owed.target);
  }, [owed, active, router]);
}

/** What the inbox card shows: the ask, Settings, or why this phone cannot be asked. */
export type PushAsk =
  | { kind: 'none' }
  | { kind: 'ask'; failed: boolean }
  | { kind: 'denied' }
  | { kind: 'unsupported' }
  | { kind: 'not-yet' }
  | { kind: 'no-build' };

/**
 * The inbox card's half. It reads what iOS says, and when iOS already allows,
 * registers through the same single flight as the tree — so a phone not yet
 * registered in this process, or one that failed to, tries again when the card
 * is looked at. It reads again when the app returns from iOS Settings.
 */
export function usePushAsk(): {
  ask: PushAsk;
  busy: boolean;
  turnOn: () => Promise<void>;
  notNow: () => Promise<void>;
  openSettings: () => void;
} {
  const { registration, notNow } = useSyncExternalStore(subscribe, snapshot);
  const [checked, setChecked] = useState(false);
  const [permission, setPermission] = useState<Permission | null>(null);
  const [busy, setBusy] = useState(false);
  const [tapFailed, setTapFailed] = useState(false);
  const asking = useRef(false);
  const live = useRef(true);

  const look = useCallback(async () => {
    const next = await readPermission();
    if (!live.current) return;
    setPermission(next);
    if (next === 'granted' && snapshot().registration !== 'registered') void registerOnce();
  }, []);

  useEffect(() => {
    live.current = true;
    void (async () => {
      const said = await readPushNotNow();
      if (!live.current) return;
      if (said) update({ notNow: true });
      setChecked(true);
      if (!said && pushSupported()) await look();
    })();
    return () => {
      live.current = false;
    };
  }, [look]);

  useEffect(() => {
    if (!pushSupported()) return;
    const watching = AppState.addEventListener('change', (state) => {
      if (state === 'active') void look();
    });
    return () => watching.remove();
  }, [look]);

  const turnOn = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    setBusy(true);
    setTapFailed(false);
    try {
      // iOS asks now, at the tap.
      const next = permissionOf(await Notifications.requestPermissionsAsync());
      if (!live.current) return;
      setPermission(next);
      if (next === 'granted') await registerOnce();
    } catch {
      if (live.current) setTapFailed(true);
    } finally {
      asking.current = false;
      if (live.current) setBusy(false);
    }
  }, []);

  const sayNotNow = useCallback(async () => {
    update({ notNow: true });
    try {
      await writePushNotNow();
    } catch {
      // Not kept: the card may ask again at the next launch, as the Face ID
      // offer would.
    }
  }, []);

  const openSettings = useCallback(() => {
    void Linking.openSettings().catch(() => undefined);
  }, []);

  let ask: PushAsk = { kind: 'none' };
  if (checked && !notNow) {
    if (!pushSupported()) ask = { kind: 'unsupported' };
    else if (permission === 'denied') ask = { kind: 'denied' };
    else if (permission === 'ask') ask = { kind: 'ask', failed: tapFailed };
    else if (permission === 'granted') {
      if (registration === 'not-yet') ask = { kind: 'not-yet' };
      else if (registration === 'no-build') ask = { kind: 'no-build' };
      else if (registration === 'failed') ask = { kind: 'ask', failed: true };
      // A "Turn on" still registering keeps its card until the answer.
      else if (registration === null && busy) ask = { kind: 'ask', failed: false };
    }
  }

  return { ask, busy, turnOn, notNow: sayNotNow, openSettings };
}

/** Test-only reset, so one test's registration, answer or tap cannot serve the next. */
export function resetPushForTests(): void {
  forgetSession();
  listeners = [];
  openedResponse = null;
}
