import { useRouter } from 'expo-router';
import { CaretRight, CrownSimple, MagnifyingGlass } from 'phosphor-react-native';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterChip } from '@/components/nocturne/filter-chip';
import { IconTile } from '@/components/nocturne/icon-tile';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, status, withAlpha } from '@/constants/theme';
import { useSolutions } from '@/hooks/use-solutions';
import { useTheme } from '@/hooks/use-theme';
import { solutionDefs, solutionFilters } from '@/lib/fixtures';

export default function SolutionsScreen() {
  const { palette } = useTheme();
  const { active, toggle, activeCount, planTotal } = useSolutions();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState('All');
  /** Index of the solution pending removal (design rmIdx). */
  const [removeIndex, setRemoveIndex] = useState<number | null>(null);

  const visible = solutionDefs
    .map((sol, index) => ({ sol, index }))
    .filter(({ sol }) => category === 'All' || sol.cat === category);
  const removeSolution = removeIndex == null ? null : solutionDefs[removeIndex];

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}
      showsVerticalScrollIndicator={false}>
      <View>
        <Text style={[styles.h1, { color: palette.text }]}>Solutions</Text>
        <Text style={[styles.sub, { color: palette.neutral[400] }]}>
          Prebuilt automations, proven at scale. Add one to your plan and it&apos;s live in minutes.
        </Text>
      </View>

      <Pressable
        onPress={() => router.push('/(tabs)/settings')}
        style={({ pressed }) => [
          styles.planBanner,
          {
            borderColor: palette.accentRamp[700],
            backgroundColor: withAlpha(palette.accent, pressed ? 0.15 : 0.09),
          },
        ]}>
        <CrownSimple size={20} color={palette.accentRamp[300]} />
        <View style={styles.planBody}>
          <Text style={[styles.planTitle, { color: palette.text }]}>
            Growth plan · {planTotal}/mo
          </Text>
          <Text style={[styles.planSub, { color: palette.neutral[400] }]}>
            {activeCount} active · manage in Settings
          </Text>
        </View>
        <CaretRight size={15} color={palette.neutral[500]} />
      </Pressable>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {solutionFilters.map((f) => (
          <FilterChip key={f} label={f} active={f === category} onPress={() => setCategory(f)} />
        ))}
      </ScrollView>

      <View style={styles.list}>
        {visible.map(({ sol, index: i }) => {
          const added = !!active[i];
          return (
            <SurfaceCard key={sol.name} style={styles.card}>
              <IconTile icon={sol.icon} size={42} iconSize={21} borderRadius={12} bordered />
              <View style={styles.cardBody}>
                <Text style={[styles.cardName, { color: palette.text }]}>{sol.name}</Text>
                <Text style={[styles.cardDesc, { color: palette.neutral[400] }]}>{sol.desc}</Text>
                <Text style={[styles.cardMeta, { color: palette.neutral[500] }]}>
                  {sol.cat} · ${sol.price}/mo
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  added
                    ? setRemoveIndex(i)
                    : router.push({ pathname: '/(tabs)/solutions/setup', params: { index: String(i) } })
                }
                style={({ pressed }) => [
                  styles.addBtn,
                  { borderColor: added ? palette.neutral[700] : palette.accent },
                  pressed && { backgroundColor: withAlpha(palette.accent, 0.1) },
                ]}>
                <Text
                  style={{
                    fontFamily: fonts.medium,
                    fontSize: 13,
                    color: added ? palette.neutral[400] : palette.accent,
                  }}>
                  {added ? 'Added ✓' : 'Add'}
                </Text>
              </Pressable>
            </SurfaceCard>
          );
        })}
        {visible.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MagnifyingGlass size={34} color={palette.neutral[600]} />
            <Text style={[styles.emptyText, { color: palette.neutral[500] }]}>
              No {category} solutions yet — more are on the way.
            </Text>
          </View>
        ) : null}
      </View>

      <Modal
        visible={removeIndex != null}
        transparent
        animationType="fade"
        onRequestClose={() => setRemoveIndex(null)}>
        <View style={[styles.overlay, { backgroundColor: status.overlay }]}>
          <View
            style={[
              styles.dialog,
              { backgroundColor: palette.surface, borderColor: palette.neutral[800] },
            ]}>
            <Text style={[styles.dialogTitle, { color: palette.text }]}>
              Remove {removeSolution?.name}?
            </Text>
            <Text style={[styles.dialogBody, { color: palette.neutral[400] }]}>
              Workflows built on it pause immediately. ${removeSolution?.price}/mo comes off your
              next invoice (Sep 1). Its QuickBooks connection stays on your workspace.
            </Text>
            <View style={styles.dialogActions}>
              <Pressable
                onPress={() => setRemoveIndex(null)}
                style={({ pressed }) => [
                  styles.dialogBtn,
                  { borderColor: palette.neutral[700] },
                  pressed && { backgroundColor: withAlpha(palette.text, 0.06) },
                ]}>
                <Text style={[styles.dialogBtnLabel, { color: palette.text }]}>Keep it</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (removeIndex != null) toggle(removeIndex);
                  setRemoveIndex(null);
                }}
                style={({ pressed }) => [
                  styles.dialogBtn,
                  { borderColor: status.err },
                  pressed && { backgroundColor: status.errCalloutBg },
                ]}>
                <Text style={[styles.dialogBtnLabel, { color: status.err }]}>Remove</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenX,
    paddingBottom: 20,
    gap: 14,
  },
  h1: {
    fontFamily: fonts.medium,
    fontSize: 26,
    letterSpacing: em(-0.015, 26),
  },
  sub: {
    marginTop: 5,
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.55,
  },
  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  planBody: {
    flex: 1,
  },
  planTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  planSub: {
    marginTop: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
  },
  list: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: layout.cardPad,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardName: {
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  cardDesc: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 12.5,
  },
  cardMeta: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: 11.5,
  },
  addBtn: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  dialog: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  dialogTitle: {
    fontFamily: fonts.medium,
    fontSize: 16,
  },
  dialogBody: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.5,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  dialogBtn: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogBtnLabel: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
});
