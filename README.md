# scorezilla-mcp

[![npm version](https://img.shields.io/npm/v/@scorezilla/mcp.svg)](https://www.npmjs.com/package/@scorezilla/mcp)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![scorezilla-mcp MCP server](https://glama.ai/mcp/servers/isco-tec/scorezilla-mcp/badges/score.svg)](https://glama.ai/mcp/servers/isco-tec/scorezilla-mcp)

**Add a global leaderboard to your game by asking Claude Code or Cursor.** The SDK it wires in is ~5 KB gzipped, with zero runtime dependencies.

Official Model Context Protocol (MCP) server for [Scorezilla](https://scorezilla.dev). Connect it to your AI coding assistant (Claude Code, Cursor, Continue.dev, …) and ship a working leaderboard without leaving your editor.

## What you can ask the AI to do

- "Add a leaderboard to my game" → it bootstraps a game + board and pastes ready-to-run TypeScript SDK code into your project
- "What did my last test score rank?" → it reads your live leaderboard
- "List my games" / "show me the boards on X" → it inspects what you already have

Eleven tools total — five read-only, and six that write: four that create resources (`bootstrap_leaderboard`, `create_game`, `create_board`, `mint_key`) plus two that update config (`update_board_config` — score bounds + retention, e.g. an anti-cheat `maxScore`; `update_game_config` — the browser-submit origin allowlist).

## Install + configure

> **Access — open to every Scorezilla account.** Sign up free at [dashboard.scorezilla.dev](https://dashboard.scorezilla.dev), create a token, and go. Creating games and boards counts toward your plan's limits (Free: 2 games × 3 boards each); when you hit one, the tool error includes a direct upgrade link. See [pricing](https://scorezilla.dev/pricing/).

### 1. Get a token

Sign in at [dashboard.scorezilla.dev](https://dashboard.scorezilla.dev), open **MCP tokens**, click **Create token**. Copy the `mcp_live_*` value once — it's not shown again.

### 2. Add the server to your AI coding assistant

**Claude Code** — one command (`--scope user` makes it available in every project):

```bash
claude mcp add scorezilla --scope user -e SCOREZILLA_TOKEN=mcp_live_… -- npx -y @scorezilla/mcp
```

**Cursor** — add this to `~/.cursor/mcp.json` (or Settings → MCP → Add new MCP server):

```json
{
  "mcpServers": {
    "scorezilla": {
      "command": "npx",
      "args": ["-y", "@scorezilla/mcp"],
      "env": {
        "SCOREZILLA_TOKEN": "mcp_live_…"
      }
    }
  }
}
```

> 🔒 **Keep your MCP config private.** Both clients store the token in plaintext (`~/.claude.json` for Claude Code, `~/.cursor/mcp.json` for Cursor). Don't commit it to git, sync it to a public dotfiles repo, or back it up to a shared location. On macOS/Linux, `chmod 600` the file so only your user can read it. If a token leaks, revoke it at [dashboard.scorezilla.dev/account/tokens](https://dashboard.scorezilla.dev/account/tokens).

**Anything else MCP-compatible** — point your client at `npx -y @scorezilla/mcp` with `SCOREZILLA_TOKEN` set in the environment.

### 3. Ask away

In Claude Code or Cursor: _"Add a Scorezilla leaderboard to this game."_

## Tools

| Tool | What it does |
|---|---|
| `list_games` | Lists your games. Use this first to orient. |
| `list_boards` | Lists leaderboards under a game. |
| `get_keys` | Returns the public key (safe to embed) and the secret-key prefix. The full secret never leaves the dashboard. |
| `get_board_top_n` | Returns the top entries on a board. The "is my integration working?" tool. |
| `get_sdk_snippet` | Returns ready-to-paste integration code for a board. Optional axis args tailor it: anonymous/OAuth identity, client-only vs. server-validated **anti-cheat**, and the server language (TS/Python/Go/C#). |
| `bootstrap_leaderboard` | Creates a new game + first board in one call, then returns the **widget embed** + **SDK snippet** + a plain-English recommendation. Same optional axis args (anti-cheat, OAuth, server language). The 90-second-demo path. |
| `create_game` | Creates a new (empty) game. Use when a game already exists (so `bootstrap_leaderboard` would conflict) or you want another. |
| `create_board` | Adds a leaderboard board to an **existing** game (by `gameId`), with full options (sortDir, scoreKind, retention, bounds). |
| `mint_key` | Mints a fresh public/secret key pair for an existing game. The secret is shown once. |
| `update_board_config` | Changes a board's score bounds (e.g. an anti-cheat `maxScore`) and retention. Partial updates; `null` clears a bound. |
| `update_game_config` | Sets a game's browser-submit origin allowlist (e.g. `https://yourgame.com`, `*.yourgame.com`). An empty list allows all origins. |

## Plan limits

Creating games and boards counts toward your Scorezilla plan's limits (Free: 2 games × 3 boards each; see [pricing](https://scorezilla.dev/pricing/)). When a write would go past a limit, the tool returns a `plan_limit` error with the limit and a direct upgrade link, which your assistant can pass on. Nothing is ever billed automatically. Requests are also rate-limited per token and per account; a `rate_limited` error says when to retry.

## Flags

```bash
scorezilla-mcp [--read-only] [--base-url=<url>] [--version] [--help]
```

- `--read-only` — refuse to register the write tools (`bootstrap_leaderboard`, `create_game`, `create_board`, `mint_key`, `update_board_config`, `update_game_config`). Use this on shared/CI configs to guarantee the AI can't create or change resources.
- `--base-url=<url>` — override the API origin. Defaults to `https://api.scorezilla.dev`. Useful for self-hosted or staging environments.

## Env vars

- `SCOREZILLA_TOKEN` — **required**. Bearer token issued at [dashboard.scorezilla.dev/account/tokens](https://dashboard.scorezilla.dev/account/tokens).
- `SCOREZILLA_BASE_URL` — same as `--base-url`, but via env. CLI flag wins if both are set.
- `SCOREZILLA_BETA_TOKEN` — no longer needed; the MCP is open to every account. Kept for compatibility (sent as `X-MCP-Beta` when set).

## Tokens: how they work

- Tokens are scoped to the developer who issued them and see every game associated with their account.
- The MCP server **never** returns the secret-key plaintext for a game — for that, copy from the dashboard.
- Revoke a token any time at [dashboard.scorezilla.dev/account/tokens](https://dashboard.scorezilla.dev/account/tokens). Revocations propagate within a few seconds.
- Tokens are bearer credentials: anyone with the value can call the API on your behalf. Don't commit them to source; don't paste them into shared chats. Keep them in `env` blocks, password managers, or secret stores.

## Runtime requirements

- Node ≥ 20
- A network path to `https://api.scorezilla.dev`

## Releasing

Releases are CI-driven and require an approval click in the `npm-publish` GitHub Environment. The full flow:

1. **Author a changeset** locally: `pnpm changeset` — describes what changed and the bump type. Commit the file under `.changeset/`.
2. **Merge to main.** `.github/workflows/release.yml` runs and opens a "chore(release): version @scorezilla/mcp" PR that bumps `package.json`, syncs `server.json` (the MCP Registry manifest) via `scripts/sync-server-json-version.mjs`, and updates `CHANGELOG.md`.
3. **Merge the version PR.** The same workflow then publishes:
   - npm tarball with `--provenance` (verifiable build attestation via GH OIDC + sigstore), plus a `@scorezilla/mcp@<version>` git tag and GitHub release (notes from `CHANGELOG.md`)
   - Post-publish smoke test that installs the published tarball and runs the binary
   - MCP Registry record via `mcp-publisher login github-oidc` → `mcp-publisher publish`, only after the smoke test passes; it waits for npm to serve the version and retries while the Registry can't see it yet
4. **Pre-flight guards** that run before publish: typecheck, test, build, bin smoke (`node dist/index.js --version`), and `release:check` (asserts `package.json` and `server.json` versions agree).

Manual publishes from a developer terminal still work (`bash scripts/publish.sh`) but aren't the path CI takes — they skip provenance and approval gates. Use only for one-off recovery.

## Issues / feedback

[GitHub Issues](https://github.com/isco-tec/scorezilla-mcp/issues).

## License

[MIT](./LICENSE).
