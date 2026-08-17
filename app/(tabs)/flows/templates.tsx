import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SquaresFour } from 'phosphor-react-native';

import { BackCircle } from '@/components/nocturne/back-circle';
import { FilterChip } from '@/components/nocturne/filter-chip';
import { IconTile } from '@/components/nocturne/icon-tile';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ScreenError, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import { em, fonts, layout } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useTheme } from '@/hooks/use-theme';
import { errorTitleFor } from '@/lib/content/screen-states';
import { templateFilters, templates } from '@/lib/fixtures';
import { readCatalog } from '@/lib/platform/catalog';
import { toCategories, toTemplates, type TemplateView } from '@/lib/view/catalog';

export default function TemplatesScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cardWidth = (width - layout.screenX * 2 - 10) / 2;
  const [category, setCategory] = useState('All');

  const catalog = useWorkspaceResource(readCatalog);

  // `unconfigured` keeps the prototype's own content on screen. That is the one
  // state where fixtures are still correct — there is no backend to disagree
  // with — and it is why the fixture import survives here for now. Whether it
  // survives at all is an owner decision recorded in DESIGN-CONTRACT.md, and
  // deleting these two fallbacks is the whole of the change when it is made.
  const items: TemplateView[] =
    catalog.status === 'ready'
      ? toTemplates(catalog.data)
      : // The prototype had no stable identity — it keyed by array position — so
        // the name stands in for one here. Live entries carry a real templateId.
        templates.map((t) => ({ ...t, templateId: t.name }));
  const filters = catalog.status === 'ready' ? toCategories(catalog.data) : templateFilters;

  if (catalog.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (catalog.status === 'offline') {
    return <ScreenOffline onRetry={catalog.reload} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (catalog.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('templates')}
        onRetry={catalog.reload}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const visible = items.filter((t) => category === 'All' || t.cat === category);

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <Text style={[styles.h1, { color: palette.text }]}>Templates</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {filters.map((f) => (
          <FilterChip key={f} label={f} active={f === category} onPress={() => setCategory(f)} />
        ))}
      </ScrollView>
      <View style={styles.grid}>
        {visible.map((t) => (
          <SurfaceCard
            key={t.templateId}
            onPress={() =>
              // Each card opens ITS template — DESIGN-GAPS item 3's second case.
              router.push({
                pathname: '/(tabs)/flows/configure',
                params: { template: t.templateId },
              })
            }
            style={[styles.card, { width: cardWidth }]}>
            <IconTile icon={t.icon} size={38} iconSize={19} borderRadius={11} bordered />
            <Text style={[styles.cardName, { color: palette.text }]}>{t.name}</Text>
            <View style={styles.cardFoot}>
              <Text style={[styles.cardCat, { color: palette.neutral[500] }]}>{t.cat}</Text>
              <Text style={[styles.cardUse, { color: palette.accentRamp[300] }]}>Use →</Text>
            </View>
          </SurfaceCard>
        ))}
      </View>
      {visible.length === 0 ? (
        <View style={styles.emptyWrap}>
          <SquaresFour size={34} color={palette.neutral[600]} />
          <Text style={[styles.emptyText, { color: palette.neutral[500] }]}>
            No {category} templates yet.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenX,
    paddingBottom: 20,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  h1: {
    fontFamily: fonts.medium,
    fontSize: 22,
    letterSpacing: em(-0.01, 22),
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    padding: 14,
    gap: 9,
  },
  cardName: {
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 14 * 1.25,
  },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardCat: {
    fontFamily: fonts.regular,
    fontSize: 11,
  },
  cardUse: {
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  emptyWrap: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    textAlign: 'center',
  },
});
