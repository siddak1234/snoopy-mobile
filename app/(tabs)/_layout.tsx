import { Tabs } from 'expo-router';
import React from 'react';

import { NocturneTabBar } from '@/components/nocturne/tab-bar';

export default function TabLayout() {
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
