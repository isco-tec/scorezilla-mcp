# @scorezilla/mcp

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
