import type { components } from '@/lib/generated/platform-contracts/automations';
import { platformOperation } from './client';
import { invalidateShared, shared } from './snapshot';

export type InboxNotification = components['schemas']['InboxNotification'];
export type NotificationInbox = components['schemas']['NotificationInbox'];

/**
 * The notification inbox, kept by the platform (the owner's build 13 decision 3A,
 * reversing §12.1 #71): its held runs and failed runs, newest first, each with
 * whether this person has read it; what this person dismissed is not listed.
 * One read and dismissal for every device, so the bell, the inbox and another
 * phone agree.
 */
export function readInbox(workspaceId: string): Promise<NotificationInbox> {
  return shared(workspaceId, 'inbox', 'volatile', () =>
    platformOperation(`/v1/workspaces/${workspaceId}/notifications`, ({ automations }, signal) =>
      automations.GET('/v1/workspaces/{workspaceId}/notifications', {
        params: { path: { workspaceId } },
        signal,
      }),
    ),
  );
}

/** Marks `ids` read — or, with none, every item the inbox lists. Answers the unread count after. */
export function markInboxRead(
  workspaceId: string,
  ids: readonly string[] | undefined,
  idempotencyKey: string,
): Promise<{ unreadCount: number }> {
  return platformOperation(`/v1/workspaces/${workspaceId}/notifications/read`, ({ automations }, signal) =>
    automations.POST('/v1/workspaces/{workspaceId}/notifications/read', {
      params: { path: { workspaceId }, header: { 'Idempotency-Key': idempotencyKey } },
      body: ids ? { ids: [...ids] } : {},
      signal,
    }),
  ).then(changedInbox(workspaceId));
}

/** Dismisses one item: it leaves the inbox, read, on every device. */
export function dismissInboxItem(
  workspaceId: string,
  notificationId: string,
  idempotencyKey: string,
): Promise<{ unreadCount: number }> {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/notifications/${encodeURIComponent(notificationId)}/dismiss`,
    ({ automations }, signal) =>
      automations.POST('/v1/workspaces/{workspaceId}/notifications/{notificationId}/dismiss', {
        params: {
          path: { workspaceId, notificationId },
          header: { 'Idempotency-Key': idempotencyKey },
        },
        signal,
      }),
  ).then(changedInbox(workspaceId));
}

function changedInbox<T>(workspaceId: string): (answer: T) => T {
  return (answer) => {
    invalidateShared(workspaceId, ['inbox']);
    return answer;
  };
}
