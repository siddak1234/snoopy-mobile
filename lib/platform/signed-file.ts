import { Directory, File } from 'expo-file-system';
import { Linking, Platform, Share } from 'react-native';

import { downloadSignedFile } from './client';
import { SignedLinkUnusableError } from './problem';

/**
 * A signed link the app may open or save: https only — anything else, or no
 * address at all, is refused (`SignedLinkUnusableError`) and never followed.
 */
export function signedLink(url: string): string {
  let protocol = '';
  try {
    protocol = new URL(url).protocol;
  } catch {
    // Not an address: refused below.
  }
  if (protocol !== 'https:') throw new SignedLinkUnusableError();
  return url;
}

/**
 * Whether this phone can hand the file itself to the share sheet (Round 21;
 * the owner's Q7; plan Open 8): iOS, whose `Share.share` takes a file's `url`.
 * Android's share sheet carries text only without a native module the app
 * does not add, so Share is not drawn there — the website's rule, Share only
 * where the file itself can be shared. https://reactnative.dev/docs/share
 */
export function sharesFiles(): boolean {
  return Platform.OS === 'ios';
}

/** Whether a rejection is the person closing the Files folder picker: nothing to say. */
function pickerClosed(error: unknown): boolean {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  return (typeof code === 'string' && /CANCEL/u.test(code)) || (typeof message === 'string' && /cancel/iu.test(message));
}

/**
 * A file in the app's cache, saved into the folder the person picks in Files —
 * no share sheet (the owner's Q7 note): expo-file-system's
 * `Directory.pickDirectoryAsync()` ("On iOS, the selected directory grants
 * temporary read and write access for the current app session only",
 * node_modules/expo-file-system/build/ExpoFileSystem.types.d.ts:126-134; it
 * opens UIDocumentPickerViewController for `UTType.folder`,
 * ios/FilePickingUtils.swift:105-108, and starts the folder's security-scoped
 * access, :41-46), then `File.copy` into it under the file's own name — without
 * any folder the platform's name carries, as the cache's copy is named
 * (`downloadSignedFile`), since the copy makes no folder — " 2", " 3" … after it
 * when that name is taken. The person closing the picker saves nothing and
 * says nothing (`'closed'`).
 */
export async function saveToFiles(source: File, filename: string): Promise<'saved' | 'closed'> {
  let folder: Directory;
  try {
    // The module answers a `Directory` (its src/FileSystem.ts:209-212); its types name the native one.
    folder = new Directory((await Directory.pickDirectoryAsync()).uri);
  } catch (error) {
    if (pickerClosed(error)) return 'closed';
    throw error;
  }
  const base = filename.split(/[\\/]/u).pop()?.trim() ?? '';
  const name = base && base !== '.' && base !== '..' ? base : 'workspace-export';
  const dot = name.lastIndexOf('.');
  const [stem, ending] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  let target = new File(folder, name);
  for (let copy = 2; target.exists && copy < 100; copy += 1) target = new File(folder, `${stem} ${copy}${ending}`);
  source.copy(target);
  return 'saved';
}

/**
 * Download, the one way the app does it (Round 21; the owner's Q7: "Download,
 * then Share, on every document"), for a run's or an item's own file
 * (`FileView`), the run package's Download PDF and Download Excel, and
 * Settings › Data's complete export: the link checked (`signedLink`); on iOS
 * saved into the app's cache (`downloadSignedFile`, the one native download),
 * then into the folder the person picks in Files (`saveToFiles`), and the
 * cache's copy removed; on Android, as before, the link opened. A refusal is
 * thrown to the screen, which says it in its own words. ~~The share sheet~~
 * on iOS until Round 21: that is Share now.
 */
export async function saveSignedFile(file: { downloadUrl: string; filename: string }): Promise<void> {
  const url = signedLink(file.downloadUrl);
  if (Platform.OS !== 'ios') {
    await Linking.openURL(url);
    return;
  }
  const saved = await downloadSignedFile(url, file.filename);
  try {
    await saveToFiles(new File(saved.uri), file.filename);
  } finally {
    if (saved.exists) saved.delete();
  }
}

/**
 * Share (Round 21; the owner's Q7), on iOS only (`sharesFiles`): the file
 * behind a signed link saved into the app's cache, handed to the share sheet
 * as the file itself — `Share.share({ url })` with its local address, never
 * the 5-minute signed link — and removed once shared, or refused. Elsewhere it
 * does nothing: Share is not drawn there. Since 24.12 the iPhone's Download
 * did this (~~`shareSignedFile` as Download~~ until Round 21).
 */
export async function shareSignedFile(file: { downloadUrl: string; filename: string }): Promise<void> {
  const url = signedLink(file.downloadUrl);
  if (!sharesFiles()) return;
  const saved = await downloadSignedFile(url, file.filename);
  try {
    await Share.share({ url: saved.uri });
  } finally {
    if (saved.exists) saved.delete();
  }
}
