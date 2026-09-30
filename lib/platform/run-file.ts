import { completeUpload, openUpload, type UploadedFile } from './automations';
import { putFileToSignedUrl } from './client';

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
 *    id, which is all a run's input carries.
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
  return completeUpload(workspaceId, ticket.uploadSessionId);
}
