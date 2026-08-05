import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MagnifyingGlass, Plus } from 'phosphor-react-native';

import { IconTile } from '@/components/nocturne/icon-tile';
import { PillButton } from '@/components/nocturne/pill-button';
import { StatusPill } from '@/components/nocturne/status-pill';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, radius, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { flows } from '@/lib/fixtures';

/** Workflows list — design `sFlows` block in Screen.dc.html. */
export default function FlowsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();

  return (
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: palette.text }]}>Workflows</Text>
        <View style={styles.titleActions}>
          <PillButton
            label="Templates"
            variant="secondary"
            height={36}
            fontSize={13}
            style={styles.headerPill}
            onPress={() => router.push('/(tabs)/flows/templates')}
          />
          <PillButton
            label="New"
            variant="primary"
            height={36}
            fontSize={13}
            icon={Plus}
            iconSize={14}
            gap={5}
            style={styles.headerPill}
            onPress={() => router.push('/(tabs)/flows/builder')}
          />
        </View>
      </View>

      <View
        style={[
          styles.search,
          {
            borderColor: palette.neutral[800],
            backgroundColor: withAlpha(palette.surface, 0.6),
          },
        ]}>
        <MagnifyingGlass size={17} color={palette.neutral[500]} />
        <Text style={[styles.searchText, { color: palette.neutral[500] }]}>Search workflows</Text>
      </View>

      <View style={styles.cardList}>
        {flows.map((f) => (
          <SurfaceCard
            key={f.name}
            onPress={() => router.push('/(tabs)/flows/detail')}
            style={styles.flowCard}>
            <IconTile icon={f.icon} size={42} iconSize={21} borderRadius={12} bordered />
            <View style={styles.flowBody}>
              <Text style={[styles.flowName, { color: palette.text }]}>{f.name}</Text>
              <Text style={[styles.flowDesc, { color: palette.neutral[400] }]}>{f.desc}</Text>
              <Text style={[styles.flowRuns, { color: palette.neutral[500] }]}>{f.runs}</Text>
            </View>
            <StatusPill label={f.status} />
          </SurfaceCard>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenX,
    paddingBottom: 20,
    gap: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: 26,
    letterSpacing: em(-0.015, 26),
  },
  titleActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerPill: {
    paddingHorizontal: 14,
  },
  search: {
    height: 44,
    borderRadius: radius.input,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
  },
  searchText: {
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  cardList: {
    gap: 10,
  },
  flowCard: {
    padding: layout.cardPad,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  flowBody: {
    flex: 1,
    minWidth: 0,
  },
  flowName: {
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  flowDesc: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    marginTop: 2,
  },
  flowRuns: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    marginTop: 4,
  },
});
