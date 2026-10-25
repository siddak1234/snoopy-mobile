import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { DownloadSimple, FileText, FlowArrow, StopCircle } from 'phosphor-react-native';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { StatusPill } from '@/components/nocturne/status-pill';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { OpenRow } from '@/components/open-row';
import { DocumentCard } from '@/components/runs/document-card';
import { RunSections } from '@/components/runs/run-sections';
import { Text } from '@/components/text';
import { em, fonts, iconSize, layout, status, typeScale } from '@/constants/theme';
import { useRunDetail } from '@/hooks/use-run-detail';
import { useRunPackageDownload } from '@/hooks/use-run-package';
import { useTheme } from '@/hooks/use-theme';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { busyBody } from '@/hooks/use-resource';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { refusalMessage, WORKSPACE_CHANGED } from '@/lib/content/refusals';
import {
  DETAILS_LABEL,
  DOCUMENTS_LABEL,
  DOWNLOAD_EXCEL_LABEL,
  DOWNLOAD_PDF_LABEL,
  RUN_DETAILS_LABEL,
  VIEW_PACKAGE_LABEL,
  errorTitleFor,
  runWordDetails,
} from '@/lib/content/screen-states';
import { cancelRun } from '@/lib/platform/automations';
import { PlatformError } from '@/lib/platform/problem';
import { toDocumentCards } from '@/lib/view/documents';
import { statusLabel, type StatusPillLabel } from '@/lib/view/status';
import { RUN_ORIGIN_TAB, runLabel, runOrigin } from '@/lib/view/runs';

/**
 * A run's page — the one, in Activity's stack (round 24 P5; the owner's build 23
 * F4, F5; ~~registered in Home's stack and again in Settings'~~ until round 24).
 * Top to bottom (the owner's build 28 items F7–F9; Round 19 plan §3, the
 * standard for every run): its name — or its title and score — its flow and
 * status; "{Run word} details" ("{RUN} DETAILS", its flow's `items.runWords`;
 * "DETAILS" when its flow has none) over its sections, the first open; its
 * documents and package, or a v1/v2 run's saved details; the "Run details" row
 * (`OpenRow`), which opens its steps, tiles and facts on a page of their own
 * (`/(tabs)/activity/run-details`); then Cancel run while it goes, and View
 * flow. ~~The result line under the name; the tiles, STEPS and the facts on
 * this page~~ until build 28 (F8: "Instead of strong match 6 of 6"; F9:
 * "Rather than showing 54s and all the info there").
 *
 * A push from another tab passes `returnTo` (`RUN_ORIGIN_TAB`): Back — the
 * circle or the swipe, a `GO_BACK` or `POP`, never re-tapping Activity's tab
 * (`POP_TO_TOP`) — pops the run off Activity's stack and switches to that tab,
 * its stack as it was. A push from outside Activity asks for its anchor
 * (`withAnchor`; `unstable_settings` in its layout), so Activity's index is
 * under the run, and a run opened by a notification or a link goes back to
 * Activity.
 */
export default function RunDetailScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { runId, returnTo } = useLocalSearchParams<{ runId?: string; returnTo?: string }>();
  const origin = runOrigin(returnTo);
  useEffect(() => {
    if (!origin) return;
    // Never prevented: the swipe has already taken the page away natively. The
    // pop goes on, and the tabs switch to the origin with it.
    return navigation.addListener('beforeRemove', (event) => {
      const type = event.data.action.type;
      if (type !== 'GO_BACK' && type !== 'POP') return;
      navigation.getParent()?.navigate(RUN_ORIGIN_TAB[origin]);
    });
  }, [navigation, origin]);
  const session = useSession();
  const { openedIn, detail, liveRun, decided } = useRunDetail(runId);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const packageFile = useRunPackageDownload(openedIn, runId);

  const run = liveRun
    ? {
        // The run by its FULL id (the owner's D4 and AM2); never the request id.
        title: runLabel(liveRun.detail.run),
        // What its automation named it and scored it (backend ADR-0046; Round 19,
        // plan §5.4): together they head the page, the id staying in its facts (Run details).
        headline:
          liveRun.detail.run.title !== undefined && liveRun.detail.run.score !== undefined
            ? { title: liveRun.detail.run.title, score: String(liveRun.detail.run.score) }
            : null,
        // What it read, in titled sections, the first open (ADR-0046), before its documents.
        sections: liveRun.detail.sections ?? [],
        // Over them, its flow's word for one run (F8): "{RUN} DETAILS"; "DETAILS" for a flow without one.
        sectionsLabel: liveRun.flow?.items ? runWordDetails(liveRun.flow.items.runWords) : DETAILS_LABEL,
        // Its flow — the website's subheader.
        sub: liveRun.entry?.name ?? liveRun.detail.run.templateId,
        status: statusLabel(liveRun.detail.run.status) as StatusPillLabel,
        // Each document it read, on a card of its own (backend ADR-0039).
        documents: toDocumentCards(
          liveRun.detail.documents,
          decided === 'rejected' ? 'rejected' : decided === 'closed' ? 'expired' : null,
          liveRun.detail.files,
          liveRun.entry?.documentWords,
        ),
        // What a v1/v2 run saved, as its automation wrote it for people (backend
        // ADR-0037; the one-run read only) — drawn only where no documents are.
        details: liveRun.detail.details ?? [],
        subscriptionId: liveRun.detail.run.subscriptionId,
        id: liveRun.detail.run.id,
        // The two states the platform cancels (BUILD-PLAN 24.4.2).
        cancellable: liveRun.detail.run.status === 'pending' || liveRun.detail.run.status === 'running',
      }
    : null;

  /**
   * Cancel a run that has not ended, confirmed first because a cancelled run is
   * not resumed — it ends where it stands (BUILD-PLAN 24.4.2, ported from the
   * website's CancelRunButton). Acts on the workspace this run was read in; a 404
   * is said as "already stopped", the one thing a person here can act on.
   */
  const confirmCancel = async () => {
    if (!run || cancelling) return;
    // The run's own workspace, and only while it is still the active one.
    const workspaceId = workspaceIfShown(session, openedIn);
    if (!workspaceId) {
      setCancelError(WORKSPACE_CHANGED);
      return;
    }
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelRun(workspaceId, run.id);
      setCancelOpen(false);
      detail.reload();
    } catch (error) {
      setCancelError(
        error instanceof PlatformError && error.status === 404
          ? 'This run has already stopped, so there is nothing to cancel.'
          : refusalMessage(error),
      );
    } finally {
      setCancelling(false);
    }
  };

  if (detail.status === 'loading') return <ScreenLoading tiles topInset={insets.top} />;
  if (detail.status === 'offline') {
    return <ScreenOffline onRetry={() => detail.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  // An unconfigured build or an unresolved workspace cannot succeed on a
  // retry, so it does not get a Retry. A refused identity and a platform
  // refusal both can — a stale read is the common case — so they keep one.
  if (detail.status === 'unconfigured') {
    return (
      <ScreenUnavailable
        title={errorTitleFor('run')}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  if (detail.status === 'error' || !run) {
    return (
      <ScreenError
        title={errorTitleFor('run')}
        onRetry={() => detail.reload()} body={busyBody(detail)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}
      showsVerticalScrollIndicator={false}>
      {/* The run by its full id, which wraps at its hyphens — or, where its automation named and
          scored it, that name with the score beside it; its flow and status under it. */}
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          {run.headline ? (
            <View style={styles.headlineRow}>
              <Text testID="run-title" selectable style={[styles.title, styles.headlineTitle, { color: palette.text }]}>
                {run.headline.title}
              </Text>
              <Text testID="run-score" style={[styles.score, { color: palette.text }]}>
                {run.headline.score}
              </Text>
            </View>
          ) : (
            <Text testID="run-title" selectable style={[styles.title, { color: palette.text }]}>
              {run.title}
            </Text>
          )}
          <View style={styles.subRow}>
            <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>{run.sub}</Text>
            <StatusPill label={run.status} />
          </View>
        </View>
      </View>

      {run.sections.length > 0 ? (
        <View testID="run-sections-block">
          <SectionLabel>{run.sectionsLabel}</SectionLabel>
          <View style={styles.sectionCard}>
            <RunSections testID="run-sections" sections={run.sections} firstOpen />
          </View>
        </View>
      ) : null}

      {run.documents.length > 0 ? (
        <View testID="run-documents" style={styles.documents}>
          <SectionLabel>{DOCUMENTS_LABEL}</SectionLabel>
          {run.documents.map((card) => (
            <DocumentCard key={card.index} card={card} />
          ))}
        </View>
      ) : run.details.length > 0 ? (
        <View testID="run-details">
          <SectionLabel>{DETAILS_LABEL}</SectionLabel>
          <SurfaceCard style={styles.sectionCard}>
            {run.details.map((line, i) => (
              <View
                key={`${line.label}-${i}`}
                style={[
                  styles.detailRow,
                  i < run.details.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.divider },
                ]}>
                <Text style={[styles.fieldKey, { color: palette.neutral[400] }]}>{line.label}</Text>
                <Text style={[styles.detailValue, { color: palette.text }]}>{line.value}</Text>
              </View>
            ))}
          </SurfaceCard>
        </View>
      ) : null}

      {/*
        The A8X run package (round 24 P12; the owner's build 23 F16: "No more
        download json"; ~~Download JSON~~): once the job has documents and has
        stopped going — View package opens the PDF on its own page; Download
        PDF and Download Excel hand the file to the share sheet.
      */}
      {run.documents.length > 0 && !run.cancellable ? (
        <View style={styles.download}>
          <PillButton
            testID="run-view-package"
            label={VIEW_PACKAGE_LABEL}
            variant="secondary"
            height={46}
            fontSize={typeScale.label.fontSize}
            icon={FileText}
            iconSize={iconSize.button}
            onPress={() => router.push({ pathname: '/(tabs)/activity/package', params: { runId: run.id } })}
          />
          <View style={styles.actions}>
            <PillButton
              testID="run-download-pdf"
              label={DOWNLOAD_PDF_LABEL}
              variant="secondary"
              height={46}
              fontSize={typeScale.label.fontSize}
              icon={DownloadSimple}
              iconSize={iconSize.button}
              disabled={packageFile.busy !== null}
              style={styles.actionBtn}
              onPress={() => packageFile.download('pdf')}
            />
            <PillButton
              testID="run-download-excel"
              label={DOWNLOAD_EXCEL_LABEL}
              variant="secondary"
              height={46}
              fontSize={typeScale.label.fontSize}
              icon={DownloadSimple}
              iconSize={iconSize.button}
              disabled={packageFile.busy !== null}
              style={styles.actionBtn}
              onPress={() => packageFile.download('xlsx')}
            />
          </View>
          {packageFile.error ? (
            <Text accessibilityRole="alert" style={[styles.downloadError, { color: status.err }]}>
              {packageFile.error}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Its steps, tiles and facts, a tap away (F9): the standard for every run. */}
      <SurfaceCard>
        <OpenRow
          testID="run-open-details"
          title={RUN_DETAILS_LABEL}
          onPress={() => router.push({ pathname: '/(tabs)/activity/run-details', params: { runId: run.id } })}
        />
      </SurfaceCard>

      <View style={styles.actions}>
        {/* It stops the run, which is not resumed: red (the owner's build 12 item 5, "stop"). */}
        {run.cancellable ? (
          <PillButton
            label="Cancel run"
            variant="danger"
            height={46}
            fontSize={typeScale.label.fontSize}
            icon={StopCircle}
            iconSize={iconSize.button}
            style={styles.actionBtn}
            onPress={() => {
              setCancelError(null);
              setCancelOpen(true);
            }}
          />
        ) : null}
        <PillButton
          label="View flow"
          variant="secondary"
          height={46}
          fontSize={typeScale.label.fontSize}
          icon={FlowArrow}
          iconSize={iconSize.button}
          style={styles.actionBtn}
          onPress={() =>
            router.push({
              pathname: '/(tabs)/flows/detail',
              params: { flow: run.subscriptionId },
            })
          }
        />
      </View>

      <Dialog
        visible={cancelOpen}
        onRequestClose={() => (cancelling ? undefined : setCancelOpen(false))}
        testID="cancel-run-dialog"
        title="Cancel this run?"
        body="It stops where it is and is not resumed. Steps it already finished stay finished."
        actions={
          <>
            <DialogButton label="Keep it running" disabled={cancelling} onPress={() => setCancelOpen(false)} />
            <DialogButton
              tone="danger"
              disabled={cancelling}
              label={cancelling ? 'Cancelling…' : 'Cancel run'}
              onPress={confirmCancel}
            />
          </>
        }>
        {cancelError ? <DialogText tone="error">{cancelError}</DialogText> : null}
      </Dialog>
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
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontFamily: fonts.medium,
    ...typeScale.title,
    letterSpacing: em(-0.01, typeScale.title.fontSize),
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headlineTitle: {
    flex: 1,
    minWidth: 0,
  },
  // The score, large, beside the name; the text colour, no judgement in it (plan §5.4).
  score: {
    fontFamily: fonts.medium,
    ...typeScale.heading,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  sectionCard: {
    marginTop: 9,
  },
  documents: {
    gap: 9,
  },
  fieldKey: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body.fontSize,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  detailValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fonts.medium,
    ...typeScale.body,
  },
  download: {
    gap: 6,
  },
  downloadError: {
    fontFamily: fonts.regular,
    ...typeScale.small,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
  },
});
