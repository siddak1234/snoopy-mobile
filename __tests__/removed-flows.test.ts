jest.mock('@/lib/platform/client', () => ({ platformOperation: jest.fn(), newIdempotencyKey: jest.fn(() => 'k') }));

import { readRemovedSubscriptions, readRemovedSubscriptionsOrNone } from '@/lib/platform/runs';
import { PlatformError } from '@/lib/platform/problem';
import { fakePlatform } from '@/test/fake-platform';
import { TEST_WORKSPACE, subscriptionsPayload } from '@/test/platform';

const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * Removed flows are asked for by name (BUILD-PLAN 24.11.8, backend §12.1 #203):
 * the default list never holds them, and a platform from before the
 * SEVENTEENTH promotion ignores the filter and answers the live list.
 */
describe('the removed flows read', () => {
  it('asks with status=archived and keeps only rows that are archived', async () => {
    const fake = fakePlatform(platformOperation);
    const live = subscriptionsPayload().subscriptions;
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', {
      subscriptions: [...live, { ...live[0]!, id: 'gone', status: 'archived' }],
    });
    const answer = await readRemovedSubscriptions(TEST_WORKSPACE);
    expect(answer.subscriptions.map((subscription) => subscription.id)).toEqual(['gone']);
    const [sent] = fake.to('GET /v1/workspaces/{workspaceId}/subscriptions');
    expect(sent!.query).toEqual({ status: 'archived' });
    expect(sent!.values).toEqual({ workspaceId: TEST_WORKSPACE });
  });

  it('is nothing — never a failure — where a screen only notes the removed ones', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', () => {
      throw new PlatformError('The platform is busy right now.', 429);
    });
    await expect(readRemovedSubscriptionsOrNone(TEST_WORKSPACE)).resolves.toEqual({ subscriptions: [] });
    await expect(readRemovedSubscriptions(TEST_WORKSPACE)).rejects.toBeInstanceOf(PlatformError);
  });
});
