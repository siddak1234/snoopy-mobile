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
npm run verify:platform-contracts   # generated types match the backend's OpenAPI
```

## Backend

The app talks to one service — the Edge — and learns its location from a single
value, injected by `app.config.js` and read through `lib/platform/origin.ts`:

```bash
EXPO_PUBLIC_BACKEND_API_ORIGIN=http://localhost:8080   # iOS simulator, local Compose
EXPO_PUBLIC_BACKEND_API_ORIGIN=http://10.0.2.2:8080    # Android emulator
```

Unset is a legitimate state: screens render an honest "unavailable" rather than
the app inventing a default. Bring the stack up from `snoopy-backend` with
`docker compose up -d`; `/health/ready` reporting `not-ready` locally is correct,
because identity and object storage are unconfigured there.

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
