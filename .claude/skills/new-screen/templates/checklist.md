# New screen checklist: <screen>

Copy into the PR body and tick each line; a line that does not apply says why.

## DESIGN-CONTRACT.md
- [ ] Its row in "Screen reads" (and "Mutations" for anything it sends) names every operation it calls; nothing invented.
- [ ] Every refusal it can meet is said as the refusal map says it, through `refusalMessage()`.
- [ ] Loading, offline, error, unavailable and empty states come from `components/screen-state.tsx`.
- [ ] An action targets the workspace its screen loaded (`workspaceIfShown()`); a resubmission keeps its key (`useIntentKeys()`).

## Nocturne and the audits
- [ ] Composed from `components/nocturne/`, `components/dialog.tsx` and the theme tokens; no new primitive.
- [ ] `npm run audit:tokens`, `audit:type`, `audit:vocabulary`, `audit:haptics` green.
- [ ] `npm run test:coverage && npm run audit:presses` green: every press is pressed by a test that asserts its outcome.

## Plain words (app/CLAUDE.md)
- [ ] The fewest questions; nothing asked that a connected app already knows.
- [ ] Few steps, numbered, titles only; no jargon, no explanations.
- [ ] Icons 24 pt, 20 inside buttons.

## Parity
- [ ] The website's page it matches: <path>, with the same words for the same thing.
- [ ] Recorded in `DESIGN-GAPS.md` under the round's current section.

## Map and docs
- [ ] `npm run map` run and `docs/MAP.md` committed; `npm run check:docs` green.
