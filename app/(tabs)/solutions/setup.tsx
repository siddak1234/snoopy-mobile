import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BellRinging,
  CaretRight,
  CurrencyDollar,
  EnvelopeSimple,
  HandPalm,
  PlugsConnected,
  Tray,
} from 'phosphor-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { NocToggle } from '@/components/nocturne/noc-toggle';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, status, withAlpha } from '@/constants/theme';
import { useSolutions } from '@/hooks/use-solutions';
import { useTheme } from '@/hooks/use-theme';
import { ScreenError, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { errorTitleFor } from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { PlatformNotConfiguredError } from '@/lib/platform/problem';
import { iconFor } from '@/lib/view/icon-registry';
import { SECTION_LABEL, SetupFieldRow, bySection } from '@/components/setup-field';

/** One-time solution setup (design `sSetup`). The design's fixture walks
 *  through Invoice triage; the header names whichever solution was added. */
export default function SetupScreen() {
  const { palette } = useTheme();
  const { isActive, toggle } = useSolutions();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  /**
   * The solution being set up, by templateId.
   *
   * `index` was the fixture's array position, which is why every solution used to
   * open the same content — DESIGN-GAPS item 3's first case. Identity is the
   * catalog's own templateId now.
   *
   * The four sections are still the prototype's fixed rows. Generating them from
   * `setup[]` — four sections × four control kinds, which is what the design
   * delivered on 2026-08-17 and what BUILD-PLAN §2.2 sized the closed unions for
   * — is the remaining work on this screen, tracked in DESIGN-CONTRACT.md.
   */
  const { template } = useLocalSearchParams<{ template?: string }>();
  const catalog = useWorkspaceResource(
    (workspaceId) => {
      if (!template) throw new PlatformNotConfiguredError();
      return readCatalog(workspaceId);
    },
    [template],
  );
  const entry =
    catalog.status === 'ready'
      ? catalog.data.automations.find((a) => a.templateId === template)
      : undefined;
  const solution = entry
    ? { icon: iconFor(entry.icon), name: entry.name, desc: entry.description, cat: entry.category, price: entry.monthlyPriceUsd }
    : null;
  const templateId = entry?.templateId ?? '';

  /** Config values the person has changed, by the field's `key`. */
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [qbConnected, setQbConnected] = useState(false);
  const [holdOnMismatch, setHoldOnMismatch] = useState(true);
  const [holdAboveLimit, setHoldAboveLimit] = useState(true);

  // Below every hook: these return early.
  if (!solution) {
    return (
      <ScreenError
        title={errorTitleFor('setup')}
        onRetry={catalog.reload}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  if (template) {
    if (catalog.status === 'loading') return <ScreenLoading topInset={insets.top} />;
    if (catalog.status === 'offline') {
      return <ScreenOffline onRetry={catalog.reload} onBack={() => router.back()} topInset={insets.top} />;
    }
    if (catalog.status === 'error') {
      return (
        <ScreenError
          title={errorTitleFor('setup')}
          onRetry={catalog.reload}
          onBack={() => router.back()}
          topInset={insets.top}
        />
      );
    }
  }

  const activate = () => {
    if (!qbConnected) return;
    if (!isActive(templateId, entry?.subscribed ?? false)) {
      toggle(templateId, entry?.subscribed ?? false);
    }
    router.push('/(tabs)/flows/detail');
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
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>Set up {solution.name}</Text>
          <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>
            One-time setup · about 2 minutes
          </Text>
        </View>
      </View>

      {/*
        Generated from `manifest.setup[]` when a live manifest resolved, and the
        prototype's fixed rows otherwise. BUILD-PLAN 4.5.3 requires exactly this —
        "Rows are generated from that array, not hard-coded" — and §2.2 closes
        both unions at four precisely so four widgets and four headings suffice
        for every automation that will ever ship.
      */}
      {entry ? (
        bySection(entry.setup).map(({ section, fields }) => (
          <View key={section}>
            <SectionLabel>{SECTION_LABEL[section]}</SectionLabel>
            <SurfaceCard style={styles.sectionCard}>
              {fields.map((f, i) => (
                <SetupFieldRow
                  key={f.key}
                  field={f}
                  value={config[f.key] ?? f.defaultValue}
                  onChange={(next) => setConfig((prev) => ({ ...prev, [f.key]: next }))}
                  divider={i < fields.length - 1}
                />
              ))}
            </SurfaceCard>
          </View>
        ))
      ) : (
        <>

      <View>
        <SectionLabel>1 · CONNECTIONS</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: palette.divider }]}>
            <PlugsConnected size={20} color={palette.accentRamp[300]} />
            <View style={styles.rowBody}>
              <Text style={[styles.rowTitle, { color: palette.text }]}>QuickBooks Online</Text>
              <Text
                style={[
                  styles.rowSub,
                  { color: qbConnected ? status.ok : status.warnText },
                ]}>
                {qbConnected ? 'acme-books · linked via OAuth' : 'Required · sign in with OAuth once'}
              </Text>
            </View>
            <Pressable
              onPress={() => setQbConnected(true)}
              style={({ pressed }) => [
                styles.connectBtn,
                { borderColor: qbConnected ? palette.neutral[700] : palette.accent },
                pressed && !qbConnected && { backgroundColor: withAlpha(palette.accent, 0.1) },
              ]}>
              <Text
                style={{
                  fontFamily: fonts.medium,
                  fontSize: 12,
                  color: qbConnected ? status.ok : palette.accent,
                }}>
                {qbConnected ? 'Connected ✓' : 'Connect'}
              </Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <EnvelopeSimple size={20} color={palette.accentRamp[300]} />
            <View style={styles.rowBody}>
              <Text style={[styles.rowTitle, { color: palette.text }]}>Gmail</Text>
              <Text style={[styles.rowSub, { color: palette.neutral[400] }]}>
                ap@acme.co · already connected
              </Text>
            </View>
            <View style={styles.connectedTag}>
              <View style={[styles.greenDot, { backgroundColor: status.ok }]} />
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: status.ok }}>
                Connected
              </Text>
            </View>
          </View>
        </SurfaceCard>
        <Text style={[styles.oauthNote, { color: palette.neutral[500] }]}>
          You sign in once with OAuth. A8X stays securely linked, and every future solution reuses
          the connection — no reconnecting.
        </Text>
      </View>

      <View>
        <SectionLabel>2 · SOURCE</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
            <Tray size={20} color={palette.accentRamp[300]} />
            <View style={styles.rowBody}>
              <Text style={[styles.rowTitle, { color: palette.text }]}>Watch inbox</Text>
              <Text style={[styles.rowSub, { color: palette.neutral[400] }]}>
                ap@acme.co · label “AP-Invoices”
              </Text>
            </View>
            <CaretRight size={15} color={palette.neutral[500]} />
          </Pressable>
        </SurfaceCard>
      </View>

      <View>
        <SectionLabel>3 · REVIEW RULES</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: palette.divider }]}>
            <HandPalm size={20} color={palette.accentRamp[300]} />
            <View style={styles.rowBody}>
              <Text style={[styles.rowTitle, { color: palette.text }]}>
                Hold when amount differs from PO
              </Text>
              <Text style={[styles.rowSub, { color: palette.neutral[400] }]}>
                Exceptions wait for your judgment
              </Text>
            </View>
            <NocToggle value={holdOnMismatch} onChange={setHoldOnMismatch} />
          </View>
          <View style={styles.row}>
            <CurrencyDollar size={20} color={palette.accentRamp[300]} />
            <View style={styles.rowBody}>
              <Text style={[styles.rowTitle, { color: palette.text }]}>Hold above $500</Text>
              <Text style={[styles.rowSub, { color: palette.neutral[400] }]}>
                Threshold is editable anytime
              </Text>
            </View>
            <NocToggle value={holdAboveLimit} onChange={setHoldAboveLimit} />
          </View>
        </SurfaceCard>
      </View>

      <View>
        <SectionLabel>4 · NOTIFICATIONS</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
            <BellRinging size={20} color={palette.accentRamp[300]} />
            <View style={styles.rowBody}>
              <Text style={[styles.rowTitle, { color: palette.text }]}>Slack · #finance</Text>
              <Text style={[styles.rowSub, { color: palette.neutral[400] }]}>
                Notify on holds and failures
              </Text>
            </View>
            <CaretRight size={15} color={palette.neutral[500]} />
          </Pressable>
        </SurfaceCard>
      </View>
        </>
      )}

      <Pressable
        onPress={activate}
        style={({ pressed }) => [
          styles.activateBtn,
          { borderColor: qbConnected ? palette.accent : palette.neutral[800] },
          pressed && qbConnected && { backgroundColor: withAlpha(palette.accent, 0.12) },
        ]}>
        <Text
          style={{
            fontFamily: fonts.medium,
            fontSize: 16,
            color: qbConnected ? palette.accent : palette.neutral[500],
          }}>
          {qbConnected ? 'Activate solution' : 'Connect QuickBooks to activate'}
        </Text>
      </Pressable>
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
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: 21,
    letterSpacing: em(-0.01, 21),
  },
  subtitle: {
    marginTop: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  sectionCard: {
    marginTop: 9,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  rowSub: {
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
  connectedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
  },
  oauthNote: {
    marginTop: 8,
    marginHorizontal: 2,
    fontFamily: fonts.regular,
    fontSize: 11.5,
    lineHeight: 11.5 * 1.5,
  },
  activateBtn: {
    height: 52,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
