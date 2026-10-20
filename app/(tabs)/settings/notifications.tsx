import React from 'react';

import { Inbox } from '@/components/notifications/inbox';

/**
 * Settings › Notifications (24.12, the owner's decision 10): the inbox itself,
 * in the Settings stack. The platform has no notification settings and no
 * notifications route (DESIGN-CONTRACT's refusal map), so notifications are the
 * in-app inbox composed from approvals and failed runs, and its card is where
 * device push is asked for (build 11, D8). Its runs open in Activity and Back
 * returns to Settings (round 24 P5; ~~in Settings' own copy of the run page~~).
 */
export default function NotificationSettingsScreen() {
  return <Inbox returnTo="settings" />;
}
