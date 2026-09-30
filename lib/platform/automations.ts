import type { components } from '@/lib/generated/platform-contracts/automations';
import { platformOperation } from './client';
import { PlatformError } from './problem';

export type Subscription = components['schemas']['Subscription'];
export type SubscriptionStatus = components['schemas']['SubscriptionStatus'];
export type Run = components['schemas']['Run'];
export type Approval = components['schemas']['Approval'];
export type AutomationRunInputField = components['schemas']['AutomationRunInputField'];
export type WebhookEndpoint = components['schemas']['WebhookEndpoint'];
export type IssuedWebhookEndpoint = components['schemas']['IssuedWebhookEndpoint'];
export type UploadTicket = components['schemas']['UploadTicket'];
export type UploadedFile = components['schemas']['UploadedFile'];

export function createSubscription(
  workspaceId: string,
  /** `projectId` scopes it to one project (18.6.2); without one it is workspace-wide. */
  input: { templateId: string; templateVersion?: number; name?: string; projectId?: string },
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
  input: {
    name?: string;
    config?: Record<string, unknown>;
    status?: SubscriptionStatus;
    /** Move to another version of its automation (backend §12.1 #126, BUILD-PLAN 24.4.1). */
    templateVersion?: number;
  },
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

/**
 * A subscription's webhook address, without its secret — `null` when none has
 * been issued (backend §12.1 #91, BUILD-PLAN 24.4.1). Owner or admin only; the
 * Edge refuses a member with 403. Ported from `snoopy/lib/automations.ts`.
 */
export async function readWebhookAddress(
  workspaceId: string,
  subscriptionId: string,
): Promise<WebhookEndpoint | null> {
  try {
    return await platformOperation(
      `/v1/workspaces/${workspaceId}/subscriptions/${subscriptionId}/webhook`,
      ({ automations }, signal) =>
        automations.GET('/v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/webhook', {
          params: { path: { workspaceId, subscriptionId } },
          signal,
        }),
    );
  } catch (error) {
    if (error instanceof PlatformError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Issues the address, or gives it a new secret (`rotated: true`). The secret is
 * in THIS answer and never again: the caller shows it once and stores it
 * nowhere — not state that outlives the dialog, not the Keychain. Not
 * replayable, so it carries no idempotency key: a retry rotates again, and the
 * secret last shown is the one that works.
 */
export function issueWebhookAddress(
  workspaceId: string,
  subscriptionId: string,
): Promise<IssuedWebhookEndpoint> {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/subscriptions/${subscriptionId}/webhook`,
    ({ automations }, signal) =>
      automations.POST('/v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/webhook', {
        params: { path: { workspaceId, subscriptionId } },
        signal,
      }),
  );
}

/**
 * Somewhere to put a file a run will read (FR-14): a URL to PUT the bytes to,
 * straight to the store. `sizeBytes` is signed into the URL, so it must be the
 * exact length of the bytes `putFileToSignedUrl` then sends.
 */
export function openUpload(
  workspaceId: string,
  body: { subscriptionId: string; filename: string; contentType: string; sizeBytes: number },
): Promise<UploadTicket> {
  return platformOperation(`/v1/workspaces/${workspaceId}/uploads`, ({ automations }, signal) =>
    automations.POST('/v1/workspaces/{workspaceId}/uploads', {
      params: { path: { workspaceId } },
      body,
      signal,
    }),
  );
}

/** The store's measurement of what arrived, as a file a run can be given. */
export async function completeUpload(
  workspaceId: string,
  uploadSessionId: string,
): Promise<UploadedFile> {
  const completed = await platformOperation(
    `/v1/workspaces/${workspaceId}/uploads/${uploadSessionId}/complete`,
    ({ automations }, signal) =>
      automations.POST('/v1/workspaces/{workspaceId}/uploads/{uploadSessionId}/complete', {
        params: { path: { workspaceId, uploadSessionId } },
        body: {},
        signal,
      }),
  );
  return completed.artifact;
}

/**
 * Cancel a run that has not ended. The platform cancels only a `pending` or
 * `running` run and answers 404 for any other — already finished, held, or not
 * this workspace's — so a caller says a 404 as "it has already stopped".
 */
export function cancelRun(workspaceId: string, runId: string): Promise<{ run: Run }> {
  return platformOperation(`/v1/workspaces/${workspaceId}/runs/${runId}/cancel`, ({ automations }, signal) =>
    automations.POST('/v1/workspaces/{workspaceId}/runs/{runId}/cancel', {
      params: { path: { workspaceId, runId } },
      signal,
    }),
  );
}

