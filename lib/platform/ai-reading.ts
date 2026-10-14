import type { components } from '@/lib/generated/platform-contracts/platform';
import { platformOperation } from './client';

export type AiDocumentReadingChoice = components['schemas']['AiDocumentReadingChoice']['choice'];
export type AiDocumentReadingState = components['schemas']['AiDocumentReadingState'];

/**
 * Saves the account's answer to "AI reads your documents" (backend ADR-0038):
 * `PUT /v1/session/ai-document-reading`, bearer, for the session's own person
 * in every workspace. Idempotent by value, so there is no idempotency key; the
 * same answer again changes nothing. `GET /v1/session` reads it back as
 * `user.aiDocumentReading`.
 */
export function saveAiDocumentReading(choice: AiDocumentReadingChoice): Promise<AiDocumentReadingState> {
  return platformOperation('/v1/session/ai-document-reading', ({ platform }, signal) =>
    platform.PUT('/v1/session/ai-document-reading', { body: { choice }, signal }),
  );
}
