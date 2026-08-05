import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, CaretRight, HandPalm, SquaresFour, Storefront } from 'phosphor-react-native';

import { AvatarBadge } from '@/components/nocturne/avatar-badge';
import { BrandMark } from '@/components/nocturne/brand-mark';
import { IconTile } from '@/components/nocturne/icon-tile';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { StatCard } from '@/components/nocturne/stat-card';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, status, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { homeStats, recentRuns } from '@/lib/fixtures';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}
      showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.headerRow}>
        <BrandMark height={17} />
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push('/(tabs)/activity')}
            style={({ pressed }) => [
              styles.bellButton,
              { borderColor: palette.neutral[800] },
              pressed && { backgroundColor: withAlpha(palette.text, 0.07) },
            ]}>
            <Bell size={19} color={palette.neutral[300]} weight="regular" />
            <View style={[styles.bellDot, { backgroundColor: palette.accent }]} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/(tabs)/settings')}
            style={({ pressed }) => pressed && { opacity: 0.85 }}>
            <AvatarBadge initials="AK" />
          </Pressable>
        </View>
      </View>

      {/* Greeting */}
      <View>
        <SectionLabel track={0.26} color={palette.accentRamp[300]}>
          AUTOMATION × AI
        </SectionLabel>
        <Text
          style={{
            marginTop: 8,
            fontFamily: fonts.medium,
            fontSize: 26,
            letterSpacing: em(-0.015, 26),
            color: palette.text,
          }}>
          Welcome back, Alex
        </Text>
        <Text
          style={{
            marginTop: 5,
            fontFamily: fonts.regular,
            fontSize: 13.5,
            color: palette.neutral[400],
          }}>
          Your agents ran 128 tasks while you were away.
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {homeStats.map((s) => (
          <StatCard
            key={s.label}
            value={s.value}
            label={s.label}
            valueColor={s.tone === 'ok' ? status.ok : s.tone === 'err' ? status.err : undefined}
          />
        ))}
      </View>

      {/* Approvals banner */}
      <Pressable
        onPress={() => router.push('/(tabs)/activity/approvals')}
        style={({ pressed }) => [
          styles.approvalsBanner,
          {
            borderColor: palette.accentRamp[700],
            backgroundColor: withAlpha(palette.accent, pressed ? 0.15 : 0.09),
          },
        ]}>
        <IconTile icon={HandPalm} size={40} iconSize={21} borderRadius={12} tint={0.16} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.medium, fontSize: 14.5, color: palette.text }}>
            3 items need your review
          </Text>
          <Text
            style={{
              marginTop: 2,
              fontFamily: fonts.regular,
              fontSize: 12,
              color: palette.neutral[400],
            }}>
            Exceptions your agents held for judgment
          </Text>
        </View>
        <CaretRight size={16} color={palette.neutral[500]} weight="regular" />
      </Pressable>

      {/* Quick actions */}
      <View style={styles.actionsRow}>
        <PillButton
          label="Add a solution"
          variant="primary"
          height={46}
          fontSize={14}
          icon={Storefront}
          iconSize={16}
          onPress={() => router.push('/(tabs)/solutions')}
          style={{ flex: 1 }}
        />
        <PillButton
          label="Templates"
          variant="secondary"
          height={46}
          fontSize={14}
          icon={SquaresFour}
          iconSize={16}
          onPress={() => router.push('/(tabs)/flows/templates')}
          style={{ flex: 1 }}
        />
      </View>

      {/* Recent runs */}
      <View>
        <View style={styles.sectionHeader}>
          <SectionLabel>RECENT RUNS</SectionLabel>
          <Text
            onPress={() => router.push('/(tabs)/activity')}
            suppressHighlighting
            style={{
              fontFamily: fonts.regular,
              fontSize: 12.5,
              color: palette.accentRamp[300],
            }}>
            See all
          </Text>
        </View>
        <SurfaceCard level="sm" style={styles.runsCard}>
          {recentRuns.map((r, i) => (
            <Pressable
              key={i}
              onPress={() => router.push('/(tabs)/(home)/run')}
              style={({ pressed }) => [
                styles.runRow,
                { borderBottomColor: palette.divider },
                pressed && { backgroundColor: withAlpha(palette.text, 0.04) },
              ]}>
              <View
                style={[
                  styles.runDot,
                  { backgroundColor: r.tone === 'ok' ? status.ok : status.warnText },
                ]}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: palette.text }}>
                  {r.name}
                </Text>
                <Text
                  style={{
                    marginTop: 1,
                    fontFamily: fonts.regular,
                    fontSize: 12,
                    color: palette.neutral[400],
                  }}>
                  {r.meta}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: fonts.regular,
                  fontSize: 11.5,
                  color: palette.neutral[500],
                }}>
                {r.time}
              </Text>
            </Pressable>
          ))}
        </SurfaceCard>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 99,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  approvalsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 15,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  runsCard: {
    marginTop: 10,
    overflow: 'hidden',
  },
  runRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  runDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
  },
});
