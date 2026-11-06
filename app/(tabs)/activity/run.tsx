import { useLocalSearchParams, useNavigation, useRouter, useSegments } from 'expo-router';
import { FileText, FlowArrow, StopCircle } from 'phosphor-react-native';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/blocks/badge';
import { toneColor, type BlockOf } from '@/components/blocks/look';
import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { FileActions } from '@/components/files/file-actions';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionTitle } from '@/components/nocturne/section-label';
import { StatusPill } from '@/components/nocturne/status-pill';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { OpenRow } from '@/components/open-row';
import { BlockList } from '@/components/blocks/block-list';
import { Page } from '@/components/page';
import { PageHeader } from '@/components/page-header';
import { DecisionButtons } from '@/components/runs/decision-buttons';
import { ReviewDecisions } from '@/components/runs/review-decisions';
import { TrackerStep } from '@/components/runs/tracker-step';
import { Text } from '@/components/text';
import { fonts, iconSize, inset, space, status, typeScale } from '@/constants/theme';
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
  REVIEW_MEMBER_NOTE,
  RUN_DETAILS_LABEL,
  STEPS_LABEL,
  VIEW_PACKAGE_LABEL,
  errorTitleFor,
} from '@/lib/content/screen-states';
import { cancelRun, type AnsweredDecision } from '@/lib/platform/automations';
import { PlatformError } from '@/lib/platform/problem';
import { decidersLine, decides } from '@/lib/view/roles';
import { statusLabel, type StatusPillLabel } from '@/lib/view/status';
import {
  RUN_ORIGIN_TAB,
  expiredByDisconnect,
  jobApproval,
  jobReviewTally,
  offeredDecisions,
  providerNameIn,
  runFace,
  runOrigin,
  runStack,
} from '@/lib/view/runs';

/**
 * A run's page — the one, in Activity's stack (round 24 P5; the owner's build 23
 * F4, F5; ~~registered in Home's stack and again in Settings'~~ until round 24),
 * with two faces by the run's status (`runFace`; the owner's build 39 item 10
 * and his words of 2026-11-06: "run starts shows the steps for that run, run
 * details in the bottom where the run meta data is shown. all automations
 * should be the same format"):
 *
 * - **Steps** — pending, running, held, failed, cancelled: its flow's name, the
 *   job it is for (`itemTitle`, one `readItem`), its status; then STEPS, Run
 *   details' rows as they were (`toTracker`, `TrackerStep`), live while it goes;
 *   then its page body as the platform sent it (`BlockList`: the file rows, the
 *   result line, a held job's approval form, a batch's children — blocks carry
 *   no part marker, so the body is drawn whole, a limit DESIGN-GAPS records);
 *   then Cancel run while it goes, and the Run details row last.
 * - **Result** — succeeded: its name and score where its automation gave them
 *   (else its flow's name), its flow and status; the body; View package,
 *   Download PDF and Download Excel while the platform offers the package
 *   (`packageAvailable`); View flow; the Run details row last.
 *
 * A run that succeeds while its steps are in front turns into its result in
 * place — nothing is pushed — so Back goes where the run was opened from. Run
 * details (`/(tabs)/activity/run-details`) holds its tiles and facts, the run's
 * id among them. ~~"Run {full id}" over the page, and its steps on Run details
 * alone~~ until builds 37 and 39. The approval form — Approve and Deny
 * (`DecisionButtons`) to a role it names, to anyone else who can decide — and,
 * over the body, a job whose approval a disconnect expired (`expiredByDisconnect`,
 * S1-8; no decision, S1-8b), on either face.
 *
 * A push from another tab passes `returnTo` (`RUN_ORIGIN_TAB`): Back — the
 * circle or the swipe, a `GO_BACK` or `POP`, never re-tapping Activity's tab
 * (`POP_TO_TOP`) — pops the run off Activity's stack and switches to that tab,
 * its stack as it was. A push from outside Activity asks for its anchor
 * (`withAnchor`; `unstable_settings` in its layout), so Activity's index is
 * under the run, and a run opened by a notification or a link goes back to
 * Activity.
 *
 * A run opened from one of a flow's items, or started on Home
 * (`startedRunState`) or on a flow page (pushed over it; builds 37 and 39), is this page in the Flows stack
 * (`app/(tabs)/flows/run.tsx`; the owner's build 31 G1, `RunStack`): Back comes
 * straight to the item or the flow page, and its View package, Run details and
 * files open in the stack it is in.
 */
export default function RunDetailScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { runId, returnTo } = useLocalSearchParams<{ runId?: string; returnTo?: string }>();
  const origin = runOrigin(returnTo);
  // Activity's stack, or the Flows stack for a run opened from an item (G1): where its own pages open.
  const stack = runStack(useSegments());
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
  const { openedIn, detail, liveRun, tracker, itemTitle } = useRunDetail(runId, { withItem: true });
  const decisions = useApprovalDecision(openedIn);
  // A review saved here, said at once (F2) until the approvals read again say it.
  const [savedReview, setSavedReview] = useState<readonly AnsweredDecision[] | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const packageFile = useRunPackageDownload(openedIn, runId);

  const run = liveRun
    ? {
        // Its face (builds 37 and 39, item 10): its steps until it succeeds, then its result.
        face: runFace(liveRun.detail.run.status),
        // What its automation named it and scored it (backend ADR-0046; Round 19,
        // plan §5.4): together they head the result, the id staying in its facts (Run details).
        headline:
          liveRun.detail.run.title !== undefined && liveRun.detail.run.score !== undefined
            ? { title: liveRun.detail.run.title, score: String(liveRun.detail.run.score) }
            : null,
        // Its verdict's colour and word (Round 21, the owner's Q5; F1), named by its flow (`useRunDetail`).
        verdict: liveRun.verdict,
        // Its flow: the steps face's title, and the result's unless a name and score head it.
        // ~~"Run {full id}"~~ until builds 37 and 39: the id is Run details' (its facts).
        sub: liveRun.entry?.name ?? liveRun.detail.run.templateId,
        status: statusLabel(liveRun.detail.run.status) as StatusPillLabel,
        // "{a} accepted · {d} denied" once its review is saved (F2): the job's approval's answers.
        reviewTally: jobReviewTally(liveRun.detail.run, liveRun.approvals, savedReview),
        // The job's approval, expired because its connection was disconnected at the provider
        // (S1-8; backend §12.1 #252): why, and what to do, in the catalog's name for it (`disconnectedName`).
        expired: expiredByDisconnect(jobApproval(liveRun.detail.run, liveRun.approvals), (providerId) =>
          providerNameIn(liveRun.entry, providerId),
        ),
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
   *
   * A form that carries changes (`decisions`; Round 21's platform round, F2)
   * is a review instead: each change Accept or Deny (`ReviewDecisions`), then
   * Save review, which sends every answer. The rows are drawn to everyone
   * (words.md section 3), the pills only to those who may approve: to a
   * member the rows read-only and "Only an owner or admin can review this.",
   * and to anyone else the approval does not name (an admin on an owner-only
   * one) the rows read-only and who may decide it. Saved, the page says
   * "{a} accepted · {d} denied" and reads the run again: the job goes on
   * whatever the answers. The platform sends it as its own form, `review`
   * (block set 3), and the page draws `approval` and `review` alike.
   *
   * None once a disconnect expired the job's approval (S1-8b): the two lines
   * over the body say so. An Approve the platform refused for it (409
   * `approval_expired` with `expiredBy`) says the same two lines where Approve
   * and Deny were, with nothing to press, and the page reads the run again.
   */
  const role = liveRun?.role;
  const approvalForm = (form: BlockOf<'questions'>['form']) => {
    const approvalId = form.approvalId;
    const eligible = form.eligibleRoles ?? [];
    if (!approvalId || role === undefined || role === null || run.expired) return null;
    const over = decisions.expiredFor(approvalId);
    if (over) {
      return (
        <View testID="run-decision-expired" accessibilityRole="alert" style={styles.decision}>
          <Text style={[styles.expiredTitle, { color: status.warnText }]}>{over.title}</Text>
          <Text style={[styles.decisionNote, { color: palette.neutral[400] }]}>{over.next}</Text>
        </View>
      );
    }
    const changes = offeredDecisions(form);
    if (changes.length > 0) {
      if (!decides(role, eligible)) {
        return (
          <View testID="run-review-readonly" style={styles.decision}>
            <ReviewDecisions testID="run-review" changes={changes} readOnly />
            <Text testID="run-review-member" style={[styles.decisionNote, { color: palette.neutral[400] }]}>
              {role === 'member' ? REVIEW_MEMBER_NOTE : decidersLine(eligible)}
            </Text>
          </View>
        );
      }
      const reviewError = decisions.errorFor(approvalId);
      return (
        <View testID="run-review-block" style={styles.decision}>
          <ReviewDecisions
            testID="run-review"
            changes={changes}
            saving={decisions.reviewingFor(approvalId)}
            onSave={async (answers) => {
              if (await decisions.review(approvalId, answers)) {
                setSavedReview(answers);
                detail.refresh();
              }
            }}
          />
          {reviewError ? (
            <Text accessibilityRole="alert" style={[styles.decisionNote, { color: status.err }]}>
              {reviewError}
            </Text>
          ) : null}
        </View>
      );
    }
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
            // Saved, or expired by a disconnect (S1-8b): the run as the platform now holds it.
            if ((await decisions.decide(approvalId, choice)) !== 'refused') detail.refresh();
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

  const steps = run.face === 'steps';
  // Its tiles and facts' page, a tap away (F9) — the last row of either face (builds 37 and 39).
  const detailsRow = (
    <SurfaceCard>
      <OpenRow
        testID="run-open-details"
        title={RUN_DETAILS_LABEL}
        onPress={() => router.push({ pathname: `/(tabs)/${stack}/run-details`, params: { runId: run.id } })}
      />
    </SurfaceCard>
  );
  // It stops the run, which is not resumed: red (the owner's build 12 item 5, "stop").
  const cancelButton = run.cancellable ? (
    <PillButton
      label="Cancel run"
      variant="danger"
      fontSize={typeScale.label.fontSize}
      icon={StopCircle}
      iconSize={iconSize.button}
      style={styles.actionBtn}
      onPress={() => {
        setCancelError(null);
        setCancelOpen(true);
      }}
    />
  ) : null;

  return (
    <Page testID="run-screen">
      {/* The steps face: its flow's name, the job it is for, its status. The result face: the name its
          automation gave it with the score on the right, green for the flow's positive verdict and red
          for its negative, the verdict's word beside it (Round 21, the owner's Q5; F1), its flow and
          status under it — or, unnamed, its flow's name. ~~"Run {full id}"~~ until builds 37 and 39. */}
      <PageHeader
        testID="run-header"
        onBack={() => router.back()}
        title={!steps && run.headline ? run.headline.title : run.sub}
        titleTestID="run-title"
        selectable
        right={
          !steps && run.headline ? (
            <View style={styles.scoreLine}>
              <Text
                testID="run-score"
                style={[styles.score, { color: run.verdict ? toneColor(run.verdict.tone, palette) : palette.text }]}>
                {run.headline.score}
              </Text>
              {run.verdict ? <Chip testID="run-verdict" badge={{ text: run.verdict.word, tone: run.verdict.tone }} /> : null}
            </View>
          ) : null
        }
        below={
          <View>
            {steps && itemTitle !== null ? (
              <Text testID="run-job" style={[styles.subtitle, styles.job, { color: palette.neutral[400] }]}>
                {itemTitle}
              </Text>
            ) : null}
            <View style={styles.subRow}>
              {!steps && run.headline ? (
                <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>{run.sub}</Text>
              ) : null}
              <StatusPill label={run.status} />
            </View>
          </View>
        }
      />

      {/* Its review, once saved (F2): how many changes were accepted and denied. */}
      {run.reviewTally ? (
        <Text testID="run-review-tally" style={[styles.decisionNote, { color: palette.neutral[400] }]}>
          {run.reviewTally}
        </Text>
      ) : null}

      {/* Over its body, an approval a disconnect expired says so (S1-8), as the website's. */}
      {run.expired ? (
        <View testID="run-expired" accessibilityRole="summary" style={styles.decision}>
          <Text style={[styles.expiredTitle, { color: status.warnText }]}>{run.expired.title}</Text>
          <Text style={[styles.decisionNote, { color: palette.neutral[400] }]}>{run.expired.next}</Text>
        </View>
      ) : null}

      {/* The steps face's STEPS (the owner's build 39 item 10: "When a run starts i want to see the
          steps 1-x"): Run details' rows as they were (`toTracker`, `TrackerStep`), live while it goes;
          a failed or cancelled run keeps them, the step that failed saying why. */}
      {steps ? (
        <View testID="run-progress">
          <SectionTitle>{STEPS_LABEL}</SectionTitle>
          <SurfaceCard>
            {tracker.map((row, i) => (
              <TrackerStep key={row.id} row={row} divider={i < tracker.length - 1} />
            ))}
          </SurfaceCard>
        </View>
      ) : null}

      <BlockList
        testID="run-blocks"
        blocks={run.blocks}
        context={{ forms: { approval: approvalForm, review: approvalForm }, workspaceId: openedIn, runStack: stack }}
      />

      {/*
        The A8X run package (round 24 P12; the owner's build 23 F16: "No more
        download json"; ~~Download JSON~~), on the result face: once the job has
        documents and has stopped going (`packageAvailable`, the platform's word
        for it) — View package opens the PDF on its own page; Download PDF and
        Download Excel save the file, and Share hands the PDF to the share sheet
        (`FileActions`, Round 21; the owner's Q7).
      */}
      {!steps && run.packageAvailable ? (
        <View style={styles.download}>
          <PillButton
            testID="run-view-package"
            label={VIEW_PACKAGE_LABEL}
            variant="secondary"
            fontSize={typeScale.label.fontSize}
            icon={FileText}
            iconSize={iconSize.button}
            onPress={() => router.push({ pathname: `/(tabs)/${stack}/package`, params: { runId: run.id } })}
          />
          <FileActions
            testID="run-package-actions"
            downloads={[
              { label: DOWNLOAD_PDF_LABEL, testID: 'run-download-pdf', run: () => packageFile.download('pdf') },
              { label: DOWNLOAD_EXCEL_LABEL, testID: 'run-download-excel', run: () => packageFile.download('xlsx') },
            ]}
            share={{ testID: 'run-share-package', run: packageFile.share }}
          />
        </View>
      ) : null}

      {steps ? (
        // The steps face's footer: Cancel run while it goes, then Run details, last.
        <>
          {cancelButton ? <View style={styles.actions}>{cancelButton}</View> : null}
          {detailsRow}
        </>
      ) : (
        // The result face's footer: View flow, then Run details, last.
        <>
          <View style={styles.actions}>
            {cancelButton}
            <PillButton
              label="View flow"
              variant="secondary"
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
          {detailsRow}
        </>
      )}

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
    </Page>
  );
}

const styles = StyleSheet.create({
  // The score, large, on the right of the name, toned by the verdict; its chip after it, as the website's.
  scoreLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inner,
  },
  score: {
    fontFamily: fonts.medium,
    ...typeScale.heading,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.inner,
    marginTop: inset.xs,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  // The job's title under the flow's name, over the status (the steps face).
  job: {
    marginTop: inset.xs,
  },
  decision: {
    gap: space.inner,
  },
  decisionNote: {
    fontFamily: fonts.regular,
    ...typeScale.small,
  },
  expiredTitle: {
    fontFamily: fonts.medium,
    ...typeScale.small,
  },
  download: {
    gap: space.inner,
  },
  actions: {
    flexDirection: 'row',
    gap: space.inner,
  },
  actionBtn: {
    flex: 1,
  },
});
