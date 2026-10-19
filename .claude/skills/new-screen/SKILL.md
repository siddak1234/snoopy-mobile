---
name: new-screen
description: Add a screen to the app - the route file under app/, its view model in lib/view/, its test, the DESIGN-CONTRACT checklist and audits, web parity and plain words, then the map. Use for any new page or tab screen.
---

# New screen

**Purpose.** One new screen that matches a website page, built from the frozen Nocturne components, with a test that presses everything it offers. The rules are `app/CLAUDE.md`; the contract is `DESIGN-CONTRACT.md`.

**Inputs.**
- The website page it matches (`git ls-files 'app/account/**/page.tsx'` in `snoopy`) and its words.
- The operations it reads and sends, as `DESIGN-CONTRACT.md` names them. An operation the contract does not publish stops here (step 0).
- A name in four forms: kebab (`team-email`), camel (`teamEmail`), Pascal (`TeamEmail`) and a title (`Who gets the email`); the route under `app/` without `.tsx` (`(tabs)/flows/team-email`).

## Steps

0. Read `app/CLAUDE.md` and the screen's rows in `DESIGN-CONTRACT.md`. No published operation for it: stop, and record the gap in `DESIGN-GAPS.md`.
1. Create the route file under `app/` and its view model in `lib/view/` from the templates:
   ```bash
   T=.claude/skills/new-screen/templates
   KEBAB=team-email CAMEL=teamEmail PASCAL=TeamEmail TITLE='Who gets the email'
   ROUTE='(tabs)/flows/team-email' WEB=/account/flows
   sub() { sed -e "s|__Pascal__|$PASCAL|g" -e "s|__camel__|$CAMEL|g" -e "s|__kebab__|$KEBAB|g" \
     -e "s|__Title__|$TITLE|g" -e "s|__route__|$ROUTE|g" -e "s|__webPath__|$WEB|g" "$1"; }
   sub $T/screen.tsx.tmpl > "app/$ROUTE.tsx"
   sub $T/view.ts.tmpl > "lib/view/$KEBAB.ts"
   ```
   Then replace the template's words and its one action with the screen's own: reads through `useResource` and `lib/platform/*`, states through `components/screen-state.tsx`, sends through the shared rules (README "Runtime architecture").
2. Write `__tests__/<screen>.test.tsx`:
   ```bash
   sub $T/screen.test.tsx.tmpl > "__tests__/$KEBAB.test.tsx"
   ```
   One test per press, asserting its outcome (the screen and params it opens, the request it sends, what changes, or the refusal it says), and one per state. A press it shares with other screens (Retry, Back, Cancel) joins their table-driven test. Arrival params, a redirect or the guard: a test under `__tests__/real-router/`.
3. Run the DESIGN-CONTRACT checklist (`templates/checklist.md`), then the audits:
   ```bash
   npm run lint && npm run typecheck
   npm run audit:tokens && npm run audit:type && npm run audit:vocabulary && npm run audit:haptics
   npx jest "__tests__/$KEBAB" && npm run test:coverage && npm run audit:presses
   ```
4. Check web parity and the plain-words rule (`app/CLAUDE.md`): the same words as the website for the same thing; the fewest questions; numbered steps; no jargon. Add the screen's row to `DESIGN-CONTRACT.md` "Screen reads" and record the change in `DESIGN-GAPS.md`.
5. Rebuild the map, then the full gate:
   ```bash
   npm run map
   npm run verify
   ```

## Stop conditions

- An operation, field or refusal the contract does not publish: stop and record it in `DESIGN-GAPS.md` (root `CLAUDE.md` rule 7).
- A primitive none of `components/nocturne/` fits: stop and ask; a new one is snapshot-pinned in both palettes (ADR-0032).
- Any audit red: fix the screen, never the audit's allowlist.

## Output

- `app/<route>.tsx`, `lib/view/<kebab>.ts`, `__tests__/<kebab>.test.tsx`, the regenerated `docs/MAP.md`, and the checklist in the PR body.
- Docs-map rule: `app/**` updates `DESIGN-CONTRACT.md` or `DESIGN-GAPS.md`; `lib/view/**` updates `DESIGN-GAPS.md`.
