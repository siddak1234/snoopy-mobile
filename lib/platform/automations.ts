import type { components } from '@/lib/generated/platform-contracts/automations';
import { platformOperation } from './client';

export type Subscription = components['schemas']['Subscription'];
export type SubscriptionStatus = components['schemas']['SubscriptionStatus'];
export type Run = components['schemas']['Run'];
export type Approval = components['schemas']['Approval'];

export function createSubscription(
  workspaceId: string,
  input: { templateId: string; templateVersion?: number; name?: string },
  idempotencyKey: string,
): Promise<{ subscription: Subscription }> {
  return platformOperation(`/v1/workspaces/${workspaceId}/subscriptions`, ({ automations }, signal) =>
    automations.POST('/v1/workspaces/{workspaceId}/subscriptions', {
      params: {
        path: { workspaceId },
        header: { 'Idempotency-Key': idempotencyKey },
      },
      body: input,
      signal,
    }),
  );
}

export function updateSubscription(
  workspaceId: string,
  subscriptionId: string,
  input: { name?: string; config?: Record<string, unknown>; status?: SubscriptionStatus },
  idempotencyKey: string,
): Promise<{ subscription: Subscription }> {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/subscriptions/${subscriptionId}`,
    ({ automations }, signal) =>
      automations.PATCH('/v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}', {
        params: {
          path: { workspaceId, subscriptionId },
          header: { 'Idempotency-Key': idempotencyKey },
        },
        body: input,
        signal,
      }),
  );
}

export function createRun(
  workspaceId: string,
  subscriptionId: string,
  idempotencyKey: string,
  input?: Record<string, unknown>,
): Promise<{ run: Run }> {
  return platformOperation(`/v1/workspaces/${workspaceId}/runs`, ({ automations }, signal) =>
    automations.POST('/v1/workspaces/{workspaceId}/runs', {
      params: {
        path: { workspaceId },
        header: { 'Idempotency-Key': idempotencyKey },
      },
      body: { subscriptionId, ...(input ? { input } : {}) },
      signal,
    }),
  );
}

export function decideApproval(
  workspaceId: string,
  approvalId: string,
  decision: 'approved' | 'rejected',
  idempotencyKey: string,
): Promise<{ approval: Approval; continuation?: Run }> {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/approvals/${approvalId}/decision`,
    ({ automations }, signal) =>
      automations.POST('/v1/workspaces/{workspaceId}/approvals/{approvalId}/decision', {
        params: {
          path: { workspaceId, approvalId },
          header: { 'Idempotency-Key': idempotencyKey },
        },
        body: { decision },
        signal,
      }),
  );
}
