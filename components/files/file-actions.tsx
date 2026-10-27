import { DownloadSimple, ShareNetwork } from 'phosphor-react-native';
import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PillButton } from '@/components/nocturne/pill-button';
import { Text } from '@/components/text';
import { fonts, iconSize, space, status, typeScale } from '@/constants/theme';
import { DOWNLOAD_FAILED, SHARE_FAILED, SHARE_LABEL } from '@/lib/content/screen-states';
import { sharesFiles } from '@/lib/platform/signed-file';

/**
 * One press: its words (and, while it works, `busyLabel`'s), its testID, and
 * what it does — the words of its refusal, or null.
 */
export type DownloadAction = {
  label: string;
  testID: string;
  run: () => Promise<string | null>;
  busyLabel?: string;
  disabled?: boolean;
};

/**
 * Download, then Share, on every document (Round 21; the owner's Q7 and build
 * 30 note F4), one part for all five places: a run's file and an item's file
 * (`FileView`), the run package's PDF and Excel (the run page and the package
 * page), and Settings › Data's complete export and workspace summary — the
 * website's `FileActions`. Download saves the file (`saveSignedFile`); Share
 * hands the file itself to the share sheet, never its link, and is drawn only
 * where the phone can share a file (`sharesFiles`: iOS). A refusal is said
 * under the buttons in its own words ("Could not download. Try again.",
 * "Could not share. Try again." when a press throws); one press at a time.
 */
export function FileActions({
  downloads,
  share,
  testID,
  stacked = false,
}: {
  downloads: readonly DownloadAction[];
  /** What Share does, or null where the place has none. */
  share: { testID: string; run: () => Promise<string | null>; busyLabel?: string } | null;
  testID: string;
  /** One button a line, the page's width each (the file pages); else side by side. */
  stacked?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const working = useRef(false);

  const act = async (testID: string, work: () => Promise<string | null>, failed: string) => {
    if (working.current) return;
    working.current = true;
    setBusy(testID);
    setError(null);
    try {
      setError(await work());
    } catch {
      setError(failed);
    } finally {
      working.current = false;
      setBusy(null);
    }
  };

  return (
    <View testID={testID} style={styles.wrap}>
      <View style={stacked ? styles.stack : styles.row}>
        {downloads.map((download) => (
          <PillButton
            key={download.testID}
            testID={download.testID}
            label={busy === download.testID && download.busyLabel ? download.busyLabel : download.label}
            variant="secondary"
            fontSize={typeScale.label.fontSize}
            icon={DownloadSimple}
            iconSize={iconSize.button}
            disabled={busy !== null || download.disabled === true}
            style={stacked ? undefined : styles.grow}
            onPress={() => void act(download.testID, download.run, DOWNLOAD_FAILED)}
          />
        ))}
        {share && sharesFiles() ? (
          <PillButton
            testID={share.testID}
            label={busy === share.testID && share.busyLabel ? share.busyLabel : SHARE_LABEL}
            variant="secondary"
            fontSize={typeScale.label.fontSize}
            icon={ShareNetwork}
            iconSize={iconSize.button}
            disabled={busy !== null}
            style={stacked ? undefined : styles.grow}
            onPress={() => void act(share.testID, share.run, SHARE_FAILED)}
          />
        ) : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: status.err }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.inner },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.inner },
  stack: { gap: space.inner },
  grow: { flexGrow: 1 },
  error: { fontFamily: fonts.regular, ...typeScale.small },
});
