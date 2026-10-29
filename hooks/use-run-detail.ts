import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useResource } from '@/hooks/use-resource';
import { activeWorkspaceId, useSession } from '@/hooks/use-session';
import { readCatalog } from '@/lib/platform/catalog';
import { PlatformNotConfiguredError } from '@/lib/platform/problem';
import {
  readAllApprovals,
  readAllApprovalsNow,
  readRemovedSubscriptionsOrNone,
  readRun,
  readSubscriptions,
  type Subscription,
} from '@/lib/platform/runs';
import { readWorkspaces } from '@/lib/platform/workspaces';
import { timeOfDay } from '@/lib/view/format';
import { RUN_REREAD_MS, heldDecision, jobReviewTally, rereadForApproval, runVerdict, toTracker, type TrackerFlow } from '@/lib/view/runs';

/**
 * One run as its two pages read it — the run's page and its Run details page
 * (the owner's build 28 item F9) — so both read it the same way, never a copy.
 *
 * **A run belongs to the workspace it was opened in.** The read is bound to
 * that workspace, not to whichever is active: re-reading a run id in another
 * workspace answered 404 three times on build 7 (BUILD-PLAN 24.11.9). When the
 * active workspace changes, the page leaves instead — the run is not the new
 * workspace's to show.
 *
 * One run, plus the catalog for its name and the step titles. `RunStep`
 * carries a `stepId` the spec guarantees the pinned manifest declares, so the
 * human title comes from that manifest's `pipeline` — the intended join, not a
 * workaround. What a run read comes as blocks (backend ADR-0048), on this
 * one-run read only — never the raw output (§12.1 #67).
 *
 * And its flow, as it is now (Build 22, the session's S23): a setting step's
 * line — the integration the flow has chosen — and a title by connection
 * ("QuickBooks updated") follow the flow's settings, since a run does not
 * record its own choice (backend §12.1 #290); its run fields name its files
 * (build 28, F7). The live list first, an archived flow's only when
 * the run's flow is not in it; a flow that cannot be read costs those their
 * words, never the page.
 *
 * A run that has not ended is read again until it has — the owner's build 14
 * feedback #3, "It says running" — one read at a time, the next waiting for the
 * last to settle, none while another screen is in front, each keeping the page
 * on screen (`refresh`). A run held whose page body holds no approval form yet
 * is read again for it (round 25, the review's R5c 1; backend ADR-0048): every
 * `RUN_REREAD_MS`, at most `HELD_APPROVAL_REREADS` times, with the approvals
 * past the snapshot (`readAllApprovalsNow`) for Run details' held step, until
 * the form comes or the run leaves held (`rereadForApproval`, the website's
 * rule).
 *
 * The run is read as its page body (`readRun`'s `shape=blocks`): the run's page
 * draws its `blocks`, the file page its files, Run details its steps.
 */
export function useRunDetail(runId: string | undefined) {
  const router = useRouter();
  const session = useSession();
  const [openedIn] = useState(() => activeWorkspaceId(session));
  const activeNow = activeWorkspaceId(session);
  useEffect(() => {
    if (openedIn && activeNow && activeNow !== openedIn) {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/activity');
    }
  }, [activeNow, openedIn, router]);

  // Reads that have settled, either way: what schedules the next one while the run goes on.
  const [reads, setReads] = useState(0);
  // Whether the next read takes the approvals past the snapshot, and how many
  // such reads have settled: a held run's approval not listed yet (R5c 1).
  const freshApprovals = useRef(false);
  const [approvalReads, setApprovalReads] = useState(0);
  const detail = useResource(async () => {
    const fresh = freshApprovals.current;
    freshApprovals.current = false;
    try {
      if (!runId || !openedIn) throw new PlatformNotConfiguredError();
      const [run, catalog, approvals, live, role] = await Promise.all([
        readRun(openedIn, runId),
        readCatalog(openedIn),
        // Unreadable, the page still draws (round 24 P6): a held step says why, with no buttons.
        (fresh ? readAllApprovalsNow : readAllApprovals)(openedIn).then(
          (answer) => answer.approvals,
          () => null,
        ),
        readSubscriptions(openedIn).then(
          (answer) => answer.subscriptions,
          () => null,
        ),
        // This person's role in the workspace, from the collection, as Approvals reads it (G20); null unread.
        readWorkspaces().then(
          ({ workspaces }) => workspaces.find((workspace) => workspace.id === openedIn)?.role ?? null,
          () => null,
        ),
      ]);
      const entry = catalog.automations.find((a) => a.templateId === run.run.templateId);
      const own = (rows: Subscription[] | null) => rows?.find((row) => row.id === run.run.subscriptionId);
      const flow =
        own(live) ?? (live === null ? undefined : own((await readRemovedSubscriptionsOrNone(openedIn)).subscriptions));
      // Its verdict's colour and word, in its flow's own words (Round 21, the owner's Q5; plan Open 5).
      const verdict = runVerdict(run.run, flow?.items?.verdictWords);
      return { detail: run, entry, approvals: approvals ?? [], approvalsRead: approvals !== null, flow, role, verdict };
    } finally {
      setReads((n) => n + 1);
      if (fresh) setApprovalReads((n) => n + 1);
    }
  }, [runId, openedIn]);

  const going =
    detail.status === 'ready' &&
    (detail.data.detail.run.status === 'pending' || detail.data.detail.run.status === 'running');
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const { refresh } = detail;
  useEffect(() => {
    if (!going || !focused) return;
    const timer = setTimeout(refresh, RUN_REREAD_MS);
    return () => clearTimeout(timer);
  }, [going, focused, reads, refresh]);

  const owed =
    detail.status === 'ready' && rereadForApproval(detail.data.detail.run, detail.data.detail.blocks, approvalReads);
  useEffect(() => {
    if (!owed || !focused) return;
    const timer = setTimeout(() => {
      freshApprovals.current = true;
      refresh();
    }, RUN_REREAD_MS);
    return () => clearTimeout(timer);
  }, [owed, focused, reads, refresh]);

  const liveRun = detail.status === 'ready' ? detail.data : null;
  // A denied step says so (P6); Run details' held step reads it.
  const decided = liveRun ? heldDecision(liveRun.detail.run, liveRun.approvals) : null;
  // Every step from the start, each where the run is (spec A7; the session's
  // S14) — by the catalog's groups, the newest version's, for any run whose
  // every reported step they still declare (Build 22, the session's S25: a v3
  // run is drawn by v4's five steps); a run that reported a step they no longer
  // declare is drawn by the steps it reported. Step 2 says the flow's
  // integration, step 4's title follows it, step 5 is the run's email.
  const trackerFlow: TrackerFlow | undefined =
    liveRun?.flow !== undefined
      ? {
          setup: liveRun.flow.setup ?? liveRun.entry?.setup ?? [],
          config: liveRun.flow.config,
          providerName: (providerId) =>
            liveRun.entry?.requiredConnections.find((c) => c.providerId === providerId)?.displayName ?? providerId,
        }
      : undefined;
  const tracker = liveRun
    ? toTracker(
        liveRun.detail.steps,
        liveRun.entry?.pipeline,
        liveRun.entry?.groups,
        liveRun.detail.run,
        timeOfDay,
        liveRun.entry?.pipeline,
        // A saved review's count on the step that waited (F2), as the website's tracker says it.
        {
          flow: trackerFlow,
          email: liveRun.detail.email,
          decision: decided,
          review: jobReviewTally(liveRun.detail.run, liveRun.approvals),
        },
      )
    : [];

  return { openedIn, detail, liveRun, decided, tracker };
}
