# `lib/platform/` — the transport and the platform's contracts

Loads when a file here is read or edited. The root `CLAUDE.md` rules 5–7 apply here first. The detail is README "Runtime architecture"; the rule is `DESIGN-CONTRACT.md` "Transport and credential boundary".

## The generated contracts: never hand-edit

- `lib/generated/platform-contracts/*.d.ts` come from `npm run generate:platform-contracts` (`scripts/generate-platform-contracts.mjs`, reading the backend's OpenAPI documents in `../snoopy-backend`, or `SNOOPY_BACKEND_ROOT`).
- `npm run verify:platform-contracts` (in `verify` and CI) regenerates them and fails on any diff. A shape change starts in the backend's documents, then regenerate; never edit a generated file.
- Each file's first line names its document and sha256.
- `block-fixtures.ts` is the backend's block fixtures (`packages/contracts/fixtures/blocks/*.json`, ADR-0048 decision 9); its header's rule is README "`verify:platform-contracts`", and verify checks it too.
- `block-required.ts` (round 21) is each block type's required fields, read from the `Block` schema in `snoopy-backend/docs/openapi/automations.yaml`; its header names that document's sha256, and verify checks it too. `components/blocks/drawable.ts` reads it.

## CI's `Deployed contract` job

- `contract-deployed` (`scripts/verify-deployed-contracts.mjs`) compares each generated file's sha256 with the hash the running platform reports, and fails closed.
- It is **red by design** while the types run ahead of production (a contract the platform has not yet released). Say so before pushing, so the red is expected, not discovered.
- `platform-requirement.json` (`{"aheadOfDeployed": true}`) is the one reviewed escape; `npm run release:ios` refuses any mismatch, escape or not.

## The boundary

- Network access only through `lib/platform/client.ts` and its generated `openapi-fetch` clients; the credential-less exceptions and their budgets are README "Runtime architecture" (`audit:platform`).
- Credentials only in `expo-secure-store` (`lib/platform/session-store.ts`), this-device-only.
- Screens call the typed functions here, never a network primitive.

## Commands

```bash
npm run generate:platform-contracts   # after the backend's documents change
npm run verify:platform-contracts     # what verify and CI run
node scripts/verify-deployed-contracts.mjs   # what CI's Deployed contract job runs (needs the network)
```
