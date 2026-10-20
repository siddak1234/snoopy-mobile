import { Linking, Platform, Share } from 'react-native';

import { downloadSignedFile } from './client';

/** Said when the platform answers a file's link the app will not follow: not https. */
export const SIGNED_LINK_UNUSABLE = 'The link to the file cannot be used.';

/**
 * A signed link the app may open or save: https only — anything else, or no
 * address at all, is refused and never followed.
 */
export function signedLink(url: string): string {
  let protocol = '';
  try {
    protocol = new URL(url).protocol;
  } catch {
    // Not an address: refused below.
  }
  if (protocol !== 'https:') throw new Error(SIGNED_LINK_UNUSABLE);
  return url;
}

/**
 * A file behind a signed link, handed on — the one way the app does it, for
 * Settings › Data's complete export (24.12; the owner's build 9: "share or
 * download to files like apple native rather than go to safari") and the run
 * package's Download PDF and Download Excel (round 24 P12): the link checked
 * (`signedLink`), then on iOS saved into the app's cache (`downloadSignedFile`,
 * the one native download), handed to the share sheet and removed once shared,
 * or refused; on Android, whose share sheet carries text, the link opened. A
 * refusal is thrown to the screen, which says it in its own words.
 */
export async function shareSignedFile(file: { downloadUrl: string; filename: string }): Promise<void> {
  const url = signedLink(file.downloadUrl);
  if (Platform.OS !== 'ios') {
    await Linking.openURL(url);
    return;
  }
  const saved = await downloadSignedFile(url, file.filename);
  try {
    await Share.share({ url: saved.uri });
  } finally {
    if (saved.exists) saved.delete();
  }
}
