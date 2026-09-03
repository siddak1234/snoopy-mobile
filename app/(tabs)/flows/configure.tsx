import { useLocalSearchParams, useRouter } from 'expo-router';
import { PlugsConnected } from 'phosphor-react-native';
import React, { useRef, useState } from 'react';
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
import { ScreenError, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { activeWorkspaceId, useSession } from '@/hooks/use-session';
import { CONFIGURE_FOOTNOTE, UNAVAILABLE_NOTE, errorTitleFor } from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { createSubscription } from '@/lib/platform/automations';
import { newIdempotencyKey } from '@/lib/platform/client';
import { PlatformNotConfiguredError } from '@/lib/platform/problem';
import { iconFor } from '@/lib/view/icon-registry';
import { toPipelineSteps } from '@/lib/view/pipeline';

/** Template → Builder handoff (design `sConfigure`). */
export default function ConfigureTemplateScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const workspaceId = activeWorkspaceId(session);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const createKey = useRef(newIdempotencyKey('subscribe'));
  const creating = useRef(false);

  /**
   * The template being configured.
   *
   * `template` is a templateId. Without one there is nothing to look up, so the
   * screen refuses instead of substituting a default template.
   *
   * The meta line drops "used by 2,100 teams": §12.1 #74 refuses it as a
   * cross-tenant fact the platform does not hold, and names static copy the
   * design owns as the substitute. Rendering a real-looking number the platform
   * never sent is precisely what that refusal forbids, so it is simply absent.
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

  const view = entry
    ? {
        icon: iconFor(entry.icon),
        name: entry.name,
        meta: `${entry.category} · ${entry.pipeline?.length ?? 0} steps`,
        steps: toPipelineSteps(entry.pipeline),
        connection: entry.setup.find((f) => f.section === 'connections') ?? null,
        footnote: CONFIGURE_FOOTNOTE,
      }
    : null;
  const ConnectionIcon = PlugsConnected;

  const changeName = (next: string) => {
    setName(next);
    // An idempotency key represents one exact intent/body. Preserve it for a
    // retry, but replace it if the person changes that intent.
    createKey.current = newIdempotencyKey('subscribe');
  };

  // Below every hook: these return early. Without a resolved template there is
  // nothing to configure — the prototype's Invoice-capture stand-in is gone by
  // the owner's 2026-08-17 decision.
  if (catalog.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (catalog.status === 'offline') {
    return <ScreenOffline onRetry={catalog.reload} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (catalog.status !== 'ready' || !view || !entry || !workspaceId) {
    return (
      <ScreenError
        title={errorTitleFor('configure')}
        onRetry={catalog.reload}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  const createDraft = async () => {
    if (creating.current) return;
    // A probe said this automation is not answering. The web client refuses the
    // same action for the same reason rather than creating a subscription whose
    // first run cannot succeed.
    if (!entry.available) {
      setActionError(UNAVAILABLE_NOTE);
      return;
    }
    creating.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await createSubscription(
        workspaceId,
        {
          templateId: entry.templateId,
          templateVersion: entry.version,
          ...(name.trim() ? { name: name.trim() } : {}),
        },
        createKey.current,
      );
      // The intent is spent. Without a fresh key a second create replays the
      // first subscription's stored response instead of creating anything —
      // the key is the identity of one intent, not of this screen.
      createKey.current = newIdempotencyKey('subscribe');
      router.push({ pathname: '/(tabs)/flows/builder', params: { template: entry.templateId } });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The workflow could not be created.');
    } finally {
      creating.current = false;
      setBusy(false);
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
        <Text style={[styles.title, { color: palette.text }]}>New from template</Text>
      </View>

      <SurfaceCard style={styles.summary}>
        <IconTile icon={view.icon} size={42} iconSize={21} borderRadius={12} bordered />
        <View style={styles.summaryBody}>
          <Text style={[styles.summaryName, { color: palette.text }]}>
            {view.name}
          </Text>
          <Text style={[styles.summaryMeta, { color: palette.neutral[400] }]}>
            {view.meta}
          </Text>
        </View>
      </SurfaceCard>

      <TextField label="Workflow name" value={name} onChangeText={changeName} />

      <View>
        <SectionLabel>REQUIRED CONNECTION</SectionLabel>
        <SurfaceCard style={styles.connectionCard}>
          <ConnectionIcon size={20} color={palette.accentRamp[300]} />
          <View style={styles.connectionBody}>
            <Text style={[styles.connectionName, { color: palette.text }]}>
              {view.connection?.title ?? 'No connection required'}
            </Text>
            <Text
              style={[
                styles.connectionSub,
                { color: palette.neutral[400] },
              ]}>
              {view.connection?.description ?? 'Connections are managed for the workspace'}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/(tabs)/settings')}
            style={({ pressed }) => [
              styles.connectBtn,
              { borderColor: palette.accent },
              pressed && { backgroundColor: withAlpha(palette.accent, 0.1) },
            ]}>
            <Text
              style={{
                fontFamily: fonts.medium,
                fontSize: 12.5,
                color: palette.accent,
              }}>
              Settings
            </Text>
          </Pressable>
        </SurfaceCard>
      </View>

      <View>
        <SectionLabel>STEPS PRELOADED IN BUILDER</SectionLabel>
        <SurfaceCard style={styles.stepsCard}>
          {view.steps.map((step, i) => {
            const StepIcon = step.icon;
            return (
              <View
                key={step.id}
                style={[
                  styles.stepRow,
                  i < view.steps.length - 1 && {
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

      {actionError ? <Text style={[styles.footnote, { color: status.err }]}>{actionError}</Text> : null}

      <PillButton
        label={busy ? 'Creating…' : 'Create & open in Builder'}
        variant="primary"
        gap={8}
        onPress={createDraft}
        disabled={busy}
      />
      <Text style={[styles.footnote, { color: palette.neutral[600] }]}>
        {view.footnote}
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
