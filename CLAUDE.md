# `snoopy-mobile` — session instructions

This is the one open repository for Round 6. The implementation has reached the
fresh-audit boundary; **Round 6 is not closed until a separate session that wrote
none of the implementation reruns Gate 8 and records the result.**

## Start every session

Read `../snoopy-backend/docs/platform/AUTOM8X-MASTER-PLAN.md` §0, then the Round
6 card in `AUTOM8X-ROUND-PLAYBOOK.md`, then this repository's
`DESIGN-CONTRACT.md` and `DESIGN-GAPS.md`. The sibling governance repository is
read-only from a mobile session.

If the master plan no longer names `snoopy-mobile` as the open repository, stop.

## Non-negotiable rules

1. Work only in this repository. A backend issue is a finding, not permission to
   edit the sibling repository.
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

## Round 6 scope and one documented variance

Scope is BUILD-PLAN 8.5–8.7: generated client, secure native session and guarded
routes; real screen reads/mutations; read-only Builder rendering
`manifest.pipeline`; `eas.json` and build pipeline.

The playbook names `expo-auth-session`. ADR-0017 subsequently made the backend,
not the app, the OAuth client. Expo documents `AuthRequest` as an OAuth §4.1.1
request requiring a client ID; applying it here would invent an app OAuth
client. The implementation therefore uses the lower-level Expo system auth
session, `expo-web-browser.openAuthSessionAsync`, and retains device-generated
PKCE for the sealed handoff. This variance is explicit and must be judged by the
fresh auditor, not hidden by an unused dependency.

## Gate 8 commands

```bash
npm ci
npm run verify
npm run audit:dependencies
npm run export:ios
npm run export:android
git status --short
```

The fresh audit must also inspect the simulator, exercise reachable refusal and
auth states, compare the §1 endpoint journey with the web client, validate EAS
configuration, and report any live journey that external configuration makes
NOT OBSERVED. It must not convert NOT OBSERVED into PASS.
