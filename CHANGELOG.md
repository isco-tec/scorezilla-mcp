# @scorezilla/mcp

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
