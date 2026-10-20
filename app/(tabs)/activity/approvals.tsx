import { useRouter } from 'expo-router';
import { CheckCircle, Warning } from 'phosphor-react-native';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition, SlideOutLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { StatusPill } from '@/components/nocturne/status-pill';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Pressable } from '@/components/pressable';
import { DecisionButtons } from '@/components/runs/decision-buttons';
import { ScreenEmpty, ScreenError, ScreenUnavailable, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import { Text } from '@/components/text';
import { em, fontScaleLimit, fonts, layout, status, typeScale, withAlpha } from '@/constants/theme';
import { useApprovalDecision, type Decision } from '@/hooks/use-approval-decision';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useWorkspaceResource, busyBody } from '@/hooks/use-resource';
import { useTheme } from '@/hooks/use-theme';
import { APPROVALS_EMPTY_BODY, APPROVALS_EMPTY_TITLE, errorTitleFor } from '@/lib/content/screen-states';
import type { ApprovalItem } from '@/lib/view/runs';
import { readCatalog } from '@/lib/platform/catalog';
import { readApprovals, readSubscriptions } from '@/lib/platform/runs';
import { readWorkspaces } from '@/lib/platform/workspaces';
import { EMPTY } from '@/lib/view/format';
import { decidersLine } from '@/lib/view/roles';
import { catalogIndex, subscriptionIndex, toApprovalItem } from '@/lib/view/runs';

/** How long a decided card takes to slide away, and the rest to close up (round 24 P7). */
const LEAVE_MS = 220;

/**
 * One approval, as the website's row says it (Gate 24's parity pass, G19, G20):
 * the design's card, with the approval's status and its expiry, Approve and
 * Deny (`DecisionButtons`; round 24 P6, P7) only for a role the approval names
 * — anyone else is told which roles do — and the run it holds, a tap away.
 * Decided, its pill says how while it leaves (never "Pending" beside a
 * decision).
 */
function ApprovalCard({
  item,
  decision,
  busy,
  error,
  onDecide,
  onView,
}: {
  item: ApprovalItem;
  decision: Decision | undefined;
  busy: Decision | null;
  error?: string;
  onDecide: (d: Decision) => void;
  onView: () => void;
}) {
  const { palette } = useTheme();
  const pill = decision === 'approved' ? 'Approved' : decision === 'rejected' ? 'Denied' : item.status;
  return (
    <SurfaceCard style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={[styles.kicker, { color: palette.accentRamp[300] }]}>{item.workflow}</Text>
        <Text style={[styles.time, { color: palette.neutral[500] }]}>{item.time}</Text>
      </View>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: palette.text }]}>{item.title}</Text>
        {pill ? <StatusPill label={pill} /> : null}
      </View>
      <View style={styles.callout}>
        <Warning testID={`callout-icon-${item.id}`} size={16} color={status.warnText} style={styles.calloutIcon} />
        <Text style={styles.calloutText}>{item.why}</Text>
      </View>
      {item.expires !== EMPTY ? (
        <Text style={[styles.note, { color: palette.neutral[400] }]}>Expires {item.expires}</Text>
      ) : null}
      {decision ? null : !item.canDecide ? (
        // The server would refuse it (403): no button, and who may decide.
        <Text style={[styles.note, { color: palette.neutral[400] }]}>{decidersLine(item.deciders)}</Text>
      ) : (
        <DecisionButtons testID={`decide-${item.id}`} busy={busy} onDecide={onDecide} />
      )}
      {error ? (
        <Text accessibilityRole="alert" style={[styles.errorNote, { color: status.err }]}>
          {error}
        </Text>
      ) : null}
      <Pressable
        testID={`view-run-${item.id}`}
        accessibilityRole="link"
        onPress={() => onView()}
        style={({ pressed }) => [styles.viewRun, pressed && { opacity: 0.7 }]}>
        <Text style={[styles.viewRunLabel, { color: palette.accentRamp[300] }]}>View the run</Text>
      </Pressable>
      {/* The run it holds, by its full id (Build 21, spec A8; the owner's D4 and AM2). */}
      <Text testID={`approval-run-${item.id}`} selectable style={[styles.note, { color: palette.neutral[500] }]}>
        {item.run}
      </Text>
    </SurfaceCard>
  );
}

export default function ApprovalsScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  /**
   * The inbox, and the three-hop join its headline needs.
   *
   * `status=pending` is passed explicitly: the parameter is `required: false`
   * and omitting it returns approvals of every status, so the summary's
   * "awaiting a decision" is a description of intent rather than of the default.
   *
   * Three reads because §12.1 #70 refuses an approval title and the substitute
   * is a join `Approval` cannot start on its own — it carries no `templateId`.
   * subscriptionId → subscriptions → templateId → catalog entry → its pipeline →
   * the step whose id matches. `reason` is always present and is the line a
   * person actually decides on, so a missing hop degrades the headline and never
   * blanks the card.
   *
   * And the workspace collection, for this person's role there — what an
   * approval's `eligibleRoles` is compared with, as the website's Approvals
   * reads it (`roleInWorkspace`, the collection; Gate 24's parity pass, G20).
   * Not the session's own list: that is a bounded first page, and the contract
   * says not to infer from it.
   */
  const inbox = useWorkspaceResource(async (workspaceId) => {
    const [pendingApprovals, subs, catalog, { workspaces }] = await Promise.all([
      readApprovals(workspaceId, 'pending'),
      readSubscriptions(workspaceId),
      readCatalog(workspaceId),
      readWorkspaces(),
    ]);
    const subIndex = subscriptionIndex(subs.subscriptions);
    const catIndex = catalogIndex(catalog.automations);
    const role = workspaces.find((workspace) => workspace.id === workspaceId)?.role;
    return pendingApprovals.approvals.map<ApprovalItem>((approval) =>
      toApprovalItem(approval, subIndex, catIndex, role),
    );
  });
  const decisions = useApprovalDecision(inbox.loadedFor);

  /**
   * A decided card leaves (round 24 P7; the owner's build 23 F11: "After
   * approving why do i still see the card. Shiuldnt that card slide away"): its
   * pill says the decision for a frame, then it slides out left in 220 ms while
   * the rest close up (at once under Reduce Motion); none left, Activity's main
   * page (`dismissTo`: back to it when it is beneath, else in its place). ~~The
   * "All caught up" banner and "Approved ✓ — agent resuming"~~ until round 24.
   */
  const [decided, setDecided] = useState<Record<string, Decision>>({});
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const items = inbox.status === 'ready' ? inbox.data : [];
  const shown = items.filter((item) => !gone.has(item.id));
  const pending = items.filter((item) => !(item.id in decided)).length;

  useEffect(() => {
    const leaving = Object.keys(decided).filter((id) => !gone.has(id));
    if (leaving.length === 0) return;
    const timer = setTimeout(() => setGone((before) => new Set([...before, ...leaving])), 0);
    return () => clearTimeout(timer);
  }, [decided, gone]);

  // Something was decided here and nothing is left: a queue already empty on arrival is not this.
  const anyDecided = Object.keys(decided).length > 0;
  const cleared = anyDecided && shown.length === 0;
  useEffect(() => {
    if (!cleared) return;
    const timer = setTimeout(() => router.dismissTo('/(tabs)/activity'), reduceMotion ? 0 : LEAVE_MS);
    return () => clearTimeout(timer);
  }, [cleared, reduceMotion, router]);

  const decide = async (approvalId: string, decision: Decision) => {
    if (await decisions.decide(approvalId, decision)) {
      setDecided((before) => ({ ...before, [approvalId]: decision }));
    }
  };

  if (inbox.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (inbox.status === 'offline') {
    return <ScreenOffline onRetry={() => inbox.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (inbox.status === 'unconfigured') {
    return (
      <ScreenUnavailable
        title={errorTitleFor('approvals')}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  if (inbox.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('approvals')}
        onRetry={() => inbox.reload()} body={busyBody(inbox)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  // Arriving with an empty queue: nothing to decide, and nothing was.
  if (items.length === 0 && !anyDecided) {
    return (
      <ScreenEmpty
        icon={<CheckCircle size={40} color={status.ok} />}
        title={APPROVALS_EMPTY_TITLE}
        body={APPROVALS_EMPTY_BODY}
        secondaryAction={{ label: 'Go back', onPress: () => router.back() }}
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
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <Text style={[styles.h1, { color: palette.text }]}>Needs review</Text>
        <View style={[styles.badge, { backgroundColor: withAlpha(palette.accent, 0.16) }]}>
          <Text
            testID="approvals-count"
            maxFontSizeMultiplier={fontScaleLimit.chrome}
            style={[styles.badgeLabel, { color: palette.accentRamp[200] }]}>
            {pending}
          </Text>
        </View>
      </View>
      {shown.map((item) => (
        <Animated.View
          key={item.id}
          testID={`approval-${item.id}`}
          exiting={reduceMotion ? undefined : SlideOutLeft.duration(LEAVE_MS)}
          layout={reduceMotion ? undefined : LinearTransition.duration(LEAVE_MS)}>
          <ApprovalCard
            item={item}
            decision={decided[item.id]}
            busy={decisions.busyFor(item.id)}
            error={decisions.errorFor(item.id)}
            onDecide={(decision) => decide(item.id, decision)}
            // The held run's page, where Activity's rows open a run (24.4.4).
            onView={() => router.push({ pathname: '/(tabs)/activity/run', params: { runId: item.runId } })}
          />
        </Animated.View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layout.screenX,
    paddingBottom: 16,
  },
  h1: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typeScale.heading.fontSize,
    letterSpacing: em(-0.01, typeScale.heading.fontSize),
  },
  badge: {
    minWidth: 26,
    minHeight: 26,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontFamily: fonts.semibold,
    fontSize: typeScale.small.fontSize,
  },
  card: {
    marginHorizontal: layout.screenX,
    marginBottom: 12,
    padding: layout.cardPad,
    gap: 10,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kicker: {
    fontFamily: fonts.regular,
    fontSize: typeScale.micro.fontSize,
    letterSpacing: em(0.14, typeScale.micro.fontSize),
  },
  time: {
    fontFamily: fonts.regular,
    fontSize: typeScale.caption.fontSize,
  },
  // The title, and the approval's status pill at its right, as the website's row puts it.
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  title: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typeScale.lead.fontSize,
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
    paddingHorizontal: 2,
  },
  viewRun: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  viewRunLabel: {
    fontFamily: fonts.medium,
    fontSize: typeScale.body.fontSize,
  },
  callout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: status.warnCalloutBg,
    borderWidth: 1,
    borderColor: status.warnCalloutBorder,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  // Centred on the first line of its words (round 24 P7; the owner's build 23 F11: "off center").
  calloutIcon: {
    marginTop: (typeScale.body.lineHeight - 16) / 2,
  },
  errorNote: {
    fontFamily: fonts.medium,
    fontSize: typeScale.body.fontSize,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  calloutText: {
    flex: 1,
    fontFamily: fonts.regular,
    ...typeScale.body,
    color: status.warnText,
  },
});
