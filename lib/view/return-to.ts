import type { Href } from 'expo-router';

/**
 * Where a sign-in after an ended session goes (Gate 24 parity, G4): back to the
 * screen that was open, as the website's "Sign in again to carry on where you
 * were" does (`snoopy/components/dashboard/PlatformUnavailable.tsx`,
 * `SessionEnded`, whose link carries the page to the sign-in and back).
 *
 * The cover stays what being signed out looks like (BUILD-PLAN 24.11.6): the
 * session ends, the root guard takes the tabs away, the cover says why, and Get
 * started is still the one way to Sign in. What changes is where the sign-in
 * lands. Held for the process's life, in memory only, as the cover's entrance
 * flag is (`cover-entrance.ts`): a route's own params, never a credential, and
 * nothing to carry over a relaunch, which starts from the cover anyway.
 */

/** A tab screen, for the person whose session it was: its route by segments, and its params. */
export type OpenScreen = { userId: string; pathname: string; params: Record<string, string> };

/** The tab screen in front, while a session is open; none on any other screen. */
let open: OpenScreen | null = null;
/** The screen a sign-in owes its person, after their session ended on it. */
let owed: OpenScreen | null = null;

/** Kept by the root layout as the person moves: a tab screen, or `null` for any other. */
export function noteOpenScreen(screen: OpenScreen | null): void {
  open = screen;
}

/**
 * The session ended: the screen in front, if a tab screen was, is owed to the
 * next sign-in. `true` when one was — the session ended while it was in use,
 * which the cover says (`SessionState`'s `ended`). An announcement after the
 * first finds none, and changes nothing owed.
 */
export function noteSessionEnded(): boolean {
  if (!open) return false;
  owed = open;
  open = null;
  return true;
}

/** Signed out on purpose: nothing open, nothing owed — a 401 that landed during the sign-out included. */
export function forgetOpenScreen(): void {
  open = null;
  owed = null;
}

/** A sign-in completed for `userId`: a screen owed to anyone else is dropped, not shown to them. */
export function settleReturn(userId: string): void {
  if (owed && owed.userId !== userId) owed = null;
}

/** Where the sign-in just made goes: the screen owed, once, else Home. */
export function afterSignIn(): Href {
  const target = owed;
  owed = null;
  // A route the router itself reported: its segments name one screen, whatever
  // group it sits in, as "/" would not (the cover and Home share it).
  return target ? ({ pathname: target.pathname, params: target.params } as Href) : '/(tabs)/(home)';
}

/** For tests: a fresh process. */
export function resetReturnForTests(): void {
  open = null;
  owed = null;
}
