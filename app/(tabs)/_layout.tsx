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
 * `restoring` renders nothing so protected content never flashes. Every resolved
 * state other than `signed-in` returns to the auth stack. Being unconfigured or
 * temporarily unreachable is not proof of identity and must not open customer
 * data—the auth screen can render those honest states without weakening this
 * boundary.
 */
export default function TabLayout() {
  const session = useSession();

  if (session.status === 'restoring') return null;

  if (session.status !== 'signed-in') {
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
