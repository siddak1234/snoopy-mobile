import { useRouter } from 'expo-router';
import { Warning } from 'phosphor-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, status, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { approvalDoneText, approvals, type ApprovalItem } from '@/lib/fixtures';

type Decision = 'approved' | 'rejected';

function ApprovalCard({
  item,
  decision,
  onDecide,
}: {
  item: ApprovalItem;
  decision: Decision | undefined;
  onDecide: (d: Decision) => void;
}) {
  const { palette } = useTheme();
  return (
    <SurfaceCard style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={[styles.kicker, { color: palette.accentRamp[300] }]}>{item.workflow}</Text>
        <Text style={[styles.time, { color: palette.neutral[500] }]}>{item.time}</Text>
      </View>
      <Text style={[styles.title, { color: palette.text }]}>{item.title}</Text>
      <View style={styles.callout}>
        <Warning size={16} color={status.warnText} style={styles.calloutIcon} />
        <Text style={styles.calloutText}>{item.why}</Text>
      </View>
      {decision ? (
        <Text style={[styles.doneNote, { color: palette.accentRamp[300] }]}>
          {approvalDoneText[decision]}
        </Text>
      ) : (
        <View style={styles.actions}>
          <Pressable
            onPress={() => onDecide('approved')}
            style={({ pressed }) => [
              styles.actionBtn,
              { borderColor: palette.accent },
              pressed && { backgroundColor: withAlpha(palette.accent, 0.12) },
            ]}>
            <Text style={[styles.actionLabel, { color: palette.accent }]}>Approve</Text>
          </Pressable>
          <Pressable
            onPress={() => onDecide('rejected')}
            style={({ pressed }) => [
              styles.actionBtn,
              { borderColor: palette.neutral[700] },
              pressed && { backgroundColor: withAlpha(palette.text, 0.06) },
            ]}>
            <Text style={[styles.actionLabel, { color: palette.neutral[300] }]}>Reject</Text>
          </Pressable>
        </View>
      )}
    </SurfaceCard>
  );
}

export default function ApprovalsScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});

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
        <Text style={[styles.h1, { color: palette.text }]}>Needs review</Text>
        <View style={[styles.badge, { backgroundColor: withAlpha(palette.accent, 0.16) }]}>
          <Text style={[styles.badgeLabel, { color: palette.accentRamp[200] }]}>3</Text>
        </View>
      </View>
      {approvals.map((item, i) => (
        <ApprovalCard
          key={i}
          item={item}
          decision={decisions[i]}
          onDecide={(d) => setDecisions((prev) => ({ ...prev, [i]: d }))}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layout.screenX,
    paddingBottom: 16,
  },
  h1: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 22,
    letterSpacing: em(-0.01, 22),
  },
  badge: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
  },
  card: {
    marginHorizontal: layout.screenX,
    marginBottom: 12,
    padding: layout.cardPad,
    gap: 10,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kicker: {
    fontFamily: fonts.regular,
    fontSize: 10.5,
    letterSpacing: em(0.14, 10.5),
  },
  time: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  callout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: status.warnCalloutBg,
    borderWidth: 1,
    borderColor: status.warnCalloutBorder,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  calloutIcon: {
    marginTop: 1,
  },
  calloutText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 13 * 1.45,
    color: status.warnText,
  },
  doneNote: {
    fontFamily: fonts.medium,
    fontSize: 13.5,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionLabel: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
});
