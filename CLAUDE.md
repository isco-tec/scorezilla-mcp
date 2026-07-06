# CLAUDE.md

Official MCP server for Scorezilla (scorezilla.dev) — a stdio CLI (`npx -y @scorezilla/mcp`) that lets AI coding assistants manage game leaderboards. Thin client of api.scorezilla.dev; no hosted component here. This repo is PUBLIC — never commit tokens, secrets, or private-monorepo internals.

## Stack

TypeScript (ESM), Node >= 20, `@modelcontextprotocol/sdk`, zod v4. tsup bundles to `dist/index.js` (the published bin), vitest for tests, changesets for versioning.

## Commands

Package manager is **pnpm** (v9 in CI) — never npm/yarn.

- `pnpm typecheck` — tsc --noEmit (also enforces compile-time contract assertions)
- `pnpm test` — vitest run
- `pnpm build` — tsup
- `node dist/index.js --version` — bin smoke test (run after build, CI does)
- `pnpm release:check` — package.json ↔ server.json version sync guard
- `pnpm changeset` — add a changeset (required for any user-facing change)

## Deploy (npm publish)

- Publishing is CI-only via `.github/workflows/release.yml` — **never run `npm publish` or `bash scripts/publish.sh` manually** (the manual path skips provenance; it exists only as a documented disaster fallback).
- Actual flow (changesets, NOT tag-based): merge to `main` → Release workflow (every run pauses for manual approval via the `npm-publish` GitHub Environment) → changesets opens/updates a "Version Packages" PR → merging that PR publishes to npm with `--provenance` and to the MCP Registry (mcp-publisher), then runs a post-publish install smoke test.
- **Never bump versions by hand** — changesets only. `package.json` and `server.json` must stay in sync (`scripts/sync-server-json-version.mjs`; `release:check` guards it).
- `workflow_dispatch` input `registry_resync: true` re-publishes the current version to the MCP Registry only — recovery for "npm published, registry step failed".

## Rules & gotchas

- **Contract mirror:** `src/contract.ts` is a hand-maintained MIRROR of the private monorepo's MCP wire contract. When `test/contract-drift.test.ts` fails after an upstream sync, update `src/contract.ts` to match the vendored `test/contract/mcp.generated.ts` — NEVER edit the vendored file, never invent fields, never "fix" the test. A red drift check after upstream changes is by design, not a bug.
- Part of the drift guard is compile-time (`expectTypeOf`) — it fails `pnpm typecheck`, not `pnpm test`. Run both.
- Base URL is HTTPS-only (localhost exempted); write tools send content-derived `Idempotency-Key` headers — preserve both behaviors when touching the HTTP layer.
- Runtime env vars (users', not CI): `SCOREZILLA_TOKEN`, `SCOREZILLA_BASE_URL`, `SCOREZILLA_BETA_TOKEN`. Reference names only; never write values anywhere.
- README "Status" blurb tends to lag releases — refresh it when shipping a version.
- Pre-flight before any PR: `pnpm typecheck && pnpm test && pnpm build && node dist/index.js --version`.

Full brief & known issues: ~/Code/ccc/projects/by-name/scorezilla-mcp/
