/**
 * Whether the cover plays its entrance — the owner's build 13 decision 1.
 *
 * The fade is the app's opening: on a cold start "Get started" rises in over
 * 0.25 s + 0.9 s. After a sign-out inside the running app the person has just
 * asked to leave, so the cover is shown whole, at once. Held for the process's
 * life: a sign-out is the only thing that sets it, and a cold start clears it.
 */
let signedOutThisRun = false;

/** A sign-out completed: the next cover is shown without its entrance. */
export function noteSignedOut(): void {
  signedOutThisRun = true;
}

/** Whether the cover fades "Get started" in. */
export function coverPlaysEntrance(): boolean {
  return !signedOutThisRun;
}

/** For tests: a fresh process. */
export function resetCoverEntranceForTests(): void {
  signedOutThisRun = false;
}
