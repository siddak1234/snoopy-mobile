import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, typeScale } from '@/constants/theme';
import { useTheme, type ThemeMode } from '@/hooks/use-theme';

const APPEARANCE: { label: string; mode: ThemeMode }[] = [
  { label: 'Dark', mode: 'dark' },
  { label: 'Light', mode: 'light' },
  { label: 'Auto', mode: 'auto' },
];

/** Settings › Appearance (24.12, the owner's decision 10): the theme, moved here from the old single Settings screen. */
export default function AppearanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette, mode, setMode } = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <Text style={[styles.title, { color: palette.text }]}>Appearance</Text>
      </View>
      <SurfaceCard style={styles.segCard}>
        {APPEARANCE.map((opt) => {
          const active = mode === opt.mode;
          return (
            <Pressable
              key={opt.mode}
              onPress={() => setMode(opt.mode)}
              style={[styles.segOpt, active && { borderWidth: 1, borderColor: palette.accent }]}>
              <Text
                style={{
                  fontFamily: active ? fonts.medium : fonts.regular,
                  fontSize: typeScale.body.fontSize,
                  color: active ? palette.accent : palette.neutral[400],
                }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </SurfaceCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: 32, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: fonts.medium, fontSize: typeScale.heading.fontSize, letterSpacing: em(-0.01, typeScale.heading.fontSize) },
  segCard: {
    flexDirection: 'row',
    gap: 4,
    padding: 6,
  },
  segOpt: {
    flex: 1,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
