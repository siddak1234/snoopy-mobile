# `snoopy-mobile` — session instructions

**Round 16 is open** (BUILD-PLAN Phase 24, ADR-0032): the mobile app offers
every signed-in feature the website offers, on the same published operations,
and ships to Apple first. This repository owns 24.3–24.7 and, since the owner's build 6 feedback of 2026-10-02, 24.9 (the flows design pass: one Flows tab, a project scope, a shared workspace snapshot) and, since build 7's, 24.11.6–24.11.10 (the cover when signed out, Teams in place of Projects, Removed flows, Unlink, flow history), one phase per session:
the foundation, automations/runs/connections, organization/projects/teams,
billing/account/data/support, and the iOS release. **The round is not closed
here.** A fresh `snoopy-backend` session that wrote none of it re-runs Gate 24
and closes only what it independently observes. Earlier rounds' records stay in
`DESIGN-GAPS.md` and `ROUND-7.5-OBSERVATIONS.md` and are not rewritten.

## Start every session

Read `../snoopy-backend/docs/platform/AUTOM8X-MASTER-PLAN.md` §0.1, then the
Round 16 card in `AUTOM8X-ROUND-PLAYBOOK.md`, BUILD-PLAN Phase 24 and
`docs/adr/0032-mobile-offers-every-web-feature.md`, then this repository's
`DESIGN-CONTRACT.md` and `DESIGN-GAPS.md`. The sibling governance repository is
read-only from a mobile session.

If the master plan no longer names `snoopy-mobile` as the open or the next
repository, stop.

## Non-negotiable rules

1. Work only in this repository. A backend, web or deployment issue is a
   finding, not permission to edit a sibling repository — record it in
   `DESIGN-GAPS.md` for a `snoopy-backend` session to file.
2. Preserve the frozen Nocturne UI. The 18 components are snapshot-pinned in
   both palettes; disabled support may not change their default render. New
   screens mirror the website's pages and are composed from those components,
   the shared `components/dialog.tsx` and the theme tokens. A new primitive is
   added only when none fits, snapshot-pinned in both palettes (ADR-0032).
3. Use theme tokens; no raw hex or ad-hoc font families outside
   `constants/theme.ts`.
4. Do not duplicate a Nocturne primitive.
5. Runtime network access goes through `lib/platform/client.ts` and generated
   `openapi-fetch` clients only. No raw `fetch`, property/global fetch,
   XMLHttpRequest, WebSocket, EventSource, axios, or alternate client. **One
   exception, in that file only:** `putFileToSignedUrl`, the credential-less
   PUT of a file's bytes to the URL the platform signed (FR-14).
   `audit:platform` admits exactly one plain `fetch(` there, and no second.
6. Credentials live only in `expo-secure-store`, this-device-only. Never put a
   token in AsyncStorage, a URL, route params, logs, fixtures, or analytics. A
   webhook secret is shown once and stored nowhere, the Keychain included.
7. Never invent a field or workflow absent from the published contract. Follow
   the refusal map in `DESIGN-CONTRACT.md`.
8. Work goes through a branch, a PR, green CI and a merge; `npm run verify` is
   green before every commit. `/code-review` every PR; `/security-review`
   anything touching auth, secrets, uploads, deletion or the billing link. No
   new documents: findings and observations go into `DESIGN-GAPS.md`.
9. **Billing (ADR-0032).** Every platform shows the plan, its price and the
   workspace's billing status. On iOS, "Upgrade" and "Manage billing" open
   the hosted checkout and portal in the system browser, and the app re-reads
   billing when it returns to the foreground. Android shows no purchase control
   or call to action. There is no in-app purchase. The app is offered in the
   United States App Store storefront only; selling elsewhere needs a
   storefront check first.
10. **The shared rules every screen uses:**
    - `administers()` (`lib/view/roles.ts`): owner or admin controls.
    - `workspaceIfShown()` (`hooks/use-session.tsx`) with a resource's
      `loadedFor`: an action targets the workspace its screen loaded, or is
      refused with `WORKSPACE_CHANGED`.
    - `useIntentKeys()`: a resubmission keeps its idempotency key.
    - `refusalMessage()` (`lib/content/refusals.ts`): refusals in the website's
      words.
    - `withoutArchived()` (`lib/view/catalog.ts`): an archived subscription is
      absent — never a workflow, never Added. The catalog's `subscribed` counts
      one, so it never answers Added.
    - `deletionOutcome()` (`lib/content/deletion.ts`): every answer
      `DELETE /v1/account` gives a bearer caller, in ADR-0028's words. Never
      say "deleted" for a lost answer: read the session first.
    - `hostedAddress()` (`lib/platform/billing.ts`) and `websiteOrigin()`: the
      only addresses the app opens outside itself, https only.

## Release configuration, pinned

Three values differ between a simulator, a preview build and production, and
`app.config.js` refuses a preview or production build that lacks any of them
or carries a wrong one:

- `EXPO_PUBLIC_BACKEND_API_ORIGIN` — the Edge origin the bearer calls use,
  HTTPS in release.
- `EXPO_PUBLIC_NATIVE_REDIRECT_URI` — must equal
  `https://app.autom8x.ai/auth/native/callback` byte-for-byte (ADR-0017; the
  Edge's `NATIVE_APP_REDIRECT_URIS` compares by exact string). The iOS
  associated domain and the Android verified app link are derived from it.
- `EXPO_PUBLIC_NATIVE_AUTH_BASE_URL` — where the SYSTEM BROWSER opens the
  ADR-0017 start leg; must equal `https://www.autom8x.ai/api/platform`. The
  Edge keeps the OAuth transaction in a `__Host-` cookie, which is host-only,
  and its deployed callback sits on the public web origin behind the website's
  `/api/platform` rewrite (manifest §12.1 #79). A start leg opened on the API
  origin sets a cookie the callback never receives and every native login ends
  at the website with `exchange_failed`. Measured 2026-09-03; the evidence is
  in `ROUND-7.5-OBSERVATIONS.md`.

All three live in the EAS-hosted `preview` and `production` environments of
the linked project `@autom8x.ai/snoopy-mobile` (`extra.eas.projectId` in
`app.json`, pinned by `__tests__/app-config.test.js` through the real config).

## Two documented variances

The playbook names `expo-auth-session`. ADR-0017 subsequently made the backend,
not the app, the OAuth client. Expo documents `AuthRequest` as an OAuth §4.1.1
request requiring a client ID; applying it here would invent an app OAuth
client. The implementation uses the lower-level Expo system auth session,
`expo-web-browser.openAuthSessionAsync`, and retains device-generated PKCE for
the sealed handoff.

ADR-0017 §1 assumes the start request and the provider's callback land on one
origin. In the deployed topology that origin is the public web origin, not the
API origin, so the browser-leg base above exists. The published route and its
parameters are unchanged; only the origin the browser is pointed at differs.
Both variances are explicit and are judged by the fresh auditor.

## Gate commands

```bash
npm ci
npm run verify            # ends by emitting .autom8x/repo-facts/snoopy-mobile.json
npm run audit:dependencies
npx expo-doctor
npm run export:ios
npm run export:android
git status --short
```

`npm ci` against an existing `node_modules` in this iCloud-synced checkout can
fail `ENOTEMPTY`; `rm -rf node_modules && npm ci` is the recorded workaround
and also clears the conflict copies that make `tsc` and `expo lint` crawl.

The fresh audit must also inspect the simulator or device, exercise reachable
refusal and auth states, compare every screen with the website's page list,
validate EAS configuration, and report any live journey that external
configuration makes NOT OBSERVED. It must not convert NOT OBSERVED into PASS.
