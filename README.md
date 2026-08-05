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
npm test           # jest (jest-expo + @testing-library/react-native v14)
npm run lint       # eslint
npx tsc --noEmit   # typecheck (typed routes regenerate on expo start)
```

## Structure

- `app/` — expo-router tree: auth stack (splash → welcome → login/signup →
  onboarding → Face ID) and the 5-tab shell (Home, Flows, Build, Activity,
  Settings). Workflow detail + Templates live in the Flows stack and the
  Approvals inbox in the Activity stack, so tab highlighting matches the
  design's tab map.
- `constants/theme.ts` — the Nocturne token sheet (single source of truth:
  no raw hex or ad-hoc fonts anywhere else; dark + light palettes).
- `components/nocturne/` — the reusable component vocabulary (pill buttons,
  cards, toggles, tab bar, glows, …).
- `lib/fixtures.ts` — prototype data, byte-exact to the design.
- `test/`, `__tests__/` — test helpers and suites. Timer-driven screens keep
  one fake-timer scenario per file (see comments in those suites).

## Design source

Tokens, screens, and copy come from the Claude Design project; the brand
assets originate in the `snoopy` web repo (`public/a8x-mark.png`). Keep
`constants/theme.ts` in step with the design system's `styles.css` when the
design evolves — the theme test suite pins the token values.
