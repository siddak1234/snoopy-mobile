# `snoopy-mobile` — session instructions

Round 7.5M is the mobile completion re-entry named by the master plan's §0.1
audited completion order, step 5. Rounds 6 and 7.5 are closed; their records
stay in `DESIGN-GAPS.md` and `ROUND-7.5-OBSERVATIONS.md` and are not rewritten.
**The round is not closed here.** Round 7F — a fresh `snoopy-backend` session
that wrote none of this implementation — re-runs every gate line and closes
only what it independently observes.

## Start every session

Read `../snoopy-backend/docs/platform/AUTOM8X-MASTER-PLAN.md` §0.1 (the
audited control block, including its completion order), then the Round 7 card
in `AUTOM8X-ROUND-PLAYBOOK.md`, then this repository's `DESIGN-CONTRACT.md`,
`DESIGN-GAPS.md` and `ROUND-7.5-OBSERVATIONS.md`. The sibling governance
repository is read-only from a mobile session.

If the master plan no longer names `snoopy-mobile` as the open or the next
repository, stop.

## Non-negotiable rules

1. Work only in this repository. A backend, web or deployment issue is a
   finding, not permission to edit a sibling repository — record it in
   `ROUND-7.5-OBSERVATIONS.md` for a `snoopy-backend` session to file.
2. Preserve the frozen Nocturne UI. The 18 components are snapshot-pinned in
   both palettes. Disabled support may not change their default render.
3. Use theme tokens; no raw hex or ad-hoc font families outside
   `constants/theme.ts`.
4. Do not duplicate a Nocturne primitive.
5. Runtime network access goes through `lib/platform/client.ts` and generated
   `openapi-fetch` clients only. No raw `fetch`, property/global fetch,
   XMLHttpRequest, WebSocket, EventSource, axios, or alternate client.
6. Credentials live only in `expo-secure-store`, this-device-only. Never put a
   token in AsyncStorage, a URL, route params, logs, fixtures, or analytics.
7. Never invent a field or workflow absent from the published contract. Follow
   the refusal map in `DESIGN-CONTRACT.md`.
8. Work goes through a branch, a PR, green CI and a merge; `npm run verify` is
   green before every commit. No new documents: findings and observations go
   into the files named above.

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

## Gate 8 commands

```bash
npm ci
npm run verify
npm run audit:dependencies
npx expo-doctor
npm run export:ios
npm run export:android
git status --short
```

`npm ci` against an existing `node_modules` in this iCloud-synced checkout can
fail `ENOTEMPTY`; `rm -rf node_modules && npm ci` is the recorded workaround
and also clears the conflict copies that make `tsc` and `expo lint` crawl.

The fresh audit must also inspect the simulator or emulator, exercise reachable
refusal and auth states, compare the §1 endpoint journey with the web client,
validate EAS configuration, and report any live journey that external
configuration makes NOT OBSERVED. It must not convert NOT OBSERVED into PASS.
