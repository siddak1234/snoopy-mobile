import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BlockList } from '@/components/blocks/block-list';
import { Fallback } from '@/components/blocks/fallback';
import { pageParts } from '@/components/blocks/look';
import { FileView } from '@/components/files/file-view';
import { BackCircle } from '@/components/nocturne/back-circle';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { Text } from '@/components/text';
import { em, fonts, layout, typeScale } from '@/constants/theme';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { useTheme } from '@/hooks/use-theme';
import { errorTitleFor } from '@/lib/content/screen-states';
import { readItem, readItemFile } from '@/lib/platform/automations';
import { PlatformNotConfiguredError } from '@/lib/platform/problem';
import { readRemovedSubscriptionsOrNone, readSubscriptions } from '@/lib/platform/runs';

/** The file's height on a page that scrolls on to the item's reading. */
const FILE_HEIGHT = 440;

/**
 * The file an item was made from (Round 19, build 28; the owner's item F4:
 * "Click it and takes you to a page · Shows the original document downloadable
 * · Below it you scroll and get the data in drop downs"), opened from the
 * "{File title}" row of the item's page, in the Flows stack, `?item=`. Top to
 * bottom: Back, the flow's own word for the file (`items.file.title`) and the
 * item's title; the original, drawn in place, with Download (`FileView`,
 * `readItemFile`); then what was read from it, as the platform sent it
 * (`item.blocks`, backend ADR-0048: each section a closed drop-down) — in its
 * flow's `pages.file` order, the viewer and the reading by default; a part
 * this build does not know, the fallback (~~the item's `sections`,
 * `RunSections`~~ until Round 21; ~~on the item's page, "What AI read"~~ until
 * build 28).
 * Loading, offline, error and unavailable as every fetching screen; an item
 * whose flow no longer declares `items` is the error state, its words unknown.
 */
export default function ItemFileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { item: itemId } = useLocalSearchParams<{ item?: string }>();

  const page = useWorkspaceResource(
    async (workspaceId) => {
      if (!itemId) throw new PlatformNotConfiguredError();
      const [read, live] = await Promise.all([readItem(workspaceId, itemId), readSubscriptions(workspaceId)]);
      const own = (rows: typeof live.subscriptions) => rows.find((row) => row.id === read.item.subscriptionId);
      const subscription =
        own(live.subscriptions) ?? own((await readRemovedSubscriptionsOrNone(workspaceId)).subscriptions);
      return { item: read.item, declared: subscription?.items, pages: subscription?.pages };
    },
    [itemId],
  );

  if (page.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (page.status === 'offline') {
    return <ScreenOffline onRetry={() => page.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (page.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('item')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (page.status === 'error' || !page.data.declared) {
    return (
      <ScreenError
        title={errorTitleFor('item')}
        onRetry={() => page.reload()}
        body={busyBody(page)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  const { item, declared, pages } = page.data;
  const parts = pageParts(pages?.file, ['viewer', 'reading'] as const, ['viewer', 'reading']);

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}>
      <View style={styles.headerRow}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text testID="item-file-title" accessibilityRole="header" style={[styles.title, { color: palette.text }]}>
            {declared.file.title}
          </Text>
          <Text testID="item-file-item" style={[styles.sub, { color: palette.neutral[400] }]}>
            {item.title}
          </Text>
        </View>
      </View>

      {parts.map((part, at) =>
        part === 'viewer' ? (
          <FileView
            key={part}
            testID="item-file"
            workspaceId={page.loadedFor}
            read={(workspaceId) => readItemFile(workspaceId, item.id)}
            height={FILE_HEIGHT}
          />
        ) : part === 'reading' ? (
          item.blocks && item.blocks.length > 0 ? (
            <BlockList key={part} testID="item-reading" blocks={item.blocks} />
          ) : null
        ) : (
          <Fallback key={`unknown-${at}`} testID={`item-file-part-${at}`} />
        ),
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: 20, gap: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: fonts.medium,
    fontSize: typeScale.heading.fontSize,
    letterSpacing: em(-0.01, typeScale.heading.fontSize),
  },
  sub: { marginTop: 1, fontFamily: fonts.regular, fontSize: typeScale.body.fontSize },
});
