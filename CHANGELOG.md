# @scorezilla/mcp

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
