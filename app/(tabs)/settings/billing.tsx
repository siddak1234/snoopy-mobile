import { useRouter } from 'expo-router';
import { CreditCard } from 'phosphor-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { em, fonts, layout, status, typeScale } from '@/constants/theme';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { errorTitleFor } from '@/lib/content/screen-states';
import {
  hostedAddress,
  openCheckout,
  openPortal,
  readBilling,
  readPlans,
  type HostedBillingSession,
  type PlanPrice,
  type PurchasablePlan,
  type WorkspaceBilling,
} from '@/lib/platform/billing';
import { PlatformError } from '@/lib/platform/problem';
import { readWorkspaces } from '@/lib/platform/workspaces';
import { formatPlanPrice } from '@/lib/view/plan-price';
import { administers } from '@/lib/view/roles';

/** The platform's free floor: what a workspace that never paid reports, and never on the plan list. */
const FREE_PLAN_ID = 'free';
/** The owner's Free card (decision 7 of 2026-10-02): drawn by the app, at no cost. */
const FREE_PRICE: PlanPrice = { amount: 0, currency: 'usd', interval: 'month' };

type PlanCard = { planId: string; name: string; price?: string };

/**
 * The cards, in order: Free, then the platform's plans by price (today Plus —
 * the `team` plan, which the platform names Plus — and Pro once the platform
 * lists it). Each is its name and its price only.
 */
function planCards(plans: readonly PurchasablePlan[], state: WorkspaceBilling | null): PlanCard[] {
  const paid = plans
    .filter((plan) => plan.planId !== FREE_PLAN_ID)
    .map((plan, index) => ({ plan, index }))
    .sort(
      (a, b) =>
        (a.plan.price?.amount ?? Number.POSITIVE_INFINITY) - (b.plan.price?.amount ?? Number.POSITIVE_INFINITY) ||
        a.index - b.index,
    )
    .map(({ plan }) => {
      const price = plan.price ? formatPlanPrice(plan.price) : undefined;
      return { planId: plan.planId, name: plan.displayName, ...(price ? { price } : {}) };
    });
  return [
    {
      planId: FREE_PLAN_ID,
      name: state?.planId === FREE_PLAN_ID ? state.displayName : 'Free',
      price: formatPlanPrice(FREE_PRICE),
    },
    ...paid,
  ];
}

/**
 * A checkout the platform refuses because the workspace already has a plan
 * (409 `plan_exists`, backend 24.12) opens Manage billing instead: plans change
 * in the portal.
 */
async function checkoutOrPortal(workspaceId: string, planId: string): Promise<HostedBillingSession> {
  try {
    return await openCheckout(workspaceId, planId);
  } catch (caught) {
    if (caught instanceof PlatformError && caught.status === 409 && caught.details?.reason === 'plan_exists') {
      return openPortal(workspaceId);
    }
    throw caught;
  }
}

/**
 * Settings → Billing (BUILD-PLAN 24.6.1, ADR-0032 option B; the cards since the
 * owner's decisions 7 and 8 of 2026-10-02, 24.12) — the plans as tall cards,
 * Free, Plus and Pro, each its name and price; the workspace's own says
 * "Enrolled", and a paid one adds its status. On iOS a card is the action:
 * not paying, a paid plan's card opens the hosted checkout for that plan;
 * paying, any other card opens Manage billing (the hosted portal), since a
 * second checkout would start a second subscription. Both open in the SYSTEM
 * browser, and billing is read again when the app comes back to the
 * foreground. Android shows the cards with no purchase control or call to
 * action. There is no in-app purchase.
 *
 * The workspace's plan and status are an owner's or an admin's to see
 * (ADR-0025); a member sees the plans, without actions, and is told who
 * manages billing — this workspace's billing is not read for them.
 */
export default function BillingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const session = useSession();
  const purchasing = Platform.OS === 'ios';
  const [error, setError] = useState<string | null>(null);
  const [needsCheckout, setNeedsCheckout] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  const billing = useWorkspaceResource(async (workspaceId) => {
    const { workspaces } = await readWorkspaces();
    const role = workspaces.find((workspace) => workspace.id === workspaceId)?.role;
    try {
      if (!administers(role)) return { kind: 'member' as const, plans: (await readPlans()).plans };
      const [plans, state] = await Promise.all([readPlans(), readBilling(workspaceId)]);
      return { kind: 'ready' as const, plans: plans.plans, state };
    } catch (caught) {
      // No billing provider configured is an honest state, never a false plan.
      if (caught instanceof PlatformError && caught.status === 503) return { kind: 'unavailable' as const };
      // The server, which decides, refused (the role changed) or no longer knows this workspace.
      if (caught instanceof PlatformError && (caught.status === 403 || caught.status === 404)) {
        return { kind: 'refused' as const };
      }
      throw caught;
    }
  });

  // Back from the hosted page: what was bought or changed is read again.
  const reload = useRef(billing.reload);
  reload.current = billing.reload;
  useEffect(() => {
    if (!purchasing) return;
    const watching = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        setOpening(null);
        reload.current();
      }
    });
    return () => watching.remove();
  }, [purchasing]);

  /** Open a hosted page; `pressed` names what was pressed, for its "Opening…". */
  const leave = async (
    pressed: string,
    kind: 'checkout' | 'portal',
    open: (workspaceId: string) => Promise<HostedBillingSession>,
  ) => {
    if (opening) return;
    const workspaceId = workspaceIfShown(session, billing.loadedFor);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setError(null);
    setNeedsCheckout(false);
    setOpening(pressed);
    try {
      const address = hostedAddress(await open(workspaceId));
      if (!address) throw new Error('The billing service answered an unusable address.');
      await Linking.openURL(address);
    } catch (caught) {
      setOpening(null);
      // Only the portal documents a 409: no billing account yet — choose a plan.
      if (kind === 'portal' && caught instanceof PlatformError && caught.status === 409) setNeedsCheckout(true);
      else setError(refusalMessage(caught, {}, 'Billing could not be reached. Try again.'));
    }
  };

  if (billing.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (billing.status === 'offline') {
    return <ScreenOffline onRetry={billing.reload} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (billing.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('billing')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (billing.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('billing')}
        onRetry={billing.reload}
        body={busyBody(billing)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const data = billing.data;
  const muted = { color: palette.neutral[400] };
  const note =
    data.kind === 'member'
      ? 'Billing is managed by the owners and admins of this workspace.'
      : data.kind === 'refused'
        ? "You no longer have access to this workspace's billing."
        : data.kind === 'unavailable'
          ? 'Billing is unavailable right now.'
          : null;
  const state = data.kind === 'ready' ? data.state : null;
  const cards = data.kind === 'ready' || data.kind === 'member' ? planCards(data.plans, state) : [];
  // `canceled` and `unpaid` end access, which leaves the free floor; a
  // subscription the provider still holds is changed in the portal, and a
  // second checkout would start a second subscription (ADR-0025 §1).
  const accessEnded = state?.status === 'canceled' || state?.status === 'unpaid';
  const paying = state?.status !== undefined && state.status !== 'canceled';
  const enrolled = state ? (accessEnded ? FREE_PLAN_ID : state.planId) : null;
  const periodEnd = state?.currentPeriodEnd ? new Date(state.currentPeriodEnd).toLocaleDateString() : null;
  // The cards act only on iOS, and only for an owner or an admin.
  const acts = purchasing && data.kind === 'ready';

  const pressFor = (card: PlanCard): (() => void) | undefined => {
    if (!acts || card.planId === enrolled) return undefined;
    if (paying) return () => void leave(card.planId, 'portal', openPortal);
    if (card.planId === FREE_PLAN_ID) return undefined;
    return () => void leave(card.planId, 'checkout', (workspaceId) => checkoutOrPortal(workspaceId, card.planId));
  };

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <Text style={[styles.title, { color: palette.text }]}>Billing</Text>
      </View>

      {note ? <Text style={[styles.text, muted]}>{note}</Text> : null}
      {acts && needsCheckout ? (
        <Text style={[styles.text, muted]}>
          {cards.length > 1
            ? 'This workspace has no billing account yet. Choose a plan below to start one.'
            : 'This workspace has no billing account yet, and no plan can be bought right now.'}
        </Text>
      ) : null}

      {cards.length > 0 ? (
        <View style={styles.cards}>
          {cards.map((card) => {
            const isEnrolled = card.planId === enrolled;
            const paidPlan = isEnrolled && card.planId !== FREE_PLAN_ID;
            return (
              <View key={card.planId} testID={`plan-${card.planId}`} style={styles.slot}>
                <SurfaceCard
                  onPress={pressFor(card)}
                  style={[styles.planCard, isEnrolled && { borderWidth: 1, borderColor: palette.accent }]}>
                  <Text style={[styles.planName, { color: palette.text }]}>{card.name}</Text>
                  {card.price ? (
                    <Text style={[styles.planPrice, { color: palette.text }]}>{card.price}</Text>
                  ) : purchasing ? (
                    <Text style={[styles.text, muted]}>Price shown at checkout</Text>
                  ) : null}
                  {isEnrolled ? <Text style={[styles.small, { color: status.ok }]}>Enrolled</Text> : null}
                  {paidPlan && state?.status && state.status !== 'active' ? (
                    <Text style={[styles.text, muted]}>Status: {state.status.replace('_', ' ')}</Text>
                  ) : null}
                  {paidPlan && periodEnd && !accessEnded ? (
                    <Text style={[styles.text, muted]}>
                      {state?.cancelAtPeriodEnd ? 'Ends' : 'Renews'} {periodEnd}
                    </Text>
                  ) : null}
                  {paidPlan && acts && paying ? (
                    <PillButton
                      label={opening === 'portal' ? 'Opening…' : 'Manage billing'}
                      variant="secondary"
                      height={42}
                      icon={CreditCard}
                      iconSize={15}
                      disabled={opening !== null}
                      onPress={() => void leave('portal', 'portal', openPortal)}
                      style={styles.manage}
                    />
                  ) : null}
                  {opening === card.planId ? <Text style={[styles.small, muted]}>Opening…</Text> : null}
                </SurfaceCard>
              </View>
            );
          })}
        </View>
      ) : null}
      {data.kind === 'ready' && cards.length === 1 ? (
        <Text style={[styles.text, muted]}>No plans are available to purchase right now.</Text>
      ) : null}
      {error ? <Text style={[styles.text, { color: status.err }]}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: layout.screenX, paddingBottom: 32, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: fonts.medium, fontSize: typeScale.heading.fontSize, letterSpacing: em(-0.01, typeScale.heading.fontSize) },
  // The cards share what is left of the screen, each at least this tall.
  cards: { flex: 1, gap: 12 },
  slot: { flex: 1 },
  planCard: { flex: 1, minHeight: 136, justifyContent: 'center', gap: 8, padding: 20 },
  planName: { fontFamily: fonts.medium, fontSize: typeScale.lead.fontSize },
  planPrice: { fontFamily: fonts.medium, fontSize: typeScale.display.fontSize, letterSpacing: em(-0.015, typeScale.display.fontSize) },
  manage: { marginTop: 4 },
  text: { fontFamily: fonts.regular, ...typeScale.body },
  small: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
});
