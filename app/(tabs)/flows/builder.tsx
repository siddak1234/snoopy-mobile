import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, Pattern, Rect } from 'react-native-svg';
import { DotsSixVertical, Plus } from 'phosphor-react-native';

import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { StepCard } from '@/components/nocturne/step-card';
import { ScreenError, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import { em, fonts, layout, radius } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useTheme } from '@/hooks/use-theme';
import { errorTitleFor } from '@/lib/content/screen-states';
import { builderPalette, steps } from '@/lib/fixtures';
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

  /**
   * BUILD-PLAN 8.7 — the canvas renders `manifest.pipeline`.
   *
   * Round 6.6 published it as `AutomationCatalogEntry.pipeline`, which is what
   * makes this item deliverable at all; before that the word appeared nowhere in
   * the three specs except one error description.
   *
   * `template` is optional, and that is a gap rather than a convenience: all
   * three call sites — `flows/index.tsx:60`, `flows/configure.tsx:117`,
   * `flows/detail.tsx:136` — push here with no argument, and the design's own
   * `gBuilder` carries none either. So the builder cannot yet say WHICH
   * automation it is editing. DESIGN-GAPS item 3 listed setup, configure,
   * templates and run detail; it did not list the builder, and this is the same
   * defect. Filed in DESIGN-CONTRACT.md. Until a call site can name a template —
   * which needs 8.6's flow detail wired first — the prototype's steps stand in.
   */
  const { template } = useLocalSearchParams<{ template?: string }>();

  // No template means there is nothing to look up, so no request is made. The
  // read refuses rather than the hook being called conditionally — hooks cannot
  // be — and `unconfigured` is already this codebase's word for "no request to
  // make; show the prototype", which is exactly the situation.
  const catalog = useWorkspaceResource(
    (workspaceId) => {
      if (!template) throw new PlatformNotConfiguredError();
      return readCatalog(workspaceId);
    },
    [template],
  );

  const declared =
    catalog.status === 'ready'
      ? catalog.data.automations.find((a) => a.templateId === template)?.pipeline
      : undefined;
  const canvasSteps = declared ? toPipelineSteps(declared) : steps;

  if (template) {
    if (catalog.status === 'loading') return <ScreenLoading topInset={insets.top} />;
    if (catalog.status === 'offline') {
      return <ScreenOffline onRetry={catalog.reload} topInset={insets.top} />;
    }
    if (catalog.status === 'error') {
      return (
        <ScreenError
          title={errorTitleFor('builder')}
          onRetry={catalog.reload}
          topInset={insets.top}
        />
      );
    }
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
            style={styles.headerPill}
          />
          <PillButton
            label="Save"
            variant="primary"
            height={36}
            fontSize={13}
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
            {canvasSteps.map((step, i) => (
              <View key={i} style={styles.pipeline}>
                <StepCard
                  step={step}
                  outlined
                  trailing={
                    <DotsSixVertical size={17} color={palette.neutral[600]} weight="regular" />
                  }
                />
                {step.more ? (
                  <View style={styles.connector}>
                    <ConnectorStem color={palette.accentRamp[700]} />
                    <View
                      style={[
                        styles.plusCircle,
                        { borderColor: palette.accentRamp[700], backgroundColor: palette.bg },
                      ]}>
                      <Plus size={14} color={palette.accentRamp[300]} weight="regular" />
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
      <View style={[styles.dock, { borderTopColor: palette.divider }]}>
        <SectionLabel fontSize={10.5} track={0.14} style={styles.dockLabel}>
          ADD A STEP
        </SectionLabel>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dockChips}>
          {builderPalette.map((item) => {
            const ChipIcon = item.icon;
            return (
              <View key={item.name} style={[styles.chip, { borderColor: palette.neutral[700] }]}>
                <ChipIcon size={15} color={palette.accentRamp[300]} weight="regular" />
                <Text
                  style={{
                    fontFamily: fonts.medium,
                    fontSize: 12.5,
                    color: palette.neutral[300],
                  }}>
                  {item.name}
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
