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

Re-verified during Round 6, after ADR-0017 published the native session
contract. The prototype boundary this document was written against is largely
gone; what remains open is recorded plainly rather than left implied.

**Settled since the draft:**

- A session provider and a route-level auth boundary exist: `hooks/use-session.tsx`
  and `app/(tabs)/_layout.tsx`. The guard closes on a real 401 alone — an
  unconfigured or unreachable backend is not an authentication failure, and
  locking the prototype out of its own screens would destroy the asset the round
  exists to preserve.
- Apple, Google, and Microsoft buttons open the system browser at
  `/v1/auth/native/{provider}/start` and complete through
  `POST /v1/auth/native/token`: `lib/platform/native-auth.ts`.
- Tokens live in `expo-secure-store` only, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, per
  ADR-0017's amendment to invariant 1: `lib/platform/session-store.ts`.
- The demo credentials are gone; `npm run audit:credentials` reports 0.
- Every network call goes through one generated-client facade:
  `lib/platform/client.ts`.

**Settled 2026-08-17, when the design delivered DESIGN-GAPS item 2:**

- **Sign-out now honours the contract.** The card called
  `router.replace('/(auth)/welcome')` and never called `signOut()`, so ADR-0017
  §4's deliberate 502 — returned instead of 204 so a client can tell that
  revocation failed and its tokens are still live upstream — went unused. The
  screen now stays put on a 502 and renders the design's `soFail` callout;
  `__tests__/sign-out.test.tsx` pins that a failed revocation must **not**
  navigate.
- **The run status vocabulary is complete.** `lib/view/status.ts` carried
  `pending`/`running` as neutral with a comment recording the pill treatment as
  an open question for design. Answered: `running` takes the accent, being the
  one run state a person watches; `pending` and `cancelled` share Draft's
  neutral; and `pending` renders as **Queued**, a mapping rather than a
  capitalisation.
- **Every fetching screen has a data-state vocabulary**
  (`components/screen-state.tsx`, `hooks/use-resource.tsx`), and
  `PlatformUnreachableError` makes "offline" distinguishable from "the platform
  refused" — two different screens in the design, previously one 502.

**Open and needing an owner decision — the exit gate and the browsability rule
contradict each other.** Found 2026-08-17 while preparing to wire the first
screens, and recorded rather than settled unilaterally, because it changes what
Round 6 delivers.

Two commitments in this repository cannot both hold:

- Gate 8: **"0 imports of `lib/fixtures` outside tests."**
- `hooks/use-session.tsx` and `app/(tabs)/_layout.tsx`: an `unconfigured` build
  — no backend origin at all — is "the design prototype's normal state, and it
  must stay browsable: the UI is the asset this round exists to preserve."

Today the screens are browsable when unconfigured precisely *because* they read
fixtures. Delete the fixture imports and an unconfigured build renders the
designed empty and error states instead of the prototype — which is coherent,
but it ends the browsability the guard was written to protect. Three ways out,
none of which a session should pick on its own:

1. **Accept it.** Fixtures reach zero; an unconfigured build shows designed
   empty states. The prototype stops being browsable without a backend, and the
   design source in `design-source/` becomes the only place to see it.
2. **Keep a prototype path.** Fixtures survive behind an `unconfigured`-only
   branch. Honest, but the gate line can never read zero, so it would have to be
   reworded rather than met.
3. **Separate the concepts.** A seeded demo mode distinct from `lib/fixtures`.
   A new concept, and so a decision rather than a refactor.

Until this is answered, `scripts/audit-fixtures.mjs` holds the count where it is
and names every blocker, so no one has to rediscover the question.

**Still open, and each blocked on something named:**

- The password **Log In** button still navigates without authenticating
  (`app/(auth)/login.tsx`). ADR-0008 disables password login entirely, so this
  control has no contract behind it. The route guard now bounces it in a
  configured build, but the control itself is a design decision — DESIGN-GAPS
  item 1, owner Claude Design.
- Face ID still navigates Home on a timer regardless of the result
  (`app/(auth)/faceid.tsx`). It gates nothing today, and gating it needs the
  designed biometric failure/cancel/unavailable/lockout states this document
  lists below, which do not exist yet.
- Connections remain fixture data and local booleans (`lib/fixtures.ts`,
  `app/(tabs)/solutions/setup.tsx`). Blocked by the backend, not by this repo:
  a native client cannot complete a provider connection because
  `/v1/connections/callback` authenticates before it reads, and a native login
  deliberately mints no session cookie — SYSTEM-MANIFEST §12.1 #62, with the
  working design in BUILD-PLAN 7.6.6.
- **Home's recent-runs list is not wireable, and the reason is the contract, not
  the design.** Home is the one screen with designed loading, empty, and error
  states, and `GET /v1/workspaces/{workspaceId}/runs` is published — so this
  looked like the one fixture replacement Round 6 could finish. It is not. The
  published `Run` carries no display name (`automations.yaml`: "No display name
  here") and no result summary; `grep output` over the public automations spec
  matches nothing. The design's row draws both — `Invoice triage` and
  `#4821 · posted to QuickBooks`. The first needs a catalog join; the second has
  no source on the list shape at all, since `RunStep.summary` exists only inside
  `RunDetail`, so four rows would cost four extra requests and still render a
  step line rather than a run result. Tapping a row navigates by `runVariant`, a
  four-value fixture key into `runDetails`, so a real run has no destination
  until run detail is wired — and run detail is DESIGN-GAPS item 2, owner Claude
  Design. `homeStats` has no endpoint at any shape. Recorded as a finding for the
  backend register; not a fix to make here.
- The app declares the `snoopymobile` scheme (`app.json`), which ADR-0017
  **rejects for login** — any app can register a custom scheme. Login returns
  through an app-claimed HTTPS URL instead, and `app.config.js` derives the iOS
  `associatedDomains` and Android `intentFilters` from that one configured
  redirect URI. The scheme remains for ordinary deep links.

## Fixture ↔ contract reconciliation — the Round 6 card's question, settled

The Round 6 card asks it directly: *"do the 427 lines of `lib/fixtures.ts` match
the real wire shapes, or an invented shape that will fight the API? Answer it
before writing the client, not during."* Round 6 answered it for the four screens
`lib/view` serves. This is the rest, read off the three published OpenAPI
documents.

**The answer is mostly reassuring.** Where the platform publishes a shape, the
fixtures match it closely — the differences are the ones `lib/view` already
absorbs (icon *names* rather than components, ISO instants rather than
`'2m'`, numbers rather than `'1,284'`, array index rather than identity). Two
alignments are better than expected: `Connection.usedByCount` is exactly the
design's *"used by 2 solutions"*, and `AutomationCatalogEntry` carries
`name`/`description`/`category`/`icon`/`monthlyPriceUsd`/`subscribed`, which is
the entire Solutions and Templates card. A run's automation name is a **catalog
join by design** — the runs list says so in its own description — so that is
intended client work, not a gap.

**What no published shape supplies.** Each is a backend ask, not a mobile task:

| Missing from the public contract | Blocks |
| --- | --- |
| **`manifest.pipeline` — published nowhere.** The word occurs once across all three specs, inside an error description. `AutomationCatalogEntry` publishes `setup[]` but no pipeline. | **BUILD-PLAN 8.7** (`builder.tsx` renders `manifest.pipeline`), flow-detail steps, `templateConfigure` steps, run detail's *"Steps done 3 / 4"* denominator, and the human title of each run-timeline row |
| A human-readable run number (`#4821`). `Run` has `id` (uuid) and `requestId`. | run detail title, activity rows, notifications, approval headlines |
| A run result summary / output. `grep output` matches nothing; `RunStep.summary` exists only inside `RunDetail`. | Home recent runs, activity rows, run detail's extracted-fields card |
| Run aggregates per subscription (`1,284 runs · 1,272 ok · 12 failed`). | flows list rows, flow detail's three stat tiles |
| A confidence score. | run detail stat tile |
| `Approval` has `reason` (the *why*) but no title/subject. | the approval card's headline |
| Any notifications route. | the notifications screen entirely |
| A `homeStats` source, at any shape. | Home's stats row |
| Billing/plan operations — §12.1 #46, BUILD-PLAN 8.3. | plan totals, Settings PLAN & BILLING, `PLAN_BASE_PRICE` |
| `usedByTeams` (*"used by 2,100 teams"*). | `templateConfigure` meta line |
| `ConnectionProvider` publishes no `icon`, though `AutomationCatalogEntry` does. | connection rows resolve an icon by `providerId` instead — an inconsistency worth closing |

**One correction to the audit's split.** Settings connections was recorded as
blocked by §12.1 #62. More precisely: **reading** connections is a plain
authenticated GET and is wireable today — `Connection` plus
`GET /v1/connections/providers` supplies name, account label, status and
`usedByCount`, and the providers list is what supplies the design's *"Slack ·
Not connected"* row, since the connections list omits providers with no
connection. Only the **Connect action** is blocked by #62.

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

Four of these were answered by backend decisions rather than by this document,
which is the right outcome: the platform owns the contract and the client
consumes it. They are marked here so a reader stops treating a settled question
as open.

| ID | Decision | Current status |
| --- | --- | --- |
| D1 | Supported login methods and provider ownership | ✅ **Settled** — ADR-0008: OAuth-only through Google, Microsoft, Apple; password, magic-link and reset are disabled in the product contract. The app renders the provider list the Edge publishes at `GET /v1/auth/providers` |
| D2 | “Stay logged in” persistence and sign-out behavior | ✅ **Settled** — ADR-0017: the refresh token persists in the secure enclave and is renewed at `POST /v1/auth/native/refresh`; sign-out sends it to `POST /v1/auth/logout`, scope `local`, and a failed revocation keeps the local copy rather than stranding a live session. The **“Stay logged in” toggle** on the login screen has no contract behind it and is still design's call |
| D3 | Workspace selection after login | ✅ **Settled** — the session names `activeWorkspaceId`; the client prefers it and falls back to the first membership (`activeWorkspaceId`, `hooks/use-session.tsx`), never taking it from a form field. What is *not* settled is the UI for switching |
| D4 | Stable provider registry and minimum scopes per solution | Decision required — the Edge publishes `GET /v1/connections/providers`, but the screens are blocked by §12.1 #62 |
| D5 | Whether connections are workspace-owned, user-owned, or both | ✅ **Settled** — workspace-owned: one live connection per `(workspace, provider)`, enforced by unique index, with `usedByCount` tracking sharing |
| D6 | Reconnect identity: preserve or replace connection ID | Decision required |
| D7 | Workflow consequences when a connection is removed or revoked | Decision required |
| D8 | Backend callback versus app callback ownership | ✅ **Settled** — ADR-0017: the backend remains the OAuth client and keeps the provider's single allowlist entry. The app owns only its own PKCE pair, and login returns to an app-claimed HTTPS URL; custom schemes are rejected |
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
