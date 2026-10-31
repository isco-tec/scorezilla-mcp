---
"@scorezilla/mcp": minor
---

Daily Challenge boards. `create_board` takes an optional `period`: `"daily_utc"` makes a board that starts empty every UTC day (past days stay readable), and the default `"none"` keeps one all-time ranking. The period is set at creation and can't be changed afterwards. `list_boards`, `create_board` and `update_board_config` now return each board's `period`, matching the Scorezilla API.
