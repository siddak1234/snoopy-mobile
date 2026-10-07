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
import { FREE_PLAN_ID, accessEnded, enrolledPlanId } from '@/lib/view/billing';
import { formatPlanPrice } from '@/lib/view/plan-price';
import { administers } from '@/lib/view/roles';

/** The owner's Free card (decision 7 of 2026-10-02): drawn by the app, at no cost. */
const FREE_PRICE: PlanPrice = { amount: 0, currency: 'usd', interval: 'month' };
/**
 * Pro, drawn until the platform lists it (build 11, D2; the owner's build 10
 * item 3: "I said free plus and pro"): the price the owner set, $10.00 a
 * month, which Stripe has not stated yet — so the card is inert on every
 * platform and for every role: a checkout for it would answer 404, and the
 * portal has no Pro to switch to. A Pro the platform lists replaces it.
 */
const PRO_PLAN_ID = 'pro';
const PRO_PRICE: PlanPrice = { amount: 1000, currency: 'usd', interval: 'month' };

type PlanCard = {
  planId: string;
  name: string;
  price?: string;
  /** Drawn by the app, not listed by the platform: nothing to buy or manage. */
  drawn?: true;
};

/**
 * The cards, in order: Free, then the platform's plans by price (today Plus —
 * the `team` plan, which the platform names Plus), then Pro, drawn while the
 * platform does not list it. Each is its name and its price only.
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
  const pro: PlanCard[] = paid.some((plan) => plan.planId === PRO_PLAN_ID)
    ? []
    : [{ planId: PRO_PLAN_ID, name: 'Pro', price: formatPlanPrice(PRO_PRICE), drawn: true }];
  return [
    {
      planId: FREE_PLAN_ID,
      name: state?.planId === FREE_PLAN_ID ? state.displayName : 'Free',
      price: formatPlanPrice(FREE_PRICE),
    },
    ...paid,
    ...pro,
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
 * owner's decisions 7 and 8 of 2026-10-02, 24.12; compact since build 11, D2 —
 * "the components dont need to be that big") — the plans as cards at their
 * natural height, Free, Plus and Pro, each its name and price; the
 * workspace's own says "Enrolled", and a paid one adds its status. Pro is
 * drawn by the app until the platform lists it, and that card does nothing.
 * On iOS a listed card is the action:
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
      // A real request at every visit, never the snapshot's answer: the plan
      // shown here is the one acted on (the build 11 review).
      const [plans, state] = await Promise.all([readPlans(), readBilling(workspaceId, { fresh: true })]);
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
    return <ScreenOffline onRetry={() => billing.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (billing.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('billing')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (billing.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('billing')}
        onRetry={() => billing.reload()}
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
  // The enrolled plan is the shared rule's (`lib/view/billing.ts`): `canceled`
  // and `unpaid` end access, which leaves the free floor; a subscription the
  // provider still holds is changed in the portal, and a second checkout would
  // start a second subscription (ADR-0025 §1).
  const ended = state ? accessEnded(state) : false;
  const paying = state?.status !== undefined && state.status !== 'canceled';
  const enrolled = state ? enrolledPlanId(state) : null;
  // What the platform sells: the drawn Pro and the Free floor are not for sale.
  const purchasable = cards.filter((card) => !card.drawn && card.planId !== FREE_PLAN_ID);
  const periodEnd = state?.currentPeriodEnd ? new Date(state.currentPeriodEnd).toLocaleDateString() : null;
  // The cards act only on iOS, and only for an owner or an admin.
  const acts = purchasing && data.kind === 'ready';
  // Free is not a provider price, so the portal cannot list it: moving to Free is
  // cancelling the paid plan there (the owner's build 13 decision 7c, feedback #12).
  const enrolledName = cards.find((card) => card.planId === enrolled && card.planId !== FREE_PLAN_ID)?.name;

  const pressFor = (card: PlanCard): (() => void) | undefined => {
    // The drawn Pro is inert everywhere: no checkout (a 404), no portal (no Pro there).
    if (card.drawn || !acts || card.planId === enrolled) return undefined;
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
          {purchasable.length > 0
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
              <View key={card.planId} testID={`plan-${card.planId}`}>
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
                  {paidPlan && periodEnd && !ended ? (
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
                  {card.planId === FREE_PLAN_ID && acts && paying && enrolledName ? (
                    <Text style={[styles.text, muted]}>To move to Free, cancel {enrolledName} in Manage billing.</Text>
                  ) : null}
                  {opening === card.planId ? <Text style={[styles.small, muted]}>Opening…</Text> : null}
                </SurfaceCard>
              </View>
            );
          })}
        </View>
      ) : null}
      {data.kind === 'ready' && purchasable.length === 0 ? (
        <Text style={[styles.text, muted]}>No plans are available to purchase right now.</Text>
      ) : null}
      {error ? <Text style={[styles.text, { color: status.err }]}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: 32, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: fonts.medium, fontSize: typeScale.heading.fontSize, letterSpacing: em(-0.01, typeScale.heading.fontSize) },
  // Compact (build 11, D2): each card is as tall as its name, price and status line, no taller.
  cards: { gap: 12 },
  planCard: { gap: 6, padding: layout.cardPad },
  planName: { fontFamily: fonts.medium, fontSize: typeScale.lead.fontSize },
  planPrice: { fontFamily: fonts.medium, fontSize: typeScale.title.fontSize, letterSpacing: em(-0.01, typeScale.title.fontSize) },
  manage: { marginTop: 4 },
  text: { fontFamily: fonts.regular, ...typeScale.body },
  small: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
});
