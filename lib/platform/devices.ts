import type { components } from '@/lib/generated/platform-contracts/platform';
import { platformOperation } from './client';
import { readDeviceId, writeDeviceId } from './session-store';

/**
 * This phone's push registration (build 11, D8 — BUILD-PLAN 24.13.6, ADR-0035):
 * the two Edge operations, bearer only, whose actor is always the session's
 * person.
 *
 * `PUT /v1/session/devices` registers the phone, or refreshes it. It is
 * idempotent by the token, so it is sent on every sign-in and cold start and the
 * same phone answers the same id. The push token travels in that body once and
 * nowhere else — never a URL, a route param, a log or the enclave. What is kept
 * is the answer, the device id, beside the session in SecureStore and cleared
 * with it; sign-out sends it back with `DELETE` while the bearer is still valid.
 *
 * A registration can still be in flight when Sign out is pressed — the tree's
 * at sign-in or a cold start, "Turn on", a changed token — and its answer would
 * land after the logout: the id written after the keychain was cleared, and
 * the phone left registered to the person who signed out, still getting their
 * pushes (the build 11 review). So the registrations in flight are tracked
 * here, beside the operation, and sign-out waits for them within a bound
 * (`settleDeviceRegistration`) before it reads the id to send back; past that
 * point (`endDeviceEpoch`) one that answers late keeps no id.
 */

export type DeviceRegistration = components['schemas']['DeviceRegistration'];
export type DeviceRegistered = components['schemas']['DeviceRegistered'];

/**
 * The registrations in flight, each for the life of its PUT and the write of
 * the id it answers. A set, not one slot: the token listener registers outside
 * the hook's single flight, so two can overlap.
 */
const inFlight = new Set<Promise<unknown>>();

/**
 * Moves each time sign-out lets this phone go. A registration keeps its id
 * only if it answers in the epoch it was started in.
 */
let epoch = 0;

/** Registers this phone and keeps the id it answers; in flight, sign-out waits for it. */
export function registerDevice(registration: DeviceRegistration): Promise<DeviceRegistered> {
  const attempt = registerAndKeep(registration, epoch);
  inFlight.add(attempt);
  const settled = () => {
    inFlight.delete(attempt);
  };
  attempt.then(settled, settled);
  return attempt;
}

async function registerAndKeep(registration: DeviceRegistration, startedIn: number): Promise<DeviceRegistered> {
  const registered = await platformOperation('/v1/session/devices', ({ platform }, signal) =>
    platform.PUT('/v1/session/devices', { body: registration, signal }),
  );
  // Answered after sign-out stopped waiting: the id is not kept, so nothing is
  // left in the keychain for a session that has ended. The phone itself stays
  // registered to the person who signed out — the DELETE needs the bearer the
  // logout revokes, and it was sent (or not) before this answer — until it
  // registers again or the platform's prune takes it: the accepted residual of
  // backend §12.1 #210, as for a session that ends without a sign-out.
  if (startedIn !== epoch) return registered;
  try {
    await writeDeviceId(registered.deviceId);
  } catch {
    // The phone is registered either way; an id the enclave would not keep only
    // means sign-out has nothing to send back, and the platform's prune is the
    // backstop (backend §12.1 #210).
  }
  return registered;
}

/**
 * Sign-out's wait for a registration still in flight: resolves once every one
 * started so far has answered — its id kept, so the DELETE that follows sends
 * it back — or after `timeoutMs`, whichever comes first. With none in flight it
 * resolves at once. It never throws: a registration that fails is settled too.
 */
export function settleDeviceRegistration(timeoutMs: number): Promise<void> {
  if (inFlight.size === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    void Promise.allSettled([...inFlight]).then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Sign-out has stopped waiting: a registration started before this point keeps
 * no id when it answers after it. One started after it — the next sign-in's,
 * or this person's again if the logout failed — keeps its own.
 */
export function endDeviceEpoch(): void {
  epoch += 1;
}

export async function unregisterDevice(deviceId: string): Promise<void> {
  await platformOperation<null>(`/v1/session/devices/${deviceId}`, ({ platform }, signal) =>
    platform.DELETE('/v1/session/devices/{deviceId}', { params: { path: { deviceId } }, signal }),
  );
}

/**
 * Sign-out's first step: unregister this phone while the bearer is still valid,
 * so the person signing out stops getting its pushes. It never blocks the
 * sign-out and says nothing when it fails — there is nothing for the person to
 * do about it, and the platform's own backstops (a `DeviceNotRegistered` ticket,
 * the ninety-day prune) take it from there.
 */
export async function unregisterThisDevice(): Promise<void> {
  try {
    const deviceId = await readDeviceId();
    if (deviceId) await unregisterDevice(deviceId);
  } catch {
    // Never blocks sign-out, and never logged.
  }
}
