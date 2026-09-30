import { useRouter } from 'expo-router';
import { CreditCard } from 'phosphor-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { em, fonts, layout, status } from '@/constants/theme';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { errorTitleFor } from '@/lib/content/screen-states';
import { hostedAddress, openCheckout, openPortal, readBilling, readPlans } from '@/lib/platform/billing';
import { PlatformError } from '@/lib/platform/problem';
import { readWorkspaces } from '@/lib/platform/workspaces';
import { formatPlanPrice } from '@/lib/view/plan-price';
import { administers } from '@/lib/view/roles';

/** Capabilities with words; a name without them is not printed (backend §12.1 #163). */
const CAPABILITY: Record<string, string> = {
  'automation.subscribe': 'Automations',
  'workspace.rate': 'Requests per minute',
};

/**
 * Settings → Billing (BUILD-PLAN 24.6.1, ADR-0032 option B) — the website's
 * billing page. Every platform shows the plan, its price and the workspace's
 * billing status. On iOS, Choose plan and Manage billing open ADR-0025's hosted
 * checkout and portal in the SYSTEM browser, and billing is read again when the
 * app comes back to the foreground. Android shows no purchase control or call
 * to action. There is no in-app purchase.
 *
 * A plan and its status are an owner's or an admin's to see (ADR-0025); anyone
 * else is told who manages billing, and nothing is read for them.
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
    if (!administers(role)) return { kind: 'member' as const };
    try {
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

  const leave = async (action: string, open: (workspaceId: string) => Promise<{ url: string; expiresAt: string }>) => {
    if (opening) return;
    const workspaceId = workspaceIfShown(session, billing.loadedFor);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setError(null);
    setNeedsCheckout(false);
    setOpening(action);
    try {
      const address = hostedAddress(await open(workspaceId));
      if (!address) throw new Error('The billing service answered an unusable address.');
      await Linking.openURL(address);
    } catch (caught) {
      setOpening(null);
      // Only the portal documents a 409: no billing account yet — choose a plan.
      if (action === 'portal' && caught instanceof PlatformError && caught.status === 409) setNeedsCheckout(true);
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

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <Text style={[styles.title, { color: palette.text }]}>Billing</Text>
      </View>

      {note || data.kind !== 'ready' ? (
        <SurfaceCard style={styles.pad}>
          <Text style={[styles.text, muted]}>{note}</Text>
        </SurfaceCard>
      ) : (
        (() => {
          const { plans, state } = data;
          // `canceled` and `unpaid` end access; a subscription the provider still
          // holds is changed in the portal, and a second checkout would start a
          // second subscription (ADR-0025 §1).
          const accessEnded = state.status === 'canceled' || state.status === 'unpaid';
          const portalManaged = state.status !== undefined && state.status !== 'canceled';
          const periodEnd = state.currentPeriodEnd ? new Date(state.currentPeriodEnd).toLocaleDateString() : null;
          return (
            <>
              <View>
                <SectionLabel>CURRENT PLAN</SectionLabel>
                <SurfaceCard style={[styles.card, styles.pad]}>
                  <Text style={[styles.plan, { color: palette.text }]}>{state.displayName}</Text>
                  {state.status ? <Text style={[styles.text, muted]}>Status: {state.status.replace('_', ' ')}</Text> : null}
                  {periodEnd && !accessEnded ? (
                    <Text style={[styles.text, muted]}>
                      {state.cancelAtPeriodEnd ? 'Ends' : 'Renews'} {periodEnd}
                    </Text>
                  ) : null}
                  {purchasing ? (
                    <PillButton
                      label={opening === 'portal' ? 'Opening…' : 'Manage billing'}
                      variant="secondary"
                      height={42}
                      icon={CreditCard}
                      iconSize={15}
                      disabled={opening !== null}
                      onPress={() => leave('portal', openPortal)}
                    />
                  ) : null}
                  {purchasing && needsCheckout ? (
                    <Text style={[styles.text, muted]}>
                      {plans.length > 0
                        ? 'This workspace has no billing account yet. Choose a plan below to start one.'
                        : 'This workspace has no billing account yet, and no plan can be bought right now.'}
                    </Text>
                  ) : null}
                </SurfaceCard>
              </View>

              <View>
                <SectionLabel>PLANS</SectionLabel>
                {purchasing && portalManaged ? (
                  <Text style={[styles.text, styles.lead, muted]}>
                    To change or cancel your plan, or to finish a payment, use Manage billing.
                  </Text>
                ) : null}
                {plans.length === 0 ? (
                  <Text style={[styles.text, styles.lead, muted]}>No plans are available to purchase right now.</Text>
                ) : null}
                {plans.map((plan) => {
                  const current = !accessEnded && plan.planId === state.planId;
                  const price = plan.price ? formatPlanPrice(plan.price) : undefined;
                  return (
                    <View key={plan.planId} testID={`plan-${plan.planId}`}>
                    <SurfaceCard style={[styles.card, styles.pad]}>
                      <Text style={[styles.plan, { color: palette.text }]}>{plan.displayName}</Text>
                      {price ? (
                        <Text style={[styles.text, { color: palette.text }]}>{price}</Text>
                      ) : purchasing ? (
                        <Text style={[styles.text, muted]}>Price shown at checkout</Text>
                      ) : null}
                      {Object.entries(plan.capabilities)
                        .filter(([name]) => Object.prototype.hasOwnProperty.call(CAPABILITY, name))
                        .map(([name, allowance]) => (
                          <Text key={name} style={[styles.small, muted]}>
                            {CAPABILITY[name]} {allowance}
                          </Text>
                        ))}
                      {current ? (
                        <Text style={[styles.small, { color: status.ok }]}>Current plan</Text>
                      ) : purchasing && !portalManaged ? (
                        <PillButton
                          label={opening === plan.planId ? 'Opening…' : 'Choose plan'}
                          variant="primary"
                          height={40}
                          disabled={opening !== null}
                          onPress={() => leave(plan.planId, (workspaceId) => openCheckout(workspaceId, plan.planId))}
                        />
                      ) : null}
                    </SurfaceCard>
                    </View>
                  );
                })}
              </View>
            </>
          );
        })()
      )}
      {error ? <Text style={[styles.text, { color: status.err }]}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: 32, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: fonts.medium, fontSize: 21, letterSpacing: em(-0.01, 21) },
  card: { marginTop: 9 },
  pad: { padding: 14, gap: 8 },
  lead: { marginTop: 8 },
  plan: { fontFamily: fonts.medium, fontSize: 15 },
  text: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  small: { fontFamily: fonts.regular, fontSize: 12 },
});
