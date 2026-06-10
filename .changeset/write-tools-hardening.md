---
'@scorezilla/mcp': patch
---

Harden the write tools (review follow-up):

- **Retry-safe writes**: `create_game`, `create_board`, and `mint_key` now send a content-derived `Idempotency-Key`, so a retried call dedupes server-side (5-minute window) instead of creating a duplicate — `mint_key` in particular replays the same key pair rather than minting a second one.
- **HTTPS-only base URL**: `--base-url` now rejects non-`https://` origins (except `http://localhost` for dev), so a poisoned base URL can't redirect the `SCOREZILLA_TOKEN` bearer to a plaintext/attacker origin.
- `create_board` / `mint_key` `gameId` is now validated as a UUID (consistent with the read tools) for a clearer first-pass error.
- `mint_key` description now notes the secret appears in the MCP host's transcript.
