import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MagnifyingGlass, Plus } from 'phosphor-react-native';

import { IconTile } from '@/components/nocturne/icon-tile';
import { PillButton } from '@/components/nocturne/pill-button';
import { StatusPill } from '@/components/nocturne/status-pill';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, radius, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useWorkflows } from '@/hooks/use-workflows';
import { flowDefs, flowKeys } from '@/lib/fixtures';

/** Workflows list — design `sFlows`, now searchable and identity-aware. */
export default function FlowsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { status: statusOf } = useWorkflows();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const visible = flowKeys.filter((key) => {
    if (!q) return true;
    const def = flowDefs[key];
    return `${def.name} ${def.desc}`.toLowerCase().includes(q);
  });

  return (
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
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
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search workflows"
          placeholderTextColor={palette.neutral[500]}
          selectionColor={palette.accent}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.searchInput, { color: palette.text }]}
        />
      </View>

      <View style={styles.cardList}>
        {visible.map((key) => {
          const def = flowDefs[key];
          return (
            <SurfaceCard
              key={key}
              onPress={() =>
                router.push({ pathname: '/(tabs)/flows/detail', params: { flow: key } })
              }
              style={styles.flowCard}>
              <IconTile icon={def.icon} size={42} iconSize={21} borderRadius={12} bordered />
              <View style={styles.flowBody}>
                <Text style={[styles.flowName, { color: palette.text }]}>{def.name}</Text>
                <Text style={[styles.flowDesc, { color: palette.neutral[400] }]}>{def.desc}</Text>
                <Text style={[styles.flowRuns, { color: palette.neutral[500] }]}>{def.runs}</Text>
              </View>
              <StatusPill label={statusOf(key)} />
            </SurfaceCard>
          );
        })}
        {visible.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MagnifyingGlass size={34} color={palette.neutral[600]} />
            <Text style={[styles.emptyText, { color: palette.neutral[500] }]}>
              No workflows match &quot;{query}&quot;.
            </Text>
          </View>
        ) : null}
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
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    paddingVertical: 0,
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
