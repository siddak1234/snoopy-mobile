import { platformOperation } from './client';

/**
 * A message to Autom8x (BUILD-PLAN 24.6.4) — the website's contact form, on the
 * same public operation. Only the email is required.
 */
export type ContactRequest = {
  email: string;
  industry?: string;
  workflow?: string;
  tools?: string;
  volume?: string;
  success?: string;
};

export function sendContactRequest(body: ContactRequest): Promise<unknown> {
  return platformOperation('/v1/contact-requests', ({ platform }, signal) =>
    platform.POST('/v1/contact-requests', { body, signal }),
  );
}
