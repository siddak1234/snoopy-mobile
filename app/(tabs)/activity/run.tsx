import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { DownloadSimple, FileText, FlowArrow, StopCircle } from 'phosphor-react-native';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { StatusPill } from '@/components/nocturne/status-pill';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { OpenRow } from '@/components/open-row';
import { BlockList } from '@/components/blocks/block-list';
import { DecisionButtons } from '@/components/runs/decision-buttons';
import { Text } from '@/components/text';
import { em, fonts, iconSize, layout, status, typeScale } from '@/constants/theme';
import { useApprovalDecision } from '@/hooks/use-approval-decision';
import { useRunDetail } from '@/hooks/use-run-detail';
import { useRunPackageDownload } from '@/hooks/use-run-package';
import { useTheme } from '@/hooks/use-theme';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { busyBody } from '@/hooks/use-resource';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { refusalMessage, WORKSPACE_CHANGED } from '@/lib/content/refusals';
import {
  DOWNLOAD_EXCEL_LABEL,
  DOWNLOAD_PDF_LABEL,
  RUN_DETAILS_LABEL,
  VIEW_PACKAGE_LABEL,
  errorTitleFor,
} from '@/lib/content/screen-states';
import { cancelRun } from '@/lib/platform/automations';
import { PlatformError } from '@/lib/platform/problem';
import { decidersLine, decides, type WorkspaceRole } from '@/lib/view/roles';
import { statusLabel, type StatusPillLabel } from '@/lib/view/status';
import { RUN_ORIGIN_TAB, runLabel, runOrigin } from '@/lib/view/runs';

/**
 * A run's page — the one, in Activity's stack (round 24 P5; the owner's build 23
 * F4, F5; ~~registered in Home's stack and again in Settings'~~ until round 24).
 * Its header: its name — or its title and score — its flow and status. Then its
 * page body as the platform sent it (backend ADR-0048; `readRun`'s
 * `shape=blocks`, `BlockList`), in its flow's `pages.run` order: a "View {file}"
 * row for each file its job uploaded, each opening it on a page of its own
 * (`/(tabs)/activity/run-file`); the result line, toned by its status, and
 * while the job's approval waits, the approval form — Approve and Deny
 * (`DecisionButtons`) to a role it names, to anyone else who can decide; then
 * what the run read. Its footer: View package, Download PDF and Download Excel
 * while the platform offers the package (`packageAvailable`); the "Run details"
 * row (`OpenRow`), which opens its steps, tiles and facts on a page of their own
 * (`/(tabs)/activity/run-details`); then Cancel run while it goes, and View
 * flow. ~~The result line, Approve and Deny before the file rows; its sections
 * on one card; its documents' cards~~ until Round 21 (ADR-0048: the web's
 * order, each section on its own card, built once by the platform).
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
  const { openedIn, detail, liveRun } = useRunDetail(runId);
  const decisions = useApprovalDecision(openedIn);
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
        // Its flow — the website's subheader.
        sub: liveRun.entry?.name ?? liveRun.detail.run.templateId,
        status: statusLabel(liveRun.detail.run.status) as StatusPillLabel,
        // Its page body (backend ADR-0048): absent, the page draws the fallback.
        blocks: liveRun.detail.blocks,
        // The platform says whether the job has a package (backend ADR-0045, ADR-0048).
        packageAvailable: liveRun.detail.packageAvailable === true,
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

  /**
   * The approval form (`questions{approval}`, backend ADR-0048 decision 2):
   * the platform sends it while the job's newest approval waits, naming it and
   * the roles that may decide it (round 24 P6; the owner's build 23 F7–F10:
   * "It should be easy for a user to approve or deny not many clicks"). To a
   * role it names, Approve and Deny; to anyone else, who can decide; with the
   * role unread, neither. One tap, then the page reads the run again at once:
   * approved, it is running again under the same id; denied, the line says
   * Denied. The route checks the role again.
   */
  const role = liveRun?.role;
  const approvalForm = (form: { approvalId?: string; eligibleRoles?: readonly WorkspaceRole[] }) => {
    const approvalId = form.approvalId;
    const eligible = form.eligibleRoles ?? [];
    if (!approvalId || role === undefined || role === null) return null;
    if (!decides(role, eligible)) {
      return (
        <Text testID="run-deciders" style={[styles.decisionNote, { color: palette.neutral[400] }]}>
          {decidersLine(eligible)}
        </Text>
      );
    }
    const error = decisions.errorFor(approvalId);
    return (
      <View testID="run-decision-block" style={styles.decision}>
        <DecisionButtons
          testID="run-decision"
          busy={decisions.busyFor(approvalId)}
          onDecide={async (choice) => {
            if (await decisions.decide(approvalId, choice)) detail.refresh();
          }}
        />
        {error ? (
          <Text accessibilityRole="alert" style={[styles.decisionNote, { color: status.err }]}>
            {error}
          </Text>
        ) : null}
      </View>
    );
  };

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

      <BlockList testID="run-blocks" blocks={run.blocks} context={{ forms: { approval: approvalForm } }} />

      {/*
        The A8X run package (round 24 P12; the owner's build 23 F16: "No more
        download json"; ~~Download JSON~~): once the job has documents and has
        stopped going (`packageAvailable`, the platform's word for it) — View
        package opens the PDF on its own page; Download PDF and Download Excel
        hand the file to the share sheet.
      */}
      {run.packageAvailable ? (
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
  decision: {
    gap: 6,
  },
  decisionNote: {
    fontFamily: fonts.regular,
    ...typeScale.small,
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
