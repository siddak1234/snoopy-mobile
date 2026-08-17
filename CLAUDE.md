# snoopy-mobile — read before doing anything

The Expo native client for **Autom8x** — one of four independent repositories.
**Round 6 is open and substantially delivered.** The 20 screen routes (not 27 —
that figure counts the 7 `_layout.tsx` files) and 18 Nocturne components run on
the published API: types generated from the backend's OpenAPI, one transport
facade, native sign-in per ADR-0017, tokens in the OS secure enclave, and every
fetching screen wired to real reads with the designed loading/error/offline
states. **No file imports `lib/fixtures.ts` any more** — `npm run audit:fixtures` reports
0, which is Gate 8's first line met. A build with no backend renders the designed
empty and error states rather than inventing data.

Round 7 owns what remains outward-facing: its entry rule is explicit that
"everything above ran under local Compose with no cloud account", so a claimed
domain, a deployed environment and a payment provider account are **not** Round 6
work.

## Start here, every session

**Read `../snoopy-backend/docs/platform/AUTOM8X-MASTER-PLAN.md` §0 STATUS
first.** That block states the current round and the open repository. The
governance documents live in the private `snoopy-backend` repository — this repo
**reads** them and never edits them.

> That path is outside this working directory. Run `/add-dir ../snoopy-backend`
> at the start of the session (or launch with `--add-dir`) so the read succeeds
> without a prompt. **Read access only** — editing anything in that repo from a
> mobile session breaks the one-repo rule.

**If §0 STATUS does not name `snoopy-mobile` as the open repository, you are in
the wrong repo.** Say so and stop. Rounds 0–5 are backend and web work; touching
mobile early is exactly the cross-repo drift the round structure exists to
prevent.

Then read `AUTOM8X-ROUND-PLAYBOOK.md` §4 (the Round 6 card) and this repo's
`DESIGN-CONTRACT.md` and `DESIGN-GAPS.md`.

## Rules

1. **One repository per session.** Work only here.
2. **The UI/UX is frozen and is the asset.** Screens change what they *read
   from*, never how they look. Colour, spacing, and type scale must survive a
   visual diff.
3. **No raw hex, no ad-hoc font families** outside `constants/theme.ts`. Those
   tokens are translated 1:1 from the web app's `globals.css` — one design
   source, two platform encodings.
4. **No new component that duplicates one in the Nocturne set** (18 exist:
   `status-pill`, `stat-card`, `surface-card`, `pill-button`, `text-field`, …).
5. **No hand-written `fetch`.** Round 6 introduces a client generated from the
   backend's `docs/openapi/*.yaml`. A hand-written call is a gate failure.
   Enforced by `npm run audit:platform`, not by review.
6. **Tokens go in `expo-secure-store`** — never AsyncStorage, never a log line.
   Also enforced by `npm run audit:platform`.
7. **Never edit another repository.** Something that looks like a backend bug is
   a finding to record, not a fix to make here.

## Round 6 exit gate, for orientation

Zero imports of `lib/fixtures` outside tests · zero pinned demo credentials ·
Nocturne components unchanged under visual diff · `eas.json` builds · both
clients drive the same journey against the same endpoints.

Recount before quoting: `app/` holds 27 `.tsx` = 7 layouts + **20 routes**, and
`lib/fixtures.ts` is **410 lines**, not the card's 427.

Four of those five are now commands rather than prose: `audit:fixtures` (a
ratchet that may shrink and never grow, each remaining file naming its blocker),
`audit:credentials`, `audit:platform`, and `npx jest nocturne-visual`. The visual
harness is proven able to fail on colour, spacing **and** type scale — if you
change it, re-prove that, because a snapshot suite that cannot fail asserts
nothing.
