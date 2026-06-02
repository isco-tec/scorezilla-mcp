# scorezilla-mcp

[![npm version](https://img.shields.io/npm/v/@scorezilla/mcp.svg)](https://www.npmjs.com/package/@scorezilla/mcp)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Official Model Context Protocol (MCP) server for [Scorezilla](https://scorezilla.dev) — the easiest way to add a leaderboard to your game. Connect this server to your AI coding assistant (Claude Code, Cursor, Continue.dev, …) and ship a working leaderboard without leaving your editor.

## What you can ask the AI to do

- "Add a leaderboard to my game" → it bootstraps a game + board and pastes ready-to-run TypeScript SDK code into your project
- "What did my last test score rank?" → it reads your live leaderboard
- "List my games" / "show me the boards on X" → it inspects what you already have

Six tools total — five read-only, one that creates resources (`bootstrap_leaderboard`).

## Install + configure

> ⚠️ **Status — v0.1 preview.** Published on the `@next` dist-tag only. The snippets below use `@scorezilla/mcp@next`; once we ship a stable release the `@latest` tag will work too.

### 1. Get a token

Sign in at [dashboard.scorezilla.dev](https://dashboard.scorezilla.dev), open **MCP tokens**, click **Create token**. Copy the `mcp_live_*` value once — it's not shown again.

### 2. Add the server to your AI coding assistant

**Claude Code** — edit `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "scorezilla": {
      "command": "npx",
      "args": ["-y", "@scorezilla/mcp@next"],
      "env": {
        "SCOREZILLA_TOKEN": "mcp_live_…"
      }
    }
  }
}
```

> 🔒 **Keep `~/.claude/settings.json` private.** The token is stored in plaintext in that file. Make sure it's not committed to git (it's usually in your `.gitignore`), not synced to a public dotfiles repo, and not backed up to a shared location. On macOS/Linux: `chmod 600 ~/.claude/settings.json` so only your user can read it. If a token leaks, revoke it at [dashboard.scorezilla.dev/account/tokens](https://dashboard.scorezilla.dev/account/tokens).

**Cursor** — open Settings → Features → MCP → Add new MCP server, then use the same `command` + `args` + `env` shape.

**Anything else MCP-compatible** — point your client at `npx -y @scorezilla/mcp@next` with `SCOREZILLA_TOKEN` set in the environment.

### 3. Ask away

In Claude Code or Cursor: _"Add a Scorezilla leaderboard to this game."_

## Tools

| Tool | What it does |
|---|---|
| `list_games` | Lists your games. Use this first to orient. |
| `list_boards` | Lists leaderboards under a game. |
| `get_keys` | Returns the public key (safe to embed) and the secret-key prefix. The full secret never leaves the dashboard. |
| `get_board_top_n` | Returns the top entries on a board. The "is my integration working?" tool. |
| `get_sdk_snippet` | Returns ready-to-paste TypeScript SDK init code targeting a specific board. |
| `bootstrap_leaderboard` | Creates a new game + first board in one call, returns the SDK snippet. The 90-second-demo path. |

## Flags

```bash
scorezilla-mcp [--read-only] [--base-url=<url>] [--version] [--help]
```

- `--read-only` — refuse to register `bootstrap_leaderboard`. Use this on shared/CI configs to guarantee the AI can't create resources.
- `--base-url=<url>` — override the API origin. Defaults to `https://api.scorezilla.dev`. Useful for self-hosted or staging environments.

## Env vars

- `SCOREZILLA_TOKEN` — **required**. Bearer token issued at [dashboard.scorezilla.dev/account/tokens](https://dashboard.scorezilla.dev/account/tokens).
- `SCOREZILLA_BASE_URL` — same as `--base-url`, but via env. CLI flag wins if both are set.
- `SCOREZILLA_BETA_TOKEN` — pre-public closed-beta only. When set, sent as the `X-MCP-Beta` header on every API call to unlock the MCP namespace before the public switch is flipped. You'll only need this if a Scorezilla team member gave you a beta token; ignore otherwise.

## Tokens: how they work

- Tokens are scoped to the developer who issued them and see every game associated with their account.
- The MCP server **never** returns the secret-key plaintext for a game — for that, copy from the dashboard.
- Revoke a token any time at [dashboard.scorezilla.dev/account/tokens](https://dashboard.scorezilla.dev/account/tokens). Revocations propagate within a few seconds.
- Tokens are bearer credentials: anyone with the value can call the API on your behalf. Don't commit them to source; don't paste them into shared chats. Keep them in `env` blocks, password managers, or secret stores.

## Runtime requirements

- Node ≥ 20
- A network path to `https://api.scorezilla.dev`

## Issues / feedback

[GitHub Issues](https://github.com/isco-tec/scorezilla-mcp/issues).

## License

[MIT](./LICENSE).
