# Autom8x Mobile (`snoopy-mobile`)

The Expo SDK 54 native client for Autom8x. It implements the frozen Nocturne
design on iOS and Android and consumes only the Edge's published OpenAPI
surface.

## Local run

```bash
npm ci
EXPO_PUBLIC_BACKEND_API_ORIGIN=http://localhost:8080 npm run ios
```

Use `http://10.0.2.2:8080` for the Android emulator. Native login additionally
requires an app-claimed HTTPS callback:

```bash
EXPO_PUBLIC_NATIVE_REDIRECT_URI=https://app.example.com/auth/native/callback
```

The callback must exactly match the Edge's `NATIVE_APP_REDIRECT_URIS` entry.
`app.config.js` derives the iOS associated domain and Android verified app link
from this value. It rejects custom schemes, malformed origins, insecure release
origins, and preview/production builds missing either release value.
The iOS deployment target is 17.4 because that is the first version whose
`ASWebAuthenticationSession` can match an HTTPS callback by associated host and
path; no supported build can fall back to scheme-only matching.

## Verification

```bash
npm run verify                    # lint, types, all architecture gates, contracts, tests
npm run audit:dependencies        # critical production dependency gate
npm run export:ios                # production JS/native asset bundle
npm run export:android
```

The individual architecture gates are:

- `audit:credentials`: no pinned demo credentials.
- `audit:tokens`: no raw colour literals outside the theme.
- `audit:fixtures`: zero prototype fixture data inside the runtime roots — both
  zero imports (static, dynamic, alias, side-effect and CommonJS forms, in every
  extension Metro resolves) and zero occurrences of the module itself. Design
  data that the suites need lives in `test/design-data.ts`, where nothing under
  `app/`, `components/`, `constants/`, `hooks/` or `lib/` can reach it.
- `audit:platform`: no raw network primitive, alternate network library,
  AsyncStorage, runtime console call, or `openapi-fetch` import outside the
  transport boundary.
- `verify:platform-contracts`: regenerate from the sibling backend checkout,
  when present, and reject a generated declaration diff.

The gate suites include negative tests that inject forbidden source and prove
the audits fail. `__tests__/nocturne-visual.test.tsx` snapshots all 18 Nocturne
components in dark and light palettes. Do not update those snapshots unless a
visual change is explicitly authorized.

CI runs lint, typecheck, Jest, all architecture/dependency gates, contract
verification, and both platform exports. Preview and production EAS values are
supplied by the build environment; they are intentionally not committed to
`eas.json`. Since Round 7.5 that means the EAS-hosted `preview` and
`production` environments on the linked project (`@autom8x.ai/snoopy-mobile`):
each release profile names its environment in `eas.json`, both environments
carry the two values, and `app.config.js` refuses a release build missing
either one at config time, so a misconfigured cloud build fails before
anything ships. The redirect URI stored there is subject to the exact-match
rule above. Two `eas.json` absences remain deliberate: no `channel` keys,
because the app has no update runtime (`expo-updates` is not a dependency and
a channel would route an OTA update to a build that cannot receive one), and
no `submit.production` block, because no store credentials exist and an empty
block would read as configured-and-ready. The history of both is in
`ROUND-7.5-OBSERVATIONS.md`.

## Runtime architecture

- `lib/generated/platform-contracts/` is generated from the Edge, automations,
  and connections OpenAPI documents. Do not hand-edit it.
- `lib/platform/client.ts` is the sole runtime transport boundary. It uses
  `openapi-fetch`, attaches the current bearer token through middleware,
  applies a timeout and `no-store`, and maps RFC problem responses.
- `lib/platform/*.ts` exposes typed reads and mutations. Screens do not call a
  network primitive.
- `lib/platform/session-store.ts` stores access/refresh credentials only in
  `expo-secure-store` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
- `hooks/use-session.tsx` resolves `/v1/session` before routing. Protected tabs
  fail closed unless that response positively establishes `signed-in`. A 401
  clears the local credential; an outage does not.
- `lib/platform/native-auth.ts` implements ADR-0017's backend-mediated sealed
  handoff. `expo-web-browser.openAuthSessionAsync` opens the external system
  user-agent; the app owns only its device PKCE pair and never receives provider
  tokens. `expo-auth-session` is deliberately not used because its
  `AuthRequest` models an app-owned OAuth authorization request with a required
  client ID, while this app is not the OAuth client.
- `hooks/use-resource.tsx` and `components/screen-state.tsx` provide explicit
  loading, offline, platform-error, and empty states.
- `lib/view/` performs the published wire-to-Nocturne mapping and owns no
  workspace truth.

## Local platform observation

On 2026-08-18 the sibling Compose stack was running, but public readiness was
HTTP 503: identity, connections, and object storage were not configured.
`/v1/session` returned 401, and a schema-valid native Google start returned 503
naming `native_app_redirect_uris`. Therefore an authenticated live journey was
not observable against that environment. The client renders those refusals and
does not substitute fixtures or bypass the guard.

An exact copy of this checkout produced an iOS Release build with **zero errors
and zero warnings from the app target**. The build emits ~2,700 warnings in
total, every one of them from third-party headers under `ios/Pods/` (React
Native and Expo), and none from any file in this repository. The earlier
"zero errors or warnings" wording overstated that and is corrected here.
That build was installed and launched as
`ai.autom8x.snoopy` on the iPhone 16 Pro / iOS 18.6 simulator, where the real
onboarding screen was observed. The copy used a path without spaces because the
current Expo/React Native CocoaPods scripts split the checkout path at the
space in `Business Infra`; the direct build from this checkout therefore fails
before app code runs. No source or generated native file was patched to hide
that upstream limitation. Both platform exports passed, but an Android native
launch remains unobserved because this host has neither `adb` nor `emulator`;
an EAS cloud build also remains unobserved.

That observation is not a claim about a future environment. Recheck it during
the fresh Round 6 audit.

## Scope and handoff

Round 6's current contract and screen-to-operation map are in
[`DESIGN-CONTRACT.md`](DESIGN-CONTRACT.md). The evidence still required from a
fresh audit session, plus deliberate non-Round-6 gaps, is in
[`DESIGN-GAPS.md`](DESIGN-GAPS.md).

The governing master plan and round playbook live in the sibling private
`snoopy-backend` repository. This repository may read them and must never edit
that repository during a mobile session.
