import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { FileFrame } from '@/components/files/file-frame';
import { PillButton } from '@/components/nocturne/pill-button';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { OpenRow } from '@/components/open-row';
import { Pressable } from '@/components/pressable';
import { Text } from '@/components/text';
import { fonts, radius, space, typeScale } from '@/constants/theme';
import { activeWorkspaceId, useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { FILE_GONE, FILE_NOT_OPENED, FILE_OPENING, TRY_AGAIN_LABEL } from '@/lib/content/screen-states';
import { readItemFile, readRunFile, type BlockOpen, type RunFile, type RunFileLink } from '@/lib/platform/automations';
import { downloadSignedFile, type SavedFile } from '@/lib/platform/client';
import { PlatformError } from '@/lib/platform/problem';
import { signedLink } from '@/lib/platform/signed-file';
import { viewName } from '@/lib/view/items';

import { NotDrawnFallback } from './fallback';
import { openRoute, type BlockOf, type BlockPlace } from './look';

/** The tallest a picture is drawn, and a scanned page's frame (backend ADR-0048 amendment 1, point 2). */
export const PICTURE_HEIGHT = 360;

type Shown =
  | { kind: 'opening' }
  | { kind: 'picture'; uri: string }
  | { kind: 'page'; uri: string }
  | { kind: 'row'; file: RunFile }
  | { kind: 'notOpened' }
  | { kind: 'gone' };

/** The read the typed target names: a run's file or an item's; any other is none. */
function readerFor(open: BlockOpen | undefined): ((workspaceId: string) => Promise<RunFileLink>) | null {
  if (!open || typeof open !== 'object') return null;
  const { runId, fileId, itemId } = open as Record<string, unknown>;
  const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
  if (open.target === 'run-file' && id(runId) && id(fileId)) return (workspaceId) => readRunFile(workspaceId, runId, fileId);
  if (open.target === 'item-file' && id(itemId)) return (workspaceId) => readItemFile(workspaceId, itemId);
  return null;
}

/**
 * image (backend ADR-0048 amendment 1, point 2): a run's own photo or scanned
 * page, drawn in the page. Its bytes come only from the typed target — the run
 * or the item's file, read in the page's workspace (`readRunFile`,
 * `readItemFile`), its short-lived link checked (`signedLink`, https only) and
 * saved as "view.{jpg|png|pdf}" in a folder made for this one picture
 * (`downloadSignedFile`'s `freshFolder`), as the file page does
 * (`FileView`); never from any address in the block. A JPEG or a PNG is
 * React Native's `Image`, contained, its width the page's and at most 360 pt
 * tall, one image to a screen reader read as the flow's `alt`; a press opens
 * the file's page. A PDF is drawn by the file page's own frame (`FileFrame`:
 * no JavaScript, reading that folder alone), 360 pt tall. The folder is
 * removed when the page closes.
 * The file page's words, its own constants (lib/content/screen-states.ts),
 * never typed here: `FILE_OPENING` while it comes; `FILE_GONE` for a file no
 * longer kept (404); `FILE_NOT_OPENED` for anything else, with
 * `TRY_AGAIN_LABEL`, which reads it again. A file of another type is today's
 * file row. A target this build does not know, or a file row with no page to
 * open, is the fallback sentence, logged as `image`, `open.target`
 * (`NotDrawnFallback`).
 */
export function ImageBlock({
  block,
  testID,
  nested,
  place,
}: {
  block: BlockOf<'image'>;
  testID: string;
  nested: boolean;
  place: BlockPlace & { workspaceId?: string | null };
}) {
  const router = useRouter();
  const session = useSession();
  const { palette } = useTheme();
  const workspaceId = place.workspaceId === undefined ? activeWorkspaceId(session) : place.workspaceId;
  const reader = readerFor(block.open);
  const route = openRoute(block.open, place);
  const [shown, setShown] = useState<Shown>({ kind: 'opening' });
  const [aspect, setAspect] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const cached = useRef<SavedFile | null>(null);
  const live = useRef(true);
  const read = useRef(reader);
  read.current = reader;

  const forget = () => {
    const file = cached.current;
    cached.current = null;
    try {
      if (file?.exists) file.delete();
    } catch {
      // The cache is the system's to clear; nothing a person can act on.
    }
  };

  const load = useCallback(async () => {
    const reading = read.current;
    if (!reading || !workspaceId) {
      setShown({ kind: 'notOpened' });
      return;
    }
    setShown({ kind: 'opening' });
    try {
      const link = await reading(workspaceId);
      const name = viewName(link.file.contentType);
      if (!name) {
        if (live.current) setShown({ kind: 'row', file: link.file });
        return;
      }
      const saved = await downloadSignedFile(signedLink(link.downloadUrl), name, { freshFolder: true });
      if (!live.current) {
        if (saved.exists) saved.delete();
        return;
      }
      forget();
      cached.current = saved;
      setShown(name === 'view.pdf' ? { kind: 'page', uri: saved.uri } : { kind: 'picture', uri: saved.uri });
    } catch (caught) {
      if (!live.current) return;
      setShown(caught instanceof PlatformError && caught.status === 404 ? { kind: 'gone' } : { kind: 'notOpened' });
    }
  }, [workspaceId]);

  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
      forget();
    };
  }, [load]);

  if (!reader) return <NotDrawnFallback type="image" error="open.target" testID={`${testID}-fallback`} />;

  const open = route ? () => router.push(route.href, route.withAnchor ? { withAnchor: true } : undefined) : undefined;
  let body: React.ReactNode;
  if (shown.kind === 'picture') {
    const height = aspect && width > 0 ? Math.min(PICTURE_HEIGHT, width / aspect) : PICTURE_HEIGHT;
    const picture = (
      <Image
        testID={`${testID}-picture`}
        accessible
        accessibilityRole="image"
        accessibilityLabel={block.alt}
        source={{ uri: shown.uri }}
        resizeMode="contain"
        onLoad={(event) => {
          const { width: w, height: h } = event.nativeEvent.source;
          if (w > 0 && h > 0) setAspect(w / h);
        }}
        style={[styles.picture, { height }]}
      />
    );
    body = (
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {open ? (
          <Pressable testID={`${testID}-open`} accessibilityRole="button" accessibilityLabel={block.alt} onPress={open}>
            {picture}
          </Pressable>
        ) : (
          picture
        )}
      </View>
    );
  } else if (shown.kind === 'page') {
    body = (
      <FileFrame
        testID={`${testID}-page`}
        accessibilityLabel={block.alt}
        uri={shown.uri}
        style={[styles.page, { backgroundColor: palette.bg }]}
      />
    );
  } else if (shown.kind === 'row') {
    return open ? (
      nested ? (
        <OpenRow testID={testID} title={shown.file.filename} onPress={open} />
      ) : (
        <SurfaceCard>
          <OpenRow testID={testID} title={shown.file.filename} onPress={open} />
        </SurfaceCard>
      )
    ) : (
      <NotDrawnFallback type="image" error="open.target" testID={`${testID}-fallback`} />
    );
  } else {
    const note = shown.kind === 'opening' ? FILE_OPENING : shown.kind === 'gone' ? FILE_GONE : FILE_NOT_OPENED;
    body = (
      <View testID={`${testID}-${shown.kind}`} style={styles.state}>
        <Text style={[styles.note, { color: palette.neutral[400] }]}>{note}</Text>
        {shown.kind === 'notOpened' ? (
          <PillButton
            testID={`${testID}-retry`}
            label={TRY_AGAIN_LABEL}
            variant="secondary"
            fontSize={typeScale.body.fontSize}
            onPress={() => void load()}
          />
        ) : null}
      </View>
    );
  }
  return (
    <View testID={testID}>
      {nested ? body : <SurfaceCard>{body}</SurfaceCard>}
    </View>
  );
}

const styles = StyleSheet.create({
  picture: { width: '100%', borderRadius: radius.card },
  page: { height: PICTURE_HEIGHT, borderRadius: radius.card, overflow: 'hidden' },
  state: { minHeight: PICTURE_HEIGHT / 3, alignItems: 'center', justifyContent: 'center', gap: space.inner, padding: space.card },
  note: { fontFamily: fonts.regular, ...typeScale.small, textAlign: 'center' },
});
