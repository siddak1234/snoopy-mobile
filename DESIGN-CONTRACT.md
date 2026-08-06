# Autom8x design contracts

Status: **Draft — not ratified**

Last verified against commit: `c80c61d3a77e6a41ff00284496402b7e4fceaaff`

Primary visual source: `design-source/autom8x-ios-app-design/Screen.dc.html`
Implementation evidence: current files under `app/`, `components/`, `hooks/`, and `lib/`

This document records behavior that must be agreed before implementation. It
separates verified repository behavior from proposed contracts. A proposed
contract is not an assertion that the backend or provider integrations exist.

## Document ownership

| Artifact | Responsibility | Editing rule |
| --- | --- | --- |
| `design-source/autom8x-ios-app-design/` | Imported visual/design-system export | Keep as an unmodified source snapshot; do not add application contracts here |
| `DESIGN-CONTRACT.md` | Ratified product, state, route, and integration contracts | Add decisions here once agreed; mark unresolved items explicitly |
| `DESIGN-GAPS.md` | Open backlog, ownership, evidence, and implementation order | Link to this document instead of duplicating contract details |
| `README.md` | Repository entry point | Link to the canonical design artifacts only |

## Verified current boundary

- The app has an Expo Router auth stack and a five-tab app shell, but no session
  provider or protected-route decision is implemented: `app/_layout.tsx`.
- Login sends the user directly to the Home route without validation or a
  session: `app/(auth)/login.tsx:94`.
- Apple, Google, and Microsoft buttons render without handlers:
  `app/(auth)/login.tsx:109-112`.
- Face ID attempts local authentication but currently navigates Home after a
  timer regardless of the result: `app/(auth)/faceid.tsx:52-79`.
- There are no API, OAuth, auth-session, secure-storage, or database modules in
  the dependency/source tree. Prototype state is held in React state and
  fixtures.
- Connections are currently represented by fixture data and local booleans:
  `lib/fixtures.ts:375-380`, `app/(tabs)/solutions/setup.tsx:38-43`.
- The app already declares the `snoopymobile` URL scheme in `app.json:8`.

## Standards boundary

The recommended native-app authorization boundary is:

- OAuth authorization-code flow through an external user-agent.
- PKCE for every public native client authorization request.
- `state` to correlate the request and callback.
- OpenID Connect for identity login where the provider supports it, with ID
  token validation performed by the trusted authentication service.
- No client secret embedded in the native bundle.
- No provider access or refresh token exposed in UI state or route parameters.

References:

- [RFC 8252 — OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252)
- [RFC 7636 — Proof Key for Code Exchange](https://datatracker.ietf.org/doc/html/rfc7636)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0-18.html)
- [Expo AuthSession](https://docs.expo.dev/versions/latest/sdk/auth-session/)
- [Expo Router authentication](https://docs.expo.dev/router/advanced/authentication/)
- [Expo SecureStore](https://docs.expo.dev/versions/v55.0.0/sdk/securestore/)

## Login contract

### Ownership

Autom8x login authenticates an Autom8x user and creates an Autom8x session.
Apple, Google, and Microsoft are identity providers; their authorization is
not itself the Autom8x application session. Provider connections are a separate
contract below.

### Proposed client types

These are contract types, not current implementation files.

```ts
export type AuthMethod =
  | 'password'
  | 'apple'
  | 'google'
  | 'microsoft'
  | 'biometric';

export type AuthSession = {
  userId: string;
  workspaceId: string;
  expiresAt: string;
};

export type AuthState =
  | { status: 'restoring' }
  | { status: 'signed-out' }
  | { status: 'submitting'; method: AuthMethod }
  | { status: 'signed-in'; session: AuthSession }
  | {
      status: 'error';
      method: AuthMethod;
      code: string;
      retryable: boolean;
      field?: 'email' | 'password';
    };

export interface AuthClient {
  restore(): Promise<AuthSession | null>;
  signInWithPassword(input: {
    email: string;
    password: string;
  }): Promise<AuthSession>;
  signInWithProvider(
    provider: 'apple' | 'google' | 'microsoft',
  ): Promise<AuthSession>;
  signUp(input: {
    fullName: string;
    email: string;
    password: string;
  }): Promise<AuthSession>;
  requestPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
}
```

The exact server error-code vocabulary is still **Decision required**. The
UI contract must at minimum distinguish field validation, invalid credentials,
provider cancellation, provider failure, network failure, expired session,
and unknown failure.

### Required login states

| State | Required behavior |
| --- | --- |
| Restoring | Block the auth/app decision until stored session restoration finishes |
| Signed out | Show the auth entry point; protected routes redirect here |
| Field validation | Show field-specific feedback; do not submit invalid input |
| Submitting | Disable duplicate submission and show progress |
| Provider browser | Show that the app is waiting for the external authorization flow |
| Cancelled/denied | Return to the form with a recoverable message; do not create a session |
| Signed in | Store the Autom8x session and enter the intended app route |
| Session expired | Attempt the defined refresh path once, then return to signed out if it fails |
| Sign out | Clear the Autom8x session and return to the auth entry point |
| Biometric success | Unlock an existing local session only |
| Biometric failure/cancel/unavailable/lockout | Do not enter the app; offer the defined fallback |

### Login acceptance criteria

- No login or signup action navigates to a protected route until the session
  contract reports `signed-in`.
- OAuth login uses an external user-agent, authorization code, PKCE, and a
  verified callback. Tokens are not passed through route parameters.
- The auth boundary is enforced at the route/layout level, not separately by
  each screen.
- Face ID never treats a timeout as authentication success.
- “Stay logged in” has an explicit persistence policy before it is wired. The
  current toggle does not define that policy.

## Workspace connection contract

### Ownership

A connection is a provider authorization grant associated with an Autom8x
workspace. It is not the user’s Autom8x login session.

Provider display names must not be used as identifiers. A provider registry must
define stable provider IDs, requested scopes, display metadata, and the adapter
that translates provider errors.

### Proposed client types

These types intentionally do not contain access or refresh tokens.

```ts
export type ConnectionStatus =
  | 'not-connected'
  | 'authorizing'
  | 'connected'
  | 'reauthorization-required'
  | 'error'
  | 'disconnecting';

export type Connection = {
  id: string;
  providerId: string;
  workspaceId: string;
  externalAccount: {
    id: string;
    displayName: string;
  };
  status: ConnectionStatus;
  requiredScopes: string[];
  grantedScopes: string[];
  lastValidatedAt?: string;
  usedByCount: number;
  errorCode?: string;
};

export interface ConnectionsClient {
  list(workspaceId: string): Promise<Connection[]>;
  beginAuthorization(input: {
    providerId: string;
    workspaceId: string;
    requestedScopes: string[];
  }): Promise<{
    attemptId: string;
    authorizationUrl: string;
    expiresAt: string;
  }>;
  completeAuthorization(attemptId: string): Promise<Connection>;
  reconnect(connectionId: string): Promise<{
    attemptId: string;
    authorizationUrl: string;
  }>;
  disconnect(connectionId: string): Promise<void>;
}
```

### Required connection lifecycle

| Transition | Required behavior |
| --- | --- |
| Not connected → Authorizing | Create a one-time authorization attempt with provider, workspace, and requested scopes |
| Authorizing → Connected | Complete the callback, validate the account and granted scopes, then return connection metadata |
| Authorizing → Cancelled/denied | Keep the connection absent and return a recoverable UI state |
| Connected → Reauthorization required | Show the provider/account and a reconnect action; do not silently discard the connection |
| Connected → Error | Preserve the record and expose retryable/non-retryable failure information |
| Connected → Disconnecting → Not connected | Confirm consequences, revoke/invalidate the grant where supported, then remove the usable connection |

The current design copy says future solutions reuse the workspace connection and
that agents keep running in the cloud. Based on that product behavior, the
recommended architecture is for the service to own provider refresh
credentials. This is an architecture recommendation, not current repository
behavior. The mobile app should receive connection metadata, not provider
refresh tokens.

### Proposed service surface

These endpoints do not currently exist; they define the boundary to implement
after the design decisions are ratified.

```text
POST   /v1/connection-attempts
GET    /v1/connection-attempts/:attemptId
GET    /v1/workspaces/:workspaceId/connections
POST   /v1/connections/:connectionId/reconnect
DELETE /v1/connections/:connectionId
```

Provider adapters must handle provider-specific scope, token lifetime, refresh
rotation, account/workspace selection, and revocation behavior. The contract
must not assume every provider has the same expiry or revoke semantics.

### Connection acceptance criteria

- A connection is scoped to a workspace and has a stable provider identifier.
- UI can distinguish connected, reconnect-required, denied, failed, and
  disconnecting states.
- Each solution declares the minimum scopes it needs before authorization starts.
- The callback returns an opaque attempt result, never a provider token in a
  deep link or route parameter.
- Disconnect behavior defines what happens to workflows using the connection.
- Reconnect preserves or replaces the connection record according to an
  explicit decision; the current code does not define this.

## Decisions required before implementation

| ID | Decision | Current status |
| --- | --- | --- |
| D1 | Supported login methods and provider ownership | Decision required |
| D2 | “Stay logged in” persistence and sign-out behavior | Decision required |
| D3 | Workspace selection after login | Decision required |
| D4 | Stable provider registry and minimum scopes per solution | Decision required |
| D5 | Whether connections are workspace-owned, user-owned, or both | Decision required |
| D6 | Reconnect identity: preserve or replace connection ID | Decision required |
| D7 | Workflow consequences when a connection is removed or revoked | Decision required |
| D8 | Backend callback versus app callback ownership | Decision required |
| D9 | Account selection when a provider has multiple workspaces/accounts | Decision required |

## Implementation placement after ratification

The proposed implementation locations are:

```text
lib/contracts/auth.ts
lib/contracts/connections.ts
hooks/use-session.tsx
hooks/use-connections.tsx
```

These files do not exist yet. Screens should consume the shared contracts and
hooks; they should not define provider-specific OAuth, token, or session logic.
