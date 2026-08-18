import { useRouter } from 'expo-router';
import { CheckCircle, Warning } from 'phosphor-react-native';
import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ScreenEmpty, ScreenError, ScreenUnavailable, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import { em, fonts, layout, status, withAlpha } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { activeWorkspaceId, useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import {
  APPROVALS_EMPTY_BODY,
  APPROVALS_EMPTY_TITLE,
  APPROVAL_DONE_TEXT as approvalDoneText,
  errorTitleFor,
} from '@/lib/content/screen-states';
import type { ApprovalItem } from '@/lib/view/runs';
import { readCatalog } from '@/lib/platform/catalog';
import { decideApproval } from '@/lib/platform/automations';
import { newIdempotencyKey } from '@/lib/platform/client';
import { readApprovals, readSubscriptions } from '@/lib/platform/runs';
import { relativeTimeAgo } from '@/lib/view/format';
import { approvalTitle, approvalWorkflowLabel, catalogIndex, subscriptionIndex } from '@/lib/view/runs';

type Decision = 'approved' | 'rejected';

function ApprovalCard({
  item,
  decision,
  busy,
  error,
  onDecide,
}: {
  item: ApprovalItem;
  decision: Decision | undefined;
  busy: boolean;
  error?: string;
  onDecide: (d: Decision) => void;
}) {
  const { palette } = useTheme();
  return (
    <SurfaceCard style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={[styles.kicker, { color: palette.accentRamp[300] }]}>{item.workflow}</Text>
        <Text style={[styles.time, { color: palette.neutral[500] }]}>{item.time}</Text>
      </View>
      <Text style={[styles.title, { color: palette.text }]}>{item.title}</Text>
      <View style={styles.callout}>
        <Warning size={16} color={status.warnText} style={styles.calloutIcon} />
        <Text style={styles.calloutText}>{item.why}</Text>
      </View>
      {decision ? (
        <Text style={[styles.doneNote, { color: palette.accentRamp[300] }]}>
          {approvalDoneText[decision]}
        </Text>
      ) : (
        <View style={styles.actions}>
          <Pressable
            disabled={busy}
            onPress={() => onDecide('approved')}
            style={({ pressed }) => [
              styles.actionBtn,
              { borderColor: palette.accent },
              pressed && { backgroundColor: withAlpha(palette.accent, 0.12) },
            ]}>
            <Text style={[styles.actionLabel, { color: palette.accent }]}>Approve</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => onDecide('rejected')}
            style={({ pressed }) => [
              styles.actionBtn,
              { borderColor: palette.neutral[700] },
              pressed && { backgroundColor: withAlpha(palette.text, 0.06) },
            ]}>
            <Text style={[styles.actionLabel, { color: palette.neutral[300] }]}>Reject</Text>
          </Pressable>
        </View>
      )}
      {error ? <Text style={[styles.doneNote, { color: status.err }]}>{error}</Text> : null}
    </SurfaceCard>
  );
}

export default function ApprovalsScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const workspaceId = activeWorkspaceId(session);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const intentKeys = useRef<Record<string, { decision: Decision; key: string }>>({});

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
   */
  const inbox = useWorkspaceResource(async (workspaceId) => {
    const [pendingApprovals, subs, catalog] = await Promise.all([
      readApprovals(workspaceId, 'pending'),
      readSubscriptions(workspaceId),
      readCatalog(workspaceId),
    ]);
    const subIndex = subscriptionIndex(subs.subscriptions);
    const catIndex = catalogIndex(catalog.automations);
    return pendingApprovals.approvals.map<ApprovalItem>((a) => ({
      id: a.id,
      workflow: approvalWorkflowLabel(a, subIndex, catIndex),
      title: approvalTitle(a, subIndex, catIndex),
      why: a.reason,
      time: relativeTimeAgo(a.createdAt),
    }));
  });

  const items = inbox.status === 'ready' ? inbox.data : [];
  const decided = Object.keys(decisions).length;
  const pending = items.length - decided;
  // `decided > 0` is the difference between "you cleared the queue" and "the
  // queue was already empty"; only the first is a synchronisation.
  const allDone = decided > 0 && decided === items.length;

  const submitDecision = async (approvalId: string, decision: Decision) => {
    if (!workspaceId || busy[approvalId]) return;
    const previousIntent = intentKeys.current[approvalId];
    const intent = previousIntent?.decision === decision
      ? previousIntent
      : { decision, key: newIdempotencyKey('decision') };
    intentKeys.current[approvalId] = intent;
    setBusy((previous) => ({ ...previous, [approvalId]: true }));
    setErrors((previous) => {
      const next = { ...previous };
      delete next[approvalId];
      return next;
    });
    try {
      await decideApproval(workspaceId, approvalId, decision, intent.key);
      setDecisions((previous) => ({ ...previous, [approvalId]: decision }));
      delete intentKeys.current[approvalId];
    } catch (error) {
      setErrors((previous) => ({
        ...previous,
        [approvalId]: error instanceof Error ? error.message : 'The decision was not saved.',
      }));
    } finally {
      setBusy((previous) => ({ ...previous, [approvalId]: false }));
    }
  };

  if (inbox.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (inbox.status === 'offline') {
    return <ScreenOffline onRetry={inbox.reload} onBack={() => router.back()} topInset={insets.top} />;
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
        onRetry={inbox.reload}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  // Arriving with an empty queue is not "all caught up" — nothing was decided.
  if (items.length === 0) {
    return (
      <ScreenEmpty
        icon={<CheckCircle size={40} />}
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
          <Text style={[styles.badgeLabel, { color: palette.accentRamp[200] }]}>{pending}</Text>
        </View>
      </View>
      {allDone ? (
        <View style={styles.allDone}>
          <CheckCircle size={18} color={status.ok} />
          <Text style={[styles.allDoneText, { color: status.ok }]}>
            All caught up — decisions synced to your workflows.
          </Text>
        </View>
      ) : null}
      {items.map((item) => (
        <ApprovalCard
          key={item.id}
          item={item}
          decision={decisions[item.id]}
          busy={busy[item.id] ?? false}
          error={errors[item.id]}
          onDecide={(decision) => submitDecision(item.id, decision)}
        />
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
    fontSize: 22,
    letterSpacing: em(-0.01, 22),
  },
  badge: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
  },
  allDone: {
    marginTop: 8,
    marginHorizontal: layout.screenX,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: status.okBannerBorder,
    backgroundColor: status.okBannerBg,
  },
  allDoneText: {
    fontFamily: fonts.medium,
    fontSize: 13.5,
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
    fontSize: 10.5,
    letterSpacing: em(0.14, 10.5),
  },
  time: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: 15,
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
  calloutIcon: {
    marginTop: 1,
  },
  calloutText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 13 * 1.45,
    color: status.warnText,
  },
  doneNote: {
    fontFamily: fonts.medium,
    fontSize: 13.5,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionLabel: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
});
