import { useRouter } from 'expo-router';
import { BellRinging } from 'phosphor-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, status, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { notifications, type NotificationItem } from '@/lib/fixtures';

/** Notifications inbox (design `sNotifs`) with the push-priming card. */
export default function NotificationsScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // The design's priming card is dismiss-only on both buttons; a real iOS
  // permission request needs expo-notifications, which is not installed.
  const [askPush, setAskPush] = useState(true);
  const [allRead, setAllRead] = useState(false);

  const toneColor = (tone: NotificationItem['tone']) =>
    tone === 'ok'
      ? status.ok
      : tone === 'warn'
        ? status.warnText
        : tone === 'err'
          ? status.err
          : palette.accentRamp[300];

  const open = (item: NotificationItem) => {
    if (item.target === 'run') {
      router.push({
        pathname: '/(tabs)/(home)/run',
        params: { variant: item.runVariant ?? 'held' },
      });
    } else if (item.target === 'activity') {
      router.push('/(tabs)/activity');
    } else {
      router.push('/(tabs)/settings');
    }
  };

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
        <Text style={[styles.title, { color: palette.text }]}>Notifications</Text>
        <Text
          onPress={() => setAllRead(true)}
          suppressHighlighting
          style={[styles.markAll, { color: palette.accentRamp[300] }]}>
          Mark all read
        </Text>
      </View>

      {askPush ? (
        <View
          style={[
            styles.pushCard,
            {
              borderColor: palette.accentRamp[700],
              backgroundColor: withAlpha(palette.accent, 0.09),
            },
          ]}>
          <View style={styles.pushHead}>
            <BellRinging size={21} color={palette.accentRamp[300]} />
            <Text style={[styles.pushTitle, { color: palette.text }]}>
              Know the moment something needs you
            </Text>
          </View>
          <Text style={[styles.pushBody, { color: palette.neutral[400] }]}>
            Push alerts for held runs and failures — nothing else. You can change this anytime in
            Settings.
          </Text>
          <View style={styles.pushActions}>
            <PillButton
              label="Allow notifications"
              variant="primary"
              height={42}
              fontSize={13.5}
              onPress={() => setAskPush(false)}
              style={styles.pushBtn}
            />
            <PillButton
              label="Not now"
              variant="plain"
              height={42}
              fontSize={13.5}
              onPress={() => setAskPush(false)}
              style={styles.pushBtn}
            />
          </View>
        </View>
      ) : null}

      <SurfaceCard style={styles.list}>
        {notifications.map((item, i) => {
          const IconCmp = item.icon;
          const unread = item.unread && !allRead;
          return (
            <Pressable
              key={item.title}
              onPress={() => open(item)}
              style={({ pressed }) => [
                styles.row,
                i < notifications.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: palette.divider,
                },
                pressed && { backgroundColor: withAlpha(palette.text, 0.04) },
              ]}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: unread ? palette.accent : 'transparent' },
                ]}
              />
              <IconCmp size={19} color={toneColor(item.tone)} style={styles.rowIcon} />
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: palette.text }]}>{item.title}</Text>
                <Text style={[styles.rowDesc, { color: palette.neutral[400] }]}>{item.desc}</Text>
              </View>
              <Text style={[styles.rowTime, { color: palette.neutral[500] }]}>{item.time}</Text>
            </Pressable>
          );
        })}
      </SurfaceCard>
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
  title: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 22,
    letterSpacing: em(-0.01, 22),
  },
  markAll: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
  },
  pushCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 15,
    gap: 10,
  },
  pushHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  pushTitle: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14.5,
  },
  pushBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 13 * 1.5,
  },
  pushActions: {
    flexDirection: 'row',
    gap: 10,
  },
  pushBtn: {
    flex: 1,
  },
  list: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    marginTop: 6,
  },
  rowIcon: {
    marginTop: 1,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  rowDesc: {
    marginTop: 1,
    fontFamily: fonts.regular,
    fontSize: 12.5,
  },
  rowTime: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
  },
});
