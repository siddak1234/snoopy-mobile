import type { components } from '@/lib/generated/platform-contracts/platform';
import { platformOperation } from './client';

export type LoginProvidersResponse = components['schemas']['LoginProvidersResponse'];
export type SessionResponse = components['schemas']['SessionResponse'];

/** Public OAuth-only provider policy. */
export function readLoginProviders(): Promise<LoginProvidersResponse> {
  return platformOperation('/v1/auth/providers', ({ platform }, signal) =>
    platform.GET('/v1/auth/providers', { signal }),
  );
}

/** The authenticated native session projection. */
export function readCurrentSession(): Promise<SessionResponse> {
  return platformOperation('/v1/session', ({ platform }, signal) =>
    platform.GET('/v1/session', { signal }),
  );
}
