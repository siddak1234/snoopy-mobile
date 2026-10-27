# `app/` — the screens

Loads when a file here is read or edited. The root `CLAUDE.md` rules apply too.

## DESIGN-CONTRACT governs every screen

[`DESIGN-CONTRACT.md`](../DESIGN-CONTRACT.md) says what each screen reads and sends, how it says each refusal, and its states. Never invent a field or a workflow it does not name.

## The frozen Nocturne UI

- The Nocturne components are snapshot-pinned in both palettes (`__tests__/nocturne-visual.test.tsx`); disabled support may not change their default render.
- New screens mirror the website's pages and are composed from those components, the shared `components/dialog.tsx` and the theme tokens. A new primitive is added only when none fits, snapshot-pinned in both palettes (ADR-0032).
- Every size is a step of `typeScale` (`constants/theme.ts`), every text is `components/text.tsx`'s (the text-size limit), and every press ticks through `components/pressable.tsx`; why, and the authorised re-pins: `DESIGN-CONTRACT.md` "The type is the app's own scale" and "Every press ticks".
- Every padding, margin and gap is a name from the platform's spacing table (`space`; `inset` inside one control), never a number (`audit:spacing`); a screen is a `Page` with a `PageHeader`, a title over its card a `SectionTitle` or a `Group`: `DESIGN-CONTRACT.md` "Block set v2 and the spacing table".

## Plain words (the owner's rule)

1. Ask the fewest questions. Read what a connected app already knows instead of asking for it.
2. Show few steps, numbered, titles only.
3. No jargon and no explanations: say what happens, in the person's words.
4. Larger icons: 24 pt, 20 inside buttons.
5. Say what the website says for the same thing (department and flow, never team, project or automation: `audit:vocabulary`).

## Audits to run after a screen change

```bash
npm run audit:tokens && npm run audit:type && npm run audit:spacing && npm run audit:vocabulary && npm run audit:haptics
npm run test:coverage && npm run audit:presses   # the press audit reads the coverage
```

What each audit holds: README "Verification".

## Parity with the website

The app offers every signed-in page the website offers, on the same operations and in its words (ADR-0032). For a new or changed screen, list the website's pages (`git ls-files 'app/account/**/page.tsx'` in `snoopy`) and name the screen here that matches each. The last full map is `DESIGN-GAPS.archive.md` "Gate 24's parity line, re-checked at the close"; record a change to it in `DESIGN-GAPS.md`.

## A test for every screen

- Each route file has a test under `__tests__/` that renders it and its states (`components/screen-state.tsx`: loading, offline, error, unavailable, empty; then loaded).
- Every press is pressed by a test that asserts its outcome (`audit:presses`).
- Sign-in, sign-out, the guard, a redirect, or the params a screen takes on arrival: a test under `__tests__/real-router/`.
- A new screen: `/new-screen` (`.claude/skills/new-screen/SKILL.md`).
