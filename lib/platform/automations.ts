import type { components } from '@/lib/generated/platform-contracts/automations';
import { platformOperation } from './client';
import { PlatformError } from './problem';
import type { ReviewBody } from './pending-contract';
import { invalidateShared } from './snapshot';

export type Subscription = components['schemas']['Subscription'];
export type SubscriptionStatus = components['schemas']['SubscriptionStatus'];
export type Run = components['schemas']['Run'];
export type Approval = components['schemas']['Approval'];
export type AutomationRunInputField = components['schemas']['AutomationRunInputField'];
export type WebhookEndpoint = components['schemas']['WebhookEndpoint'];
export type IssuedWebhookEndpoint = components['schemas']['IssuedWebhookEndpoint'];
export type UploadTicket = components['schemas']['UploadTicket'];
export type UploadedFile = components['schemas']['UploadedFile'];
export type FlowEmailRecipients = components['schemas']['FlowEmailRecipients'];
export type AutomationItems = components['schemas']['AutomationItems'];
export type AutomationItemField = components['schemas']['AutomationItemField'];
export type Item = components['schemas']['Item'];
export type RunSection = components['schemas']['RunSection'];
export type RunFile = components['schemas']['RunFile'];
export type RunFileLink = components['schemas']['RunFileLink'];
/** One of the thirteen blocks a run's or an item's page body is made of (backend ADR-0048 and its amendment 1, `BLOCK_SET_VERSION` 2). */
export type Block = components['schemas']['Block'];
export type BlockOpen = components['schemas']['BlockOpen'];
/** Each page's parts, in the order the flow's pinned manifest gives (backend ADR-0048 decision 5). */
export type FlowPages = components['schemas']['FlowPages'];

/**
 * What an action changed is read again next time, and only that (24.9.1): a
 * subscription's change also moves the catalog's `subscribed` flag; a run or a
 * decision moves the runs and their counts.
 */
function changed<T>(workspaceId: string, keys: readonly string[]): (answer: T) => T {
  return (answer) => {
    invalidateShared(workspaceId, keys);
    return answer;
  };
}

/**
 * Adds a flow. No team is sent: the platform puts it in its category's team,
 * making that team when the workspace has none, and puts the person who added
 * it on the team once the add commits (backend ADR-0036). So an add can change
 * the teams this person sees too — the teams are read again next time, and the
 * flow's page says "Team: Accounting" at once, never "a team" from a list read
 * before the team existed (the review of the Invoice Processing screens).
 *
 * No version is sent (Build 22, P4; backend ADR-0041): a new flow runs its
 * automation's newest version, and the platform moves every flow to each new
 * one — "The user always gets the latest version. They dont get to oick when to
 * update" (the owner, build 21 item 7). ~~`templateVersion`~~ until Build 22.
 */
export function createSubscription(
  workspaceId: string,
  input: { templateId: string; name?: string },
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
  ).then(changed(workspaceId, ['subscriptions', 'catalog', 'projects']));
}

export function updateSubscription(
  workspaceId: string,
  subscriptionId: string,
  input: {
    name?: string;
    config?: Record<string, unknown>;
    status?: SubscriptionStatus;
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
  ).then(changed(workspaceId, ['subscriptions', 'catalog']));
}

/**
 * Starts a run. A run of a flow with items names one (`itemId`, backend
 * ADR-0046): owners and admins only, the item this flow's, read and not
 * archived; a flow without items is never sent one.
 */
export function createRun(
  workspaceId: string,
  subscriptionId: string,
  idempotencyKey: string,
  input?: Record<string, unknown>,
  itemId?: string,
): Promise<{ run: Run }> {
  return platformOperation(`/v1/workspaces/${workspaceId}/runs`, ({ automations }, signal) =>
    automations.POST('/v1/workspaces/{workspaceId}/runs', {
      params: {
        path: { workspaceId },
        header: { 'Idempotency-Key': idempotencyKey },
      },
      body: { subscriptionId, ...(input ? { input } : {}), ...(itemId ? { itemId } : {}) },
      signal,
    }),
  ).then(changed(workspaceId, ['runs', 'run-stats']));
}

/**
 * A flow's items (backend ADR-0046), newest first, archived ones left out, and
 * every value typed for each of its `allowOther` fields (`choices`). Any member
 * may read them, as runs are read. Never from the snapshot: a page that shows
 * an item being read asks again until it is not.
 */
export function readItems(
  workspaceId: string,
  subscriptionId: string,
): Promise<{ items: Item[]; choices: Record<string, string[]> }> {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/subscriptions/${subscriptionId}/items`,
    ({ automations }, signal) =>
      automations.GET('/v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items', {
        params: { path: { workspaceId, subscriptionId } },
        signal,
      }),
  );
}

/**
 * Makes an item from an uploaded file and starts the run that reads it (backend
 * ADR-0046): owners and admins only. `fields` by the flow's `items.fields` keys;
 * `file` the id the upload completed with. Idempotent by key: a retry answers
 * the same item and reads the file once.
 */
export function createItem(
  workspaceId: string,
  subscriptionId: string,
  body: { fields: Record<string, string>; file: string },
  idempotencyKey: string,
): Promise<{ item: Item }> {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/subscriptions/${subscriptionId}/items`,
    ({ automations }, signal) =>
      automations.POST('/v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items', {
        params: {
          path: { workspaceId, subscriptionId },
          header: { 'Idempotency-Key': idempotencyKey },
        },
        body,
        signal,
      }),
  );
}

/**
 * One item as its page body (backend ADR-0046; ADR-0048): `shape=blocks`, so the
 * answer carries `blocks` — tiles, the file, Add, the ranked runs, in its flow's
 * `pages.item` order — `going` while it or a run of it goes on, and the item's
 * reading on `item.blocks`; `runs` comes as `[]`, the ranked runs being a block.
 * A build before this one never sends the parameter and keeps the legacy answer.
 */
export function readItem(
  workspaceId: string,
  itemId: string,
): Promise<{ item: Item; runs: Run[]; blocks?: Block[]; going?: boolean }> {
  return platformOperation(`/v1/workspaces/${workspaceId}/items/${itemId}`, ({ automations }, signal) =>
    automations.GET('/v1/workspaces/{workspaceId}/items/{itemId}', {
      params: { path: { workspaceId, itemId }, query: { shape: 'blocks' } },
      signal,
    }),
  );
}

/**
 * The file an item was made from, behind a short-lived signed link (Round 19,
 * build 28): a reference and its link, never its bytes. The link downloads the
 * file as an attachment, so a page that shows it or hands it to the share sheet
 * fetches the bytes from it itself (`downloadSignedFile`). Any member, as the
 * item is read; 404 for another workspace's item or a file the store no longer
 * keeps.
 */
export function readItemFile(workspaceId: string, itemId: string): Promise<RunFileLink> {
  return platformOperation(`/v1/workspaces/${workspaceId}/items/${itemId}/file`, ({ automations }, signal) =>
    automations.GET('/v1/workspaces/{workspaceId}/items/{itemId}/file', {
      params: { path: { workspaceId, itemId } },
      signal,
    }),
  );
}

/**
 * One of a job's uploaded files (`RunDetail.files`' `id`), behind a short-lived
 * signed link (Round 19, build 28), never its bytes — an attachment's link, as
 * `readItemFile`'s is. Anyone who may read the run; 404 for another workspace's
 * run or a file that is not this job's.
 */
export function readRunFile(workspaceId: string, runId: string, fileId: string): Promise<RunFileLink> {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/runs/${runId}/files/${fileId}`,
    ({ automations }, signal) =>
      automations.GET('/v1/workspaces/{workspaceId}/runs/{runId}/files/{fileId}', {
        params: { path: { workspaceId, runId, fileId } },
        signal,
      }),
  );
}

/**
 * Archives an item (backend ADR-0046): owners and admins only, one-way. It
 * leaves its flow's list and takes no new run; its runs stay. Idempotent.
 */
export function archiveItem(workspaceId: string, itemId: string, idempotencyKey: string): Promise<{ item: Item }> {
  return platformOperation(`/v1/workspaces/${workspaceId}/items/${itemId}/archive`, ({ automations }, signal) =>
    automations.POST('/v1/workspaces/{workspaceId}/items/{itemId}/archive', {
      params: {
        path: { workspaceId, itemId },
        header: { 'Idempotency-Key': idempotencyKey },
      },
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
  ).then(changed(workspaceId, ['approvals', 'runs', 'run-stats']));
}

/**
 * Saves a review of each change a held run offers (Round 21's platform round,
 * F2): the same route as `decideApproval`, its body every offered change's
 * answer once — `{ decisions: [{ id, decision: 'accepted' | 'denied' }] }` —
 * never `{ decision }`. The platform continues the job whatever the answers,
 * all denied included. The body's type is the pending contract
 * (`./pending-contract`) until the regeneration publishes it; the one cast
 * below goes with that file.
 */
export function decideReview(
  workspaceId: string,
  approvalId: string,
  answers: ReviewBody['decisions'],
  idempotencyKey: string,
): Promise<{ approval: Approval; continuation?: Run }> {
  const body: ReviewBody = { decisions: answers.map(({ id, decision }) => ({ id, decision })) };
  return platformOperation(
    `/v1/workspaces/${workspaceId}/approvals/${approvalId}/decision`,
    ({ automations }, signal) =>
      automations.POST('/v1/workspaces/{workspaceId}/approvals/{approvalId}/decision', {
        params: {
          path: { workspaceId, approvalId },
          header: { 'Idempotency-Key': idempotencyKey },
        },
        body: body as unknown as { decision: 'approved' | 'rejected' },
        signal,
      }),
  ).then(changed(workspaceId, ['approvals', 'runs', 'run-stats']));
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
 * nowhere — not state that outlives the dialog, not the Keychain.
 *
 * **Replayable by key** (backend §12.1 #240, BUILD-PLAN 25.2.12 — the app's
 * half). The contract's `Idempotency-Key` is optional here, the one operation
 * where it is: the platform derives the secret from the key, so a retry that
 * carries the same key is answered with the secret the lost answer carried and
 * rotates nothing. The caller sends a fresh key per press and the same key on
 * each retry of it (`useIntentKeys`). A platform from before the TWENTY-THIRD
 * promotion does not read the header on this route and rotates as it did.
 */
export function issueWebhookAddress(
  workspaceId: string,
  subscriptionId: string,
  idempotencyKey: string,
): Promise<IssuedWebhookEndpoint> {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/subscriptions/${subscriptionId}/webhook`,
    ({ automations }, signal) =>
      automations.POST('/v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/webhook', {
        params: {
          path: { workspaceId, subscriptionId },
          header: { 'Idempotency-Key': idempotencyKey },
        },
        signal,
      }),
  );
}

/**
 * Who a flow's run emails go to (Build 22, P5; backend ADR-0041): the
 * workspace's owners and admins (`people`, owners first), the person who starts
 * each run, and the flow's extra addresses (`extra`). Any member who can see the
 * flow may read it; `canEdit` says whether this person may change `extra`.
 */
export function readFlowEmailRecipients(workspaceId: string, subscriptionId: string): Promise<FlowEmailRecipients> {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/subscriptions/${subscriptionId}/email-recipients`,
    ({ automations }, signal) =>
      automations.GET('/v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/email-recipients', {
        params: { path: { workspaceId, subscriptionId } },
        signal,
      }),
  );
}

/**
 * Replaces a flow's extra addresses with `extra`, the whole list — so a repeat
 * changes nothing, and the platform takes no `Idempotency-Key` here. Owner or
 * admin only (a member is refused 403).
 */
export function updateFlowEmailRecipients(
  workspaceId: string,
  subscriptionId: string,
  extra: readonly string[],
): Promise<FlowEmailRecipients> {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/subscriptions/${subscriptionId}/email-recipients`,
    ({ automations }, signal) =>
      automations.PUT('/v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/email-recipients', {
        params: { path: { workspaceId, subscriptionId } },
        body: { extra: [...extra] },
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
  ).then(changed(workspaceId, ['runs', 'run-stats']));
}

