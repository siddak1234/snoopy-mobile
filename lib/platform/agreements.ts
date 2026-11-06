import type { components } from '@/lib/generated/platform-contracts/platform';
import { platformOperation } from './client';

/**
 * The health data agreement (Round 21 stage 2, C3; backend ADR-0049): its
 * current text, a workspace's acceptance of it, and a workspace owner
 * accepting it. A flow that carries health data (`healthData` on its catalog
 * entry) is refused 403 `agreement_required` at its turn-on and at a run's
 * start until the owner accepted the current version (ADR-0049 amendment 2;
 * ~~at its add~~ until builds 37 and 39, wave 2). Set up reads it for its
 * "Contract and accept" section (`components/flows/contract-step.tsx`); Start
 * run and an item's upload read it only on the refusal, then send the request
 * again with the same key (`hooks/use-health-agreement.ts`).
 */

type Schema = components['schemas'];
export type HealthDataAgreement = Schema['HealthDataAgreement'];
export type WorkspaceDocument = Schema['WorkspaceDocument'];
export type WorkspaceHealthDataAgreement = Schema['WorkspaceHealthDataAgreement'];

/** The current text, its version and its sha256 — any signed-in person; 503 `agreement_not_published` while none is. */
export function readHealthDataAgreement(): Promise<HealthDataAgreement> {
  return platformOperation('/v1/agreements/health-data', ({ platform }, signal) =>
    platform.GET('/v1/agreements/health-data', { signal }),
  );
}

/**
 * The current version and the workspace's acceptance of exactly it (ADR-0049
 * amendment 2): `current` null while none is published, `acceptance` null when
 * none counts. Owner or admin; a member is 403.
 */
export function readWorkspaceHealthDataAgreement(workspaceId: string): Promise<WorkspaceHealthDataAgreement> {
  return platformOperation(`/v1/workspaces/${workspaceId}/agreements/health-data`, ({ platform }, signal) =>
    platform.GET('/v1/workspaces/{workspaceId}/agreements/health-data', { params: { path: { workspaceId } }, signal }),
  );
}

/**
 * The workspace's owner accepts the text it read, naming its version and
 * sha256 back (409 `agreement_changed` when another text is current), with
 * the signer's name and title and the checkbox (`authorized`). Owner only, from
 * the membership: an admin or a member is 403. One append-only row.
 */
export function acceptHealthDataAgreement(
  workspaceId: string,
  agreement: Pick<HealthDataAgreement, 'version' | 'sha256'>,
  signer: { name: string; title: string },
  idempotencyKey: string,
): Promise<{ document: WorkspaceDocument }> {
  return platformOperation(`/v1/workspaces/${workspaceId}/agreements`, ({ platform }, signal) =>
    platform.POST('/v1/workspaces/{workspaceId}/agreements', {
      params: { path: { workspaceId }, header: { 'Idempotency-Key': idempotencyKey } },
      body: {
        kind: 'health-data',
        version: agreement.version,
        sha256: agreement.sha256,
        signerName: signer.name,
        signerTitle: signer.title,
        authorized: true,
      },
      signal,
    }),
  );
}

export type WorkspaceDocumentCopy = Schema['WorkspaceDocumentCopy'];

/**
 * The workspace's signed documents (C3, the organization's Documents list):
 * newest first, at most 50, in one read when the screen opens. Who may read
 * it: README "Runtime architecture".
 */
export function readWorkspaceDocuments(workspaceId: string): Promise<WorkspaceDocument[]> {
  return platformOperation(`/v1/workspaces/${workspaceId}/documents`, ({ platform }, signal) =>
    platform.GET('/v1/workspaces/{workspaceId}/documents', { params: { path: { workspaceId } }, signal }),
  ).then((answer) => answer.documents);
}

/** One signed document with its copy (the agreement as accepted, filled and signed), read only when its row is opened. */
export function readWorkspaceDocument(workspaceId: string, documentId: string): Promise<WorkspaceDocumentCopy> {
  return platformOperation(`/v1/workspaces/${workspaceId}/documents/${documentId}`, ({ platform }, signal) =>
    platform.GET('/v1/workspaces/{workspaceId}/documents/{documentId}', {
      params: { path: { workspaceId, documentId } },
      signal,
    }),
  ).then((answer) => answer.document);
}
