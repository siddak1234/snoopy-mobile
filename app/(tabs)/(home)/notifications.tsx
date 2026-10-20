import React from 'react';

import { Inbox } from '@/components/notifications/inbox';

/** Notifications, from Home's bell (design `sNotifs`). A run opens in Activity, and Back returns here (round 24 P5). */
export default function NotificationsScreen() {
  return <Inbox returnTo="home" />;
}
