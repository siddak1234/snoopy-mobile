/**
 * RFC 9457 problem handling, ported from `snoopy/lib/platform-server.ts`.
 *
 * The backend answers every refusal with a typed problem document. Both clients
 * read the same three public members and fall back to the same wording, so a
 * 403 reads the same on a phone as in a browser.
 */

export class PlatformError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** The RFC 9457 `code`, when the backend supplied one. */
    public readonly code?: string,
    /** Public, structured details. Callers must whitelist what they render. */
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PlatformError';
  }
}

/**
 * Thrown when the request never reached the platform at all.
 *
 * A subclass rather than a flag, and a subclass of `PlatformError` rather than a
 * sibling, so that `error.status === 502` keeps working everywhere it already
 * does — notably the refresh and sign-out paths, where a 502 must preserve the
 * session rather than clear it.
 *
 * The distinction earns its place because the design draws two different
 * screens: a failed *load* ("Couldn't load this run", with Retry and Go back)
 * and being *offline* ("You're offline… this screen will sync as soon as you're
 * back"). Only the transport layer knows which happened, and it was previously
 * flattening both into one 502.
 */
export class PlatformUnreachableError extends PlatformError {
  constructor(message = 'The platform is unreachable') {
    super(message, 502);
    this.name = 'PlatformUnreachableError';
  }
}

/**
 * Thrown when the app has no backend origin configured.
 *
 * Distinct from a failed request on purpose: an unconfigured client renders an
 * honest "unavailable", while a broken platform must never look like an empty
 * catalog.
 */
export class PlatformNotConfiguredError extends Error {
  constructor() {
    super('backendApiOrigin is not configured');
    this.name = 'PlatformNotConfiguredError';
  }
}

export type Problem = {
  title?: string;
  code?: string;
  details?: Record<string, unknown>;
};

export function fallbackProblemTitle(status: number): string {
  if (status === 400) return 'The request could not be accepted.';
  if (status === 401) return 'Sign in is required.';
  if (status === 403) return 'You are not allowed to complete this action.';
  if (status === 404) return 'The requested resource is unavailable.';
  if (status === 409) return 'This request conflicts with an earlier operation.';
  return 'The platform could not complete this request.';
}

/** Keep only the members a client may render; everything else is server telemetry. */
export function publicProblem(value: unknown): Problem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const problem = value as Record<string, unknown>;
  return {
    ...(typeof problem.title === 'string' ? { title: problem.title } : {}),
    ...(typeof problem.code === 'string' ? { code: problem.code } : {}),
    ...(problem.details && typeof problem.details === 'object' && !Array.isArray(problem.details)
      ? { details: problem.details as Record<string, unknown> }
      : {}),
  };
}
