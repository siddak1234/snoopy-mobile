import { Redirect, Tabs } from 'expo-router';
import React from 'react';

import { NocturneTabBar } from '@/components/nocturne/tab-bar';
import { useSession } from '@/hooks/use-session';

/**
 * The protected half of the app.
 *
 * `DESIGN-CONTRACT.md` requires the auth boundary to be enforced "at the
 * route/layout level, not per screen", so it lives here: one check in front of
 * every tab, rather than a condition each screen could forget.
 *
 * Only a real 401 from a reachable Edge (`signed-out`) redirects. An
 * unconfigured or unreachable backend is not an authentication failure — and in
 * the unconfigured case the app is the design prototype, whose browsability is
 * the asset this round protects. Those states fall through to the screens, which
 * render their designed empty or error treatment.
 *
 * `restoring` also falls through. The check resolves in one request against a
 * process-local store, and blanking the tab shell for that moment would flash a
 * state the design does not draw.
 */
export default function TabLayout() {
  const session = useSession();

  if (session.status === 'signed-out') {
    return <Redirect href="/(auth)/welcome" />;
  }

  return (
    <Tabs
      tabBar={(props) => <NocturneTabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="(home)" options={{ title: 'Home' }} />
      <Tabs.Screen name="flows" options={{ title: 'Flows' }} />
      <Tabs.Screen name="solutions" options={{ title: 'Solutions' }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
