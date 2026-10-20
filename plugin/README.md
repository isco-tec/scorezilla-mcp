# Scorezilla plugin for Claude

Add a global leaderboard to your game by asking Claude. ~5 KB SDK, zero dependencies.

This plugin connects Claude to [Scorezilla](https://scorezilla.dev), a hosted leaderboard service for games,
and teaches it the whole setup: ask "add a leaderboard to this game" and Claude creates the game and board in
your Scorezilla account, adds ready-to-paste integration code to your project, and checks that a test score
arrives.

## What's inside

- **MCP server:** [`@scorezilla/mcp`](https://www.npmjs.com/package/@scorezilla/mcp), version 0.4.3, pinned
  with its hash in `package-lock.json` and started with `node`. Eleven tools: five that read (`list_games`, `list_boards`, `get_keys`, `get_board_top_n`,
  `get_sdk_snippet`) and six that create or change things in your Scorezilla account
  (`bootstrap_leaderboard`, `create_game`, `create_board`, `mint_key`, `update_board_config`,
  `update_game_config`). Source: [github.com/isco-tec/scorezilla-mcp](https://github.com/isco-tec/scorezilla-mcp).
- **Skill `add-leaderboard`:** finds where your game ends a run, creates or reuses a board, picks the right
  integration setup, adds the code, and confirms with `get_board_top_n`.

## Setup

1. Sign up free at [dashboard.scorezilla.dev](https://dashboard.scorezilla.dev), open **MCP tokens** and create
   a token (it starts with `mcp_live_` and is shown once).
2. Add the plugin and paste the token when asked. It's stored in your system's secure credential store, not in
   a settings file.
3. Ask Claude: _"Add a leaderboard to this game."_

Creating games and boards counts toward your plan's limits (Free: 2 games × 3 boards each). See
[pricing](https://scorezilla.dev/pricing).

## What it sends where

- When you install the plugin, Claude Code installs `@scorezilla/mcp@0.4.3` from the npm registry, checked
  against the hash in `package-lock.json`. The package has no dependencies of its own.
- The server sends your token and the requests Claude makes (game and board names, settings, board ids) to
  `https://api.scorezilla.dev` over HTTPS. Nothing else leaves your machine, and the server doesn't read your
  project's files.
- The server never returns a game's secret key. For server-signed submissions, copy it from the dashboard.

## Notes

- With the default setup the browser submits scores with the public key, so there's no anti-cheat. For boards
  where ranking matters, the skill sets up server-signed submissions instead.
- Revoke a token any time at
  [dashboard.scorezilla.dev/account/tokens](https://dashboard.scorezilla.dev/account/tokens).
- Issues: [github.com/isco-tec/scorezilla-mcp/issues](https://github.com/isco-tec/scorezilla-mcp/issues).

## License

MIT. See [LICENSE](./LICENSE).
