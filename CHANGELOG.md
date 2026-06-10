# @scorezilla/mcp

## 0.3.0

### Minor Changes

- [#37](https://github.com/isco-tec/scorezilla-mcp/pull/37) [`408106a`](https://github.com/isco-tec/scorezilla-mcp/commit/408106aeefde31f070551beefe3bd4f4eee64e05) Thanks [@isco-tec](https://github.com/isco-tec)! - Add three create-only write tools so an AI agent can provision against an **existing** game instead of being sent to the dashboard:

  - **create_game** — create a new (empty) game.
  - **create_board** — add a leaderboard board to an existing game (by gameId), with full options (sortDir, scoreKind, retention, bounds).
  - **mint_key** — mint a fresh pk*/sk* key pair for an existing game.

  Previously `bootstrap_leaderboard` (one-shot new game + board + keys) was the only write tool, so once a game existed the MCP was read-only. All three are gated by `--read-only` and require closed-beta access, like the rest of the server. Destructive ops (edit/archive/delete, key revocation) remain dashboard-only by design.

## 0.2.0

### Minor Changes

- [#32](https://github.com/isco-tec/scorezilla-mcp/pull/32) [`cce826b`](https://github.com/isco-tec/scorezilla-mcp/commit/cce826b9d68d8cb633425a069d7a4e15854ec5cd) Thanks [@isco-tec](https://github.com/isco-tec)! - Add integration-axis arguments to `bootstrap_leaderboard` and `get_sdk_snippet` (`playerIdentityStrategy`, `authProvider`, `hostingPattern`, `serverLanguage`), so the assistant can generate the full set of integrations — not just the default anonymous + client-only snippet:

  - the drop-in **widget** HTML embed (`bootstrap_leaderboard` now returns `snippets.widget` + `snippets.sdk` + a plain-English `recommendation`)
  - the **secure, server-validated (anti-cheat)** path (`hostingPattern: 'client_with_server' | 'server_only'`)
  - **OAuth** player identity (`playerIdentityStrategy: 'auth_provider'` + an `authProvider`)
  - non-TypeScript server snippets via `serverLanguage`

  Syncs `src/contract.ts` to the current `/v1/mcp/*` API contract (axis enums, `McpSnippetBundle`, and the `snippets` + `recommendation` fields on the bootstrap response). The legacy `sdkSnippet` field is retained as a deprecated alias. Also enriches the `list_boards`/`get_keys` tool descriptions.

## 0.1.3

### Patch Changes

- 5c2913b: Every API call now sends `X-MCP-Client-Version: <package-version>`.
  Pairs with the server-side capture in scorezilla#205 — the API logs
  the value on every MCP-path structured log line, so post-incident
  queries can isolate to a specific client build ("what % of MCP
  traffic is on v0.1.x?", "is this error spike from v0.2.0?").

  No behavior change for users; the header is observational only.

## 0.1.2

### Patch Changes

- 4f375b0: **Smaller, faster CLI.** Bundle dropped from 725 KB to 587 KB (−19%) via
  two independent gains: `tsup` now minifies the published artifact
  (was suboptimal, dropped on its own by 53%), and dependencies bumped
  to current majors (`zod` 4, `typescript` 6, GitHub Actions v6,
  `@types/node` 25).

  No API changes — all six tools, the auth model, the env vars, and
  the CLI flags are unchanged. This is purely a build + dependency
  freshness release.

  Cold-start under `npx -y @scorezilla/mcp` should be noticeably
  snappier on every MCP host-session.

## 0.1.1

### Patch Changes

- 60b2379: No functional changes — this changeset exists to smoke-test the CI release
  pipeline end-to-end after the workflow was wired up in #20. Validates:

  - changesets/action opens a "chore(release): version @scorezilla/mcp" PR
  - `scripts/sync-server-json-version.mjs` propagates the bump into `server.json`
  - `release:check` guard agrees with the new version
  - `CHANGELOG.md` is generated/updated correctly

  If the Version PR opens cleanly with all four properties above, the pipeline
  plumbing is verified and this changeset can be merged for a real `0.1.1`
  release, or closed and reverted if the smoke test alone was sufficient.
