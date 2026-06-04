---
"@scorezilla/mcp": patch
---

Every API call now sends `X-MCP-Client-Version: <package-version>`.
Pairs with the server-side capture in scorezilla#205 — the API logs
the value on every MCP-path structured log line, so post-incident
queries can isolate to a specific client build ("what % of MCP
traffic is on v0.1.x?", "is this error spike from v0.2.0?").

No behavior change for users; the header is observational only.
