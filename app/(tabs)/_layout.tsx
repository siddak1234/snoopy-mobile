import { Tabs } from 'expo-router';
import React from 'react';

import { NocturneTabBar } from '@/components/nocturne/tab-bar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <NocturneTabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="flows" options={{ title: 'Flows' }} />
      <Tabs.Screen name="builder" options={{ title: 'Build' }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
