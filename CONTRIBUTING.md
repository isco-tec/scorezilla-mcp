# Contributing to scorezilla-mcp

Thanks for your interest in improving the Scorezilla MCP server. The bar for contributions is "small, well-tested, and aligned with the simplest-possible-leaderboards product anchor."

## Local development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build      # produces dist/
```

Run the server locally against a real account (use a non-production token if you can):

```bash
SCOREZILLA_TOKEN=mcp_live_… node dist/index.js
```

Or wire it into Claude Code / Cursor against the local checkout instead of npm:

```json
{
  "mcpServers": {
    "scorezilla-dev": {
      "command": "node",
      "args": ["/path/to/scorezilla-mcp/dist/index.js"],
      "env": { "SCOREZILLA_TOKEN": "mcp_live_…" }
    }
  }
}
```

## Adding or changing a tool

1. Edit `src/index.ts` — keep the tool's description LLM-friendly (lead with the action and effect, describe each parameter via Zod `.describe()`).
2. Add a corresponding integration test in `test/integration.test.ts` using the `InMemoryTransport` pattern already in there.
3. Run `pnpm typecheck && pnpm test`.
4. Add a changeset: `pnpm changeset` — pick `patch` / `minor` / `major` and describe the change in user-facing terms.
5. Open a PR.

## Release flow

This repo uses [changesets](https://github.com/changesets/changesets):

- Every PR that changes runtime behavior includes a `.changeset/*.md` file.
- On merge to `main`, the `changesets/action` workflow opens (or updates) a "Version Packages" PR that bumps the version and updates `CHANGELOG.md`.
- Merging that Version PR triggers a publish to npm.

For pre-releases (`@next` dist-tag), see the changesets `mode: pre` config in `.changeset/config.json`.

## Code style

- TypeScript strict mode (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`).
- Prefer `unknown` over `any` for external input.
- Comments answer **why**, not what.
- No emojis in source files unless explicitly part of user-visible copy.

## Reporting security issues

See [SECURITY.md](./SECURITY.md). Never file vulnerabilities as public issues.

## License

By contributing, you agree your changes are licensed under the MIT license (see [LICENSE](./LICENSE)).
