---
'@scorezilla/mcp': minor
---

Add three create-only write tools so an AI agent can provision against an **existing** game instead of being sent to the dashboard:

- **create_game** — create a new (empty) game.
- **create_board** — add a leaderboard board to an existing game (by gameId), with full options (sortDir, scoreKind, retention, bounds).
- **mint_key** — mint a fresh pk_/sk_ key pair for an existing game.

Previously `bootstrap_leaderboard` (one-shot new game + board + keys) was the only write tool, so once a game existed the MCP was read-only. All three are gated by `--read-only` and require closed-beta access, like the rest of the server. Destructive ops (edit/archive/delete, key revocation) remain dashboard-only by design.
