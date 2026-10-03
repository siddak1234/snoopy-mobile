import React from 'react';

import { Inbox } from '@/components/notifications/inbox';

/**
 * Settings › Notifications (24.12, the owner's decision 10): the inbox itself,
 * in the Settings stack. The platform has no notification settings and no push
 * contract (DESIGN-CONTRACT's refusal map), so notifications are the in-app
 * inbox composed from approvals and failed runs. Its runs open in Settings too,
 * so Back returns to Settings — an "Open inbox" row pushed Home's inbox, a push
 * across tabs, and Back landed in Home.
 */
export default function NotificationSettingsScreen() {
  return <Inbox runPath="/(tabs)/settings/run" />;
}
