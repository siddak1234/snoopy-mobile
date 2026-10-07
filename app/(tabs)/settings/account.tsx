import { useRouter } from 'expo-router';
import { Key, Trash } from 'phosphor-react-native';
import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Pressable } from '@/components/pressable';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { SettingsRow } from '@/components/settings/settings-row';
import { em, fonts, layout, status, typeScale } from '@/constants/theme';
import { busyBody, useResource } from '@/hooks/use-resource';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import {
  DELETE_ACCOUNT_BODY,
  DELETE_ACCOUNT_TITLE,
  DELETION_WORDS,
  deletionOutcome,
  type DeletionOutcome,
} from '@/lib/content/deletion';
import { SIGN_OUT_FAILED, errorTitleFor } from '@/lib/content/screen-states';
import { deleteAccount, readIdentities, unlinkIdentity, type LoginIdentity } from '@/lib/platform/account';
import { readCurrentSession, readLoginProviders } from '@/lib/platform/auth';
import { linkIdentity } from '@/lib/platform/identity-link';
import type { LoginProvider } from '@/lib/platform/native-auth';
import { unlinkRefusal } from '@/lib/content/refusals';
import { PlatformError } from '@/lib/platform/problem';
import { clearSession } from '@/lib/platform/session-store';

/**
 * Settings → Account (BUILD-PLAN 24.6.2) — the website's linked accounts and
 * danger zone. Linking another sign-in account uses 24.2.1's native flow in the
 * system browser. Deleting the account is ADR-0028's: the personal workspace and
 * every organization this person alone owns go with it, one at a time; there is
 * no deleting a workspace on its own (19.6.2). After it, a signed-out screen.
 */
export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const session = useSession();
  const [linking, setLinking] = useState<LoginProvider | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<LoginIdentity['provider'] | null>(null);
  const [deleting, setDeleting] = useState(false);

  const account = useResource(async () => {
    const [identities, providers] = await Promise.all([readIdentities(), readLoginProviders()]);
    return { identities, providers: providers.providers };
  }, []);

  const link = async (provider: LoginProvider) => {
    if (linking) return;
    setLinking(provider);
    setLinkError(null);
    const outcome = await linkIdentity(provider);
    setLinking(null);
    if (outcome.status === 'failed') setLinkError(outcome.message);
    // Linked, or closed part-way: what the account now holds is read, either way.
    if (outcome.status === 'linked') void session.reload();
    account.reload();
  };

  /**
   * Unlink (backend 24.11.1, the owner's build 7 ask). Confirmed first. A
   * refusal is said in words by its reason (`unlinkRefusal`) — the primary, the
   * last sign-in, a route the platform does not have yet — never the problem's
   * title, which build 9 showed as "Not Found"; either way what is linked is
   * read again.
   */
  const unlink = async (provider: LoginIdentity['provider']) => {
    setLinkError(null);
    try {
      await unlinkIdentity(provider);
      void session.reload();
    } catch (caught) {
      setLinkError(unlinkRefusal(caught));
    } finally {
      setUnlinking(null);
      account.reload();
    }
  };

  if (account.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (account.status === 'offline') {
    return <ScreenOffline onRetry={() => account.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (account.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('account')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (account.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('account')}
        onRetry={() => account.reload()}
        body={busyBody(account)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const linked = new Map(account.data.identities.map((identity) => [identity.provider, identity]));
  const muted = { color: palette.neutral[400] };

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <Text style={[styles.title, { color: palette.text }]}>Account</Text>
      </View>

      <View>
        <SectionLabel>LINKED ACCOUNTS</SectionLabel>
        {/* What linking does, and the one trap — a first sign-in with a provider not
            yet linked can start a separate account (the owner's build 12 item 8). And
            the rule Supabase applies on its own: a sign-in whose verified email is this
            account's joins this account (the owner's build 13 decision 9, feedback #16). */}
        <Text style={[styles.text, styles.lead, muted]}>
          Any account linked here signs you in to this same account, in the app and on the website. Signing in with
          Google, Microsoft or Apple at the same email address as this account joins this account too. To use one with
          a different email address, link it before you first sign in with it. Provider credentials are handled by the
          Autom8x backend and never reach this app.
        </Text>
        <SurfaceCard style={styles.card}>
          {account.data.providers.map((provider, index) => {
            const identity = linked.get(provider.id);
            const primary = identity?.primary;
            return (
              <SettingsRow
                key={provider.id}
                testID={`identity-${provider.id}`}
                icon={Key}
                title={provider.label}
                // The address the provider reports, so two linked accounts can be
                // told apart (backend 24.12.2); none when it reports none, and an
                // account not linked has none.
                sub={identity?.email}
                divider={index < account.data.providers.length - 1}
                right={
                  primary === true ? (
                    <Text style={[styles.small, muted]}>Primary</Text>
                  ) : primary === false ? (
                    <Pressable testID={`unlink-${provider.id}`} disabled={linking !== null} onPress={() => setUnlinking(provider.id)}>
                      {/* It removes a way to sign in: red, as its confirm is (the owner's build 12 item 5). */}
                      <Text style={[styles.linkLabel, { color: palette.danger }]}>Unlink</Text>
                    </Pressable>
                  ) : (
                    <Pressable testID={`link-${provider.id}`} disabled={linking !== null} onPress={() => link(provider.id)}>
                      <Text style={[styles.linkLabel, { color: palette.accentRamp[300] }]}>
                        {linking === provider.id ? 'Linking…' : 'Link'}
                      </Text>
                    </Pressable>
                  )
                }
              />
            );
          })}
        </SurfaceCard>
        {linkError ? <Text style={[styles.text, styles.lead, { color: status.err }]}>{linkError}</Text> : null}
        {unlinking ? (
          <ConfirmDialog
            testID="unlink-dialog"
            title={`Unlink ${account.data.providers.find((p) => p.id === unlinking)?.label ?? unlinking}?`}
            body="You can still sign in with your other linked accounts, and link this one again later."
            confirmLabel="Unlink"
            busyLabel="Unlinking…"
            fallback="The account could not be unlinked."
            run={() => unlink(unlinking)}
            onClose={() => setUnlinking(null)}
            onDone={() => setUnlinking(null)}
          />
        ) : null}
      </View>

      <View>
        <SectionLabel>DANGER ZONE</SectionLabel>
        <SurfaceCard style={[styles.card, styles.pad]}>
          <Text style={[styles.text, muted]}>
            Permanently delete your account, your personal workspace, and every organization you alone own.
          </Text>
          {/* Red, the design's red pill: it cannot be undone (the owner's build 12 item 5). */}
          <PillButton label="Delete Account" variant="danger" height={42} icon={Trash} iconSize={15} onPress={() => setDeleting(true)} />
        </SurfaceCard>
      </View>

      {deleting ? (
        <DeleteAccountDialog
          onClose={() => setDeleting(false)}
          onDeleted={async () => {
            // Gone upstream: this device lets go of the session, and says so.
            await clearSession();
            setDeleting(false);
            router.replace('/(auth)/account-deleted');
            session.refresh();
          }}
          signOut={session.signOut}
        />
      ) : null}
    </ScrollView>
  );
}

/** ADR-0028's confirmation, and every answer the contract gives a bearer caller. */
function DeleteAccountDialog({
  onClose,
  onDeleted,
  signOut,
}: {
  onClose: () => void;
  onDeleted: () => Promise<void>;
  signOut: () => Promise<{ revoked: boolean }>;
}) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Exclude<DeletionOutcome, { kind: 'deleted' | 'check' }> | null>(null);
  // An attempt whose fate was unknown outlives a retry: a later 401 may mean it finished.
  const anAttemptWasLost = useRef(false);

  const settle = async (next: DeletionOutcome) => {
    if (next.kind === 'deleted') return onDeleted();
    if (next.kind === 'deleted-not-revoked') {
      // The account is gone but the refresh token it sent is live: revoke it
      // through sign-out before this device forgets it (the contract's rule).
      const { revoked } = await signOut();
      if (revoked) return onDeleted();
      setOutcome(next);
      return;
    }
    if (next.kind === 'check') {
      // Whether anything was removed is unknown: the session says which.
      try {
        await readCurrentSession();
        setOutcome({ kind: 'failed', message: DELETION_WORDS.stillHere });
      } catch (caught) {
        if (caught instanceof PlatformError && caught.status === 401) return onDeleted();
        anAttemptWasLost.current = true;
        setOutcome({ kind: 'failed', message: DELETION_WORDS.unknown });
      }
      return;
    }
    if (next.kind === 'failed' && next.message === DELETION_WORDS.retry) anAttemptWasLost.current = false;
    setOutcome(next);
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (outcome?.kind === 'deleted-not-revoked') {
        await settle(outcome);
        return;
      }
      let failure: unknown = null;
      try {
        await deleteAccount();
      } catch (caught) {
        failure = caught;
      }
      await settle(deletionOutcome(failure, anAttemptWasLost.current));
    } finally {
      setBusy(false);
    }
  };

  /**
   * "Sign in again", after an attempt the session's end stopped: this phone
   * signs out through the session, and the root layout's guard shows the cover,
   * where Get started is the way back in (24.11.6). It does not navigate: inside
   * the tabs "/" is Home, and build 12's move to it was dropped — the button did
   * nothing (the owner's build 12 item 6). A sign-out that could not be revoked
   * keeps the dialog and says so, nothing cleared (ADR-0017 §4); the button
   * tries again.
   */
  const signInAgain = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { revoked } = await signOut();
      if (!revoked) setOutcome({ kind: 'expired', message: SIGN_OUT_FAILED });
    } finally {
      setBusy(false);
    }
  };

  const message =
    outcome?.kind === 'deleted-not-revoked' ? DELETION_WORDS.notRevoked : (outcome?.message ?? null);

  return (
    <Dialog
      visible
      testID="delete-account-dialog"
      onRequestClose={busy ? () => undefined : onClose}
      title={DELETE_ACCOUNT_TITLE}
      body={DELETE_ACCOUNT_BODY[0]}
      actions={
        <>
          <DialogButton label="Cancel" disabled={busy} onPress={onClose} />
          {outcome?.kind === 'expired' ? (
            <DialogButton tone="accent" label="Sign in again" disabled={busy} onPress={signInAgain} />
          ) : (
            <DialogButton
              tone="danger"
              disabled={busy}
              onPress={confirm}
              label={busy ? 'Deleting…' : outcome ? 'Try again' : 'Yes, delete my account'}
            />
          )}
        </>
      }>
      <DialogText>{DELETE_ACCOUNT_BODY[1]}</DialogText>
      {message ? <DialogText tone="error">{message}</DialogText> : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: 32, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: fonts.medium, fontSize: typeScale.heading.fontSize, letterSpacing: em(-0.01, typeScale.heading.fontSize) },
  card: { marginTop: 9 },
  pad: { padding: 14, gap: 10 },
  lead: { marginTop: 8 },
  text: { fontFamily: fonts.regular, ...typeScale.body },
  small: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
  linkLabel: { fontFamily: fonts.medium, fontSize: typeScale.body.fontSize },
});
