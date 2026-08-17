# Autom8x for iOS (snoopy-mobile)

The Autom8x mobile app — automation × AI workflows on the phone — implementing
the **Nocturne** design system from the Claude Design project
"Autom8x.ai iOS App Design". Expo SDK 54, expo-router, TypeScript strict.

## Run

```bash
npm install
npm run ios        # or: npm start, then press i
```

## Test & checks

```bash
npm test                            # jest (jest-expo + @testing-library/react-native v14)
npm run lint                        # eslint
npx tsc --noEmit                    # typecheck (typed routes regenerate on expo start)
npm run audit:credentials           # no credential-shaped defaults in app screens
npm run audit:tokens                # no colour literals outside constants/theme.ts
npm run audit:fixtures              # lib/fixtures readers may shrink, never grow
npm run audit:platform              # one fetch, no AsyncStorage, no logging
npm run verify:platform-contracts   # generated types match the backend's OpenAPI
```

`__tests__/nocturne-visual.test.tsx` snapshots all 18 Nocturne components in both
palettes. React Native styles resolve into the rendered tree, so a changed
colour, padding, radius or font moves a snapshot — which is how the "components
unchanged" rule is checked rather than merely reviewed. Update them with
`npx jest -u` only when a visual change is intended.

## Backend

The app talks to one service — the Edge — and learns everything it needs from
two values, injected by `app.config.js` and never read from `process.env` in
application source:

```bash
EXPO_PUBLIC_BACKEND_API_ORIGIN=http://localhost:8080   # iOS simulator, local Compose
EXPO_PUBLIC_BACKEND_API_ORIGIN=http://10.0.2.2:8080    # Android emulator

# Where login returns. Must be an app-claimed HTTPS URL — ADR-0017 rejects
# custom schemes — and must match an entry in the Edge's NATIVE_APP_REDIRECT_URIS
# exactly, because that comparison is by string.
EXPO_PUBLIC_NATIVE_REDIRECT_URI=https://app.example.com/auth/native/callback
```

Unset is a legitimate state for both: screens render an honest "unavailable" and
sign-in refuses, rather than the app inventing a default or falling back to a
custom scheme any other app could register.

`app.config.js` derives the iOS `associatedDomains` and the Android
`intentFilters` from the redirect URI, so the claimed host is stated once. The
domain must also serve the matching `apple-app-site-association` and
`assetlinks.json`, or the OS will not hand the callback to the app.

## Signing in, locally

Bring the stack up from `snoopy-backend` with `docker compose up -d`. Two things
are correct-but-surprising there:

- `/health/ready` reports `not-ready`, because identity and object storage are
  unconfigured locally.
- the three `/v1/auth/native/*` routes answer **503 `NOT_CONFIGURED`** with
  `details.component: native_app_redirect_uris`, because `NATIVE_APP_REDIRECT_URIS`
  is absent from `compose.yml`. The app treats that as "sign-in is not available
  yet" rather than as a failure.

A complete sign-in therefore cannot be driven against the default local stack:
it needs that allowlist set, the Supabase identity group configured, and a real
claimed domain. What *is* observable locally is every refusal path — 401 →
signed-out → the route guard, and 503 → sign-in unavailable.

> `SYSTEM-MANIFEST` §12.1 #64 warns that a running Compose stack starves the
> test suite — that applies to **`snoopy-backend`'s** suite, whose files each
> compile an embedded Postgres. This repo's tests use no database, and the full
> suite was verified green with the stack running. No need to stop it here.

## Structure

- `app/` — expo-router tree: auth stack (splash → welcome → login/signup →
  onboarding → Face ID) and the 5-tab shell (Home, Flows, Solutions, Activity,
  Settings). Workflow detail, Templates and the Builder live in the Flows stack
  and the Approvals inbox in the Activity stack, so tab highlighting matches the
  design's tab map.
- `constants/theme.ts` — the Nocturne token sheet (single source of truth:
  no raw hex or ad-hoc fonts anywhere else; dark + light palettes).
- `components/nocturne/` — the reusable component vocabulary (pill buttons,
  cards, toggles, tab bar, glows, …).
- `lib/generated/platform-contracts/` — **generated, do not edit.** TypeScript
  types emitted from the backend's public OpenAPI documents by
  `npm run generate:platform-contracts`.
- `lib/platform/` — the only path to the network. One `platformJson()` facade,
  the origin parser, RFC 9457 problem handling, and the secure token store.
  A hand-written `fetch` anywhere else is a gate failure.
- `components/screen-state.tsx` — the data states every fetching screen shares
  (`gLoad`/`gErr`/`gOff` in the design) plus the inline action-failure callout.
  App-level compositions of the Nocturne set, deliberately outside
  `components/nocturne/`: they add no new primitive, so the frozen eighteen are
  untouched.
- `hooks/use-resource.tsx` — one read, in the four states the design draws.
  `offline` (the request never landed) and `error` (the platform refused) are
  different screens, so they are different states.
- `lib/view/` — wire values to the strings the design draws: the status
  vocabulary map, the formatters, and the icon-name registry.
- `lib/fixtures.ts` — prototype data, byte-exact to the design. Being replaced
  screen by screen; the exit gate is zero imports outside tests.
- `test/`, `__tests__/` — test helpers and suites. Timer-driven screens keep
  one fake-timer scenario per file (see comments in those suites).

## Design source

Tokens, screens, and copy come from the Claude Design project; the brand
assets originate in the `snoopy` web repo (`public/a8x-mark.png`). Keep
`constants/theme.ts` in step with the design system's `styles.css` when the
design evolves — the theme test suite pins the token values.

- `design-source/autom8x-ios-app-design/` — imported visual/design-system snapshot.
- `DESIGN-CONTRACT.md` — draft behavior and integration contracts; unresolved
  decisions are marked explicitly.
- `DESIGN-GAPS.md` — evidence-backed design backlog and implementation order.
