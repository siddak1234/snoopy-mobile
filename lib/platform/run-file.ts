import { completeUpload, openUpload, type UploadedFile } from './automations';
import { putFileToSignedUrl } from './client';
import { PlatformRateLimitedError } from './problem';

/** A file the person chose: named, typed, measured on disk, and read when sent. */
export type ChosenFile = {
  name: string;
  /** What the picker called it; absent when it could not tell. */
  mimeType?: string;
  /** Its size on disk, measured before it is read. */
  sizeBytes: number;
  read: () => Promise<Uint8Array<ArrayBuffer>>;
};

export const FILE_EMPTY = 'The file is empty.';
export const FILE_CHANGED = 'The file changed while it was being sent. Choose it again.';
export const FILE_NOT_SENT = 'The file was not sent.';

/**
 * A file with no place yet to be measured (backend BUILD-PLAN 25.2.39): its
 * completion is answered 429 `measurement_busy` at once — nothing refused,
 * nothing lost, the upload kept open with its sealed bytes — and completing the
 * same upload again measures it. So it is completed again here, at most four
 * more times, each after the wait the answer states (`retry-after`) or, when it
 * states none, 1.5 s (the owner's rule of 2026-10-13: no blocker where one can
 * be worked around).
 */
const MEASUREMENT_RETRIES = 4;
const MEASUREMENT_WAIT_MS = 1_500;
/**
 * The longest stated wait honoured. A longer one is never cut short: the busy
 * answer is the caller's at once instead. So the waits come to 20 s at most —
 * 6 s when none is stated, as the platform states none for this answer — inside
 * the 15 minutes an upload stays open (the ticket's `expiresAt`), with each
 * attempt its own request under the transport's 10 s.
 */
const MEASUREMENT_WAIT_LIMIT_MS = 5_000;

/**
 * Upload a file a run will read (FR-14, BUILD-PLAN 24.4.1) — the website's
 * `RunFileField` sequence, ported:
 *
 * 1. **Open.** The platform signs a URL for exactly `sizeBytes`. It is asked
 *    before the file is read, so a file it will not take (too large, the wrong
 *    type) is refused without being loaded into memory.
 * 2. **Read, and hold the length to what was signed.** The store refuses any
 *    other length; bytes that differ from the size told are not sent at all.
 * 3. **PUT** straight to the store, with no credential (`putFileToSignedUrl`).
 *    The bytes never pass through the Edge (invariant 6).
 * 4. **Complete.** The platform measures what arrived and answers the file's
 *    id, which is all a run's input carries. A file with no place yet to be
 *    measured is completed again, the same upload, by itself
 *    (`completeWhenMeasured`).
 */
export async function sendRunFile(
  workspaceId: string,
  subscriptionId: string,
  file: ChosenFile,
  signal?: AbortSignal,
): Promise<UploadedFile> {
  if (!Number.isInteger(file.sizeBytes) || file.sizeBytes < 1) throw new Error(FILE_EMPTY);
  // A picker that cannot name a type leaves it empty; the platform needs one,
  // and a generic one is the honest answer (the website's rule).
  const contentType = file.mimeType || 'application/octet-stream';
  const ticket = await openUpload(workspaceId, {
    subscriptionId,
    filename: file.name,
    contentType,
    sizeBytes: file.sizeBytes,
  });
  if (signal?.aborted) throw new Error(FILE_NOT_SENT);
  const bytes = await file.read();
  if (bytes.byteLength !== file.sizeBytes) throw new Error(FILE_CHANGED);
  await putFileToSignedUrl(ticket.uploadUrl, bytes, contentType, signal);
  if (signal?.aborted) throw new Error(FILE_NOT_SENT);
  return completeWhenMeasured(workspaceId, ticket.uploadSessionId, signal);
}

/**
 * Complete an upload, and complete the same upload again while its file waits
 * for a place to be measured. Nothing else is tried again: a refusal, any other
 * 429 and an outage are the caller's at once, as is a file still waiting after
 * the last attempt, which the field says in the website's words
 * (`UPLOAD_REFUSALS`). Until then the field only says it is uploading. A wait
 * ends when the upload is stopped (the field went), and nothing more is sent.
 */
async function completeWhenMeasured(
  workspaceId: string,
  uploadSessionId: string,
  signal?: AbortSignal,
): Promise<UploadedFile> {
  let retries = 0;
  for (;;) {
    try {
      return await completeUpload(workspaceId, uploadSessionId);
    } catch (failure) {
      const wait = retries < MEASUREMENT_RETRIES ? measurementWait(failure) : undefined;
      if (wait === undefined) throw failure;
      retries += 1;
      await pause(wait, signal);
      if (signal?.aborted) throw new Error(FILE_NOT_SENT);
    }
  }
}

/** The wait before completing again, or none: not the busy measurement, or a stated wait past the limit. */
function measurementWait(failure: unknown): number | undefined {
  if (!(failure instanceof PlatformRateLimitedError) || failure.details?.reason !== 'measurement_busy') return undefined;
  const wait = failure.retryAfterSeconds === undefined ? MEASUREMENT_WAIT_MS : failure.retryAfterSeconds * 1_000;
  return wait <= MEASUREMENT_WAIT_LIMIT_MS ? wait : undefined;
}

/** `ms` passing, or the upload being stopped, whichever comes first. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const end = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', end);
      resolve();
    };
    const timer = setTimeout(end, ms);
    signal?.addEventListener('abort', end, { once: true });
  });
}
