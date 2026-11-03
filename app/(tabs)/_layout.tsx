import { Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { NocturneTabBar } from '@/components/nocturne/tab-bar';
import { OutsideSignIn } from '@/components/outside-sign-in';
import { StatusBarStrip } from '@/components/status-bar-strip';
import { usePushRegistration } from '@/hooks/use-push-registration';
import { useSession } from '@/hooks/use-session';
import { outsideSignIns, type OutsideSignIn as SignIn } from '@/lib/content/refusals';
import { onOutsideSignIn } from '@/lib/platform/session-recovery';

/**
 * The protected half of the app.
 *
 * `DESIGN-CONTRACT.md` requires the auth boundary to be enforced "at the
 * route/layout level, not per screen". It is the root layout's
 * (`app/_layout.tsx`): the root stack keeps these tabs only for `signed-in`,
 * and in any other state removes them and shows the cover (BUILD-PLAN
 * 24.11.6), whose "Get started" leads to Sign in. Being unconfigured or
 * temporarily unreachable is not proof of identity and must not open customer
 * data.
 *
 * Here, anything but `signed-in` draws nothing, so protected content never
 * flashes while the root's guard takes the tabs away — nor does a session the
 * Face ID lock still holds (`locked`, the root guard's other half; the build
 * 13 review). It never navigates: from inside the tabs "/" names Home, not the
 * cover, and the redirect to it that stood here replaced the tabs with
 * themselves, again and again (the owner's build 12 item 6).
 *
 * Over every tab's screens, one strip behind the status bar (round 24 P11,
 * `components/status-bar-strip.tsx`), so nothing scrolls under the clock.
 *
 * A domain-only organization's workspace that refuses the person for a
 * sign-in outside its verified domains (the stage 1 spec's S1-11; backend
 * §12.1 #221, option b′: whichever read answers 403 `outside_org_domain`, the
 * transport says so, `onOutsideSignIn`) draws its own screen in the tabs'
 * place (`OutsideSignIn`), until each sign-in it names is removed; then the
 * tabs come back and read again.
 */
export default function TabLayout() {
  const session = useSession();
  const open = session.status === 'signed-in' && !session.locked;
  // Device push for the signed-in person (build 11, D8): an allowed phone kept
  // registered, the banner in the foreground, a tap's way in. Called before the
  // guard, as every hook is, and idle until the session is open — signed in and
  // past the Face ID lock — so a tap's screen waits for the lock as it waits
  // for a sign-in. It never asks.
  usePushRegistration(open);
  const [outside, setOutside] = useState<SignIn[] | null>(null);
  useEffect(() => onOutsideSignIn((details) => setOutside((shown) => shown ?? outsideSignIns(details))), []);

  if (!open) return null;
  if (outside) return <OutsideSignIn providers={outside} onCleared={() => setOutside(null)} />;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => <NocturneTabBar {...props} />}
        screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="(home)" options={{ title: 'Home' }} />
        <Tabs.Screen name="flows" options={{ title: 'Flows' }} />
        <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      </Tabs>
      <StatusBarStrip />
    </View>
  );
}
