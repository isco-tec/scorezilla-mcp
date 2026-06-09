---
"@scorezilla/mcp": minor
---

Add integration-axis arguments to `bootstrap_leaderboard` and `get_sdk_snippet` (`playerIdentityStrategy`, `authProvider`, `hostingPattern`, `serverLanguage`), so the assistant can generate the full set of integrations — not just the default anonymous + client-only snippet:

- the drop-in **widget** HTML embed (`bootstrap_leaderboard` now returns `snippets.widget` + `snippets.sdk` + a plain-English `recommendation`)
- the **secure, server-validated (anti-cheat)** path (`hostingPattern: 'client_with_server' | 'server_only'`)
- **OAuth** player identity (`playerIdentityStrategy: 'auth_provider'` + an `authProvider`)
- non-TypeScript server snippets via `serverLanguage`

Syncs `src/contract.ts` to the current `/v1/mcp/*` API contract (axis enums, `McpSnippetBundle`, and the `snippets` + `recommendation` fields on the bootstrap response). The legacy `sdkSnippet` field is retained as a deprecated alias. Also enriches the `list_boards`/`get_keys` tool descriptions.
