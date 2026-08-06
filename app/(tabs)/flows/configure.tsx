import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { IconTile } from '@/components/nocturne/icon-tile';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { TextField } from '@/components/nocturne/text-field';
import { em, fonts, layout, status, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { templateConfigure } from '@/lib/fixtures';

/** Template → Builder handoff (design `sConfigure`). */
export default function ConfigureTemplateScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(templateConfigure.defaultName);
  const [connected, setConnected] = useState(false);
  const ConnectionIcon = templateConfigure.connection.icon;

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
        <Text style={[styles.title, { color: palette.text }]}>New from template</Text>
      </View>

      <SurfaceCard style={styles.summary}>
        <IconTile icon={templateConfigure.icon} size={42} iconSize={21} borderRadius={12} bordered />
        <View style={styles.summaryBody}>
          <Text style={[styles.summaryName, { color: palette.text }]}>
            {templateConfigure.name}
          </Text>
          <Text style={[styles.summaryMeta, { color: palette.neutral[400] }]}>
            {templateConfigure.meta}
          </Text>
        </View>
      </SurfaceCard>

      <TextField label="Workflow name" value={name} onChangeText={setName} />

      <View>
        <SectionLabel>REQUIRED CONNECTION</SectionLabel>
        <SurfaceCard style={styles.connectionCard}>
          <ConnectionIcon size={20} color={palette.accentRamp[300]} />
          <View style={styles.connectionBody}>
            <Text style={[styles.connectionName, { color: palette.text }]}>
              {templateConfigure.connection.name}
            </Text>
            <Text
              style={[
                styles.connectionSub,
                { color: connected ? status.ok : status.warnText },
              ]}>
              {connected ? 'acme-books · linked via OAuth' : 'Required · sign in with OAuth once'}
            </Text>
          </View>
          <Pressable
            onPress={() => setConnected(true)}
            style={({ pressed }) => [
              styles.connectBtn,
              { borderColor: connected ? palette.neutral[700] : palette.accent },
              pressed && !connected && { backgroundColor: withAlpha(palette.accent, 0.1) },
            ]}>
            <Text
              style={{
                fontFamily: fonts.medium,
                fontSize: 12.5,
                color: connected ? status.ok : palette.accent,
              }}>
              {connected ? 'Connected ✓' : 'Connect'}
            </Text>
          </Pressable>
        </SurfaceCard>
      </View>

      <View>
        <SectionLabel>STEPS PRELOADED IN BUILDER</SectionLabel>
        <SurfaceCard style={styles.stepsCard}>
          {templateConfigure.steps.map((step, i) => {
            const StepIcon = step.icon;
            return (
              <View
                key={step.title}
                style={[
                  styles.stepRow,
                  i < templateConfigure.steps.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: palette.divider,
                  },
                ]}>
                <StepIcon size={19} color={palette.accentRamp[300]} />
                <Text style={[styles.stepTitle, { color: palette.text }]}>{step.title}</Text>
                <SectionLabel fontSize={10.5} color={palette.neutral[500]}>
                  {step.kicker}
                </SectionLabel>
              </View>
            );
          })}
        </SurfaceCard>
      </View>

      <PillButton
        label="Create & open in Builder"
        variant="primary"
        gap={8}
        onPress={() => router.push('/(tabs)/flows/builder')}
      />
      <Text style={[styles.footnote, { color: palette.neutral[600] }]}>
        {templateConfigure.footnote}
      </Text>
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
    fontFamily: fonts.medium,
    fontSize: 22,
    letterSpacing: em(-0.01, 22),
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: layout.cardPad,
  },
  summaryBody: {
    flex: 1,
  },
  summaryName: {
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  summaryMeta: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 12.5,
  },
  connectionCard: {
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  connectionBody: {
    flex: 1,
    minWidth: 0,
  },
  connectionName: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  connectionSub: {
    marginTop: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  connectBtn: {
    height: 32,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepsCard: {
    marginTop: 9,
    overflow: 'hidden',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  stepTitle: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 13.5,
  },
  footnote: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 11.5,
  },
});
