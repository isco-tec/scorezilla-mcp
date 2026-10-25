---
"@scorezilla/mcp": patch
---

`bootstrap_leaderboard` now sends a content-derived `Idempotency-Key`, like the other create tools. A retry with the same arguments within 5 minutes (say, after a client timeout) returns the original game and board instead of creating a duplicate. The tool description and README say when a retry is safe and that `list_games` is the check after that window.
