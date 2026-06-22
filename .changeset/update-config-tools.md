---
'@scorezilla/mcp': minor
---

Add two config-update write tools so an agent can tune resources after creation, not just create them:

- `update_board_config` — partial update of a board's score bounds + retention (e.g. set an anti-cheat `maxScore`, a `minScore` floor, or change retention; a bound clears with `null`).
- `update_game_config` — set a game's browser-submit origin allowlist (exact origins or `*.host` wildcards; empty allows all).

Both target existing resources by id and are ownership-scoped server-side. The internal API client gains a `patch` method. Both are excluded under `--read-only`.
