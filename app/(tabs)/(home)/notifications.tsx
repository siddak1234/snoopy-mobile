import React from 'react';

import { Inbox } from '@/components/notifications/inbox';

/** Notifications, from Home's bell (design `sNotifs`). A run opens in the Home stack. */
export default function NotificationsScreen() {
  return <Inbox runPath="/(tabs)/(home)/run" />;
}
