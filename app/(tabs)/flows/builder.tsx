import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, Pattern, Rect } from 'react-native-svg';
import { DotsSixVertical, FlowArrow, Plus } from 'phosphor-react-native';

import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { StepCard } from '@/components/nocturne/step-card';
import { ScreenEmpty, ScreenError, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import { em, fonts, layout, radius } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useTheme } from '@/hooks/use-theme';
import { BUILDER_PALETTE_NAMES, errorTitleFor } from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { PlatformNotConfiguredError } from '@/lib/platform/problem';
import { toPipelineSteps } from '@/lib/view/pipeline';

/** Dashed connector stem between step cards (CSS: 12px, 1.5px dashed accent-700). */
function ConnectorStem({ color }: { color: string }) {
  return (
    <Svg width={2} height={12}>
      <Line x1={1} y1={0} x2={1} y2={12} stroke={color} strokeWidth={1.5} strokeDasharray={[3, 3]} />
    </Svg>
  );
}

export default function BuilderScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /**
   * BUILD-PLAN 8.7 — the canvas renders `manifest.pipeline`.
   *
   * Round 6.6 published it as `AutomationCatalogEntry.pipeline`, which is what
   * makes this item deliverable at all; before that the word appeared nowhere in
   * the three specs except one error description.
   *
   * Every supported caller supplies `template`. A direct or stale link without
   * one is refused below instead of drawing an unowned canvas, and the New
   * action routes through Templates so a person chooses a published identity.
   */
  const { template } = useLocalSearchParams<{ template?: string }>();

  // No template means there is nothing to look up. The read refuses rather than
  // the hook being called conditionally — hooks cannot be — while the screen
  // below sends the person to the real template selector.
  const catalog = useWorkspaceResource(
    (workspaceId) => {
      if (!template) throw new PlatformNotConfiguredError();
      return readCatalog(workspaceId);
    },
    [template],
  );

  const entry =
    catalog.status === 'ready'
      ? catalog.data.automations.find((automation) => automation.templateId === template)
      : undefined;
  const canvasSteps = toPipelineSteps(entry?.pipeline);

  if (!template) {
    return (
      <ScreenEmpty
        icon={<FlowArrow size={40} />}
        title="Choose a template"
        body="The Builder opens a published workflow pipeline after you choose its template."
        action={{
          label: "Browse templates",
          onPress: () => router.replace('/(tabs)/flows/templates'),
        }}
        topInset={insets.top}
      />
    );
  }

  if (catalog.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (catalog.status === 'offline') {
    return <ScreenOffline onRetry={catalog.reload} topInset={insets.top} />;
  }
  if (catalog.status === 'error' || catalog.status === 'unconfigured') {
    return (
      <ScreenError
        title={errorTitleFor('builder')}
        onRetry={catalog.reload}
        topInset={insets.top}
      />
    );
  }
  if (!entry) {
    return (
      <ScreenEmpty
        icon={<FlowArrow size={40} />}
        title="Template unavailable"
        body="This template is not in the workspace's published catalog."
        action={{
          label: "Browse templates",
          onPress: () => router.replace('/(tabs)/flows/templates'),
        }}
        topInset={insets.top}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
        ]}>
        <Text
          style={{
            fontFamily: fonts.medium,
            fontSize: 26,
            letterSpacing: em(-0.015, 26),
            color: palette.text,
          }}>
          Builder
        </Text>
        <View style={styles.headerActions}>
          <PillButton
            label="Test run"
            variant="secondary"
            height={36}
            fontSize={13}
            disabled
            style={styles.headerPill}
          />
          <PillButton
            label="Save"
            variant="primary"
            height={36}
            fontSize={13}
            disabled
            style={styles.headerPill}
          />
        </View>
      </View>

      {/* Canvas: dot grid behind a scrolling step pipeline */}
      <View style={styles.canvas}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <Pattern id="builder-dots" width={18} height={18} patternUnits="userSpaceOnUse">
              <Circle cx={9} cy={9} r={1} fill={palette.neutral[800]} />
            </Pattern>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill="url(#builder-dots)" />
        </Svg>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.canvasContent}>
          <View style={styles.pipeline}>
            {canvasSteps.map((step) => (
              <View key={step.id} style={styles.pipeline}>
                <StepCard
                  step={step}
                  outlined
                  trailing={
                    <View
                      accessible
                      accessibilityRole="button"
                      accessibilityLabel="Reorder unavailable in read-only Builder"
                      accessibilityState={{ disabled: true }}>
                      <DotsSixVertical size={17} color={palette.neutral[600]} weight="regular" />
                    </View>
                  }
                />
                {step.more ? (
                  <View style={styles.connector}>
                    <ConnectorStem color={palette.accentRamp[700]} />
                    <View
                      accessible
                      accessibilityRole="button"
                      accessibilityLabel="Insert step unavailable in read-only Builder"
                      accessibilityState={{ disabled: true }}
                      style={[
                        styles.plusCircle,
                        { borderColor: palette.neutral[700], backgroundColor: palette.bg },
                      ]}>
                      <Plus size={14} color={palette.neutral[600]} weight="regular" />
                    </View>
                    <ConnectorStem color={palette.accentRamp[700]} />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Bottom dock: step palette */}
      <View style={[styles.dock, { borderTopColor: palette.divider }]} pointerEvents="none">
        <SectionLabel fontSize={10.5} track={0.14} style={styles.dockLabel}>
          ADD A STEP
        </SectionLabel>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dockChips}>
          {BUILDER_PALETTE_NAMES.map((item) => {
            return (
              <View
                key={item}
                accessible
                accessibilityRole="button"
                accessibilityLabel={`${item} unavailable in read-only Builder`}
                accessibilityState={{ disabled: true }}
                style={[styles.chip, { borderColor: palette.neutral[700] }]}>
                <Plus size={15} color={palette.neutral[600]} weight="regular" />
                <Text
                  style={{
                    fontFamily: fonts.medium,
                    fontSize: 12.5,
                    color: palette.neutral[300],
                  }}>
                  {item}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenX,
    paddingBottom: 12,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerPill: {
    paddingHorizontal: 14,
  },
  canvas: {
    flex: 1,
  },
  canvasContent: {
    paddingTop: 12,
    paddingHorizontal: layout.screenX,
    paddingBottom: 16,
  },
  pipeline: {
    flexDirection: 'column',
  },
  connector: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  plusCircle: {
    width: 26,
    height: 26,
    borderRadius: 99,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dock: {
    paddingTop: 10,
    paddingHorizontal: layout.screenX,
    paddingBottom: 14,
    borderTopWidth: 1,
    opacity: 0.5,
  },
  dockLabel: {
    marginBottom: 8,
  },
  dockChips: {
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
