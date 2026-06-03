---
"@scorezilla/mcp": patch
---

**Smaller, faster CLI.** Bundle dropped from 725 KB to 587 KB (−19%) via
two independent gains: `tsup` now minifies the published artifact
(was suboptimal, dropped on its own by 53%), and dependencies bumped
to current majors (`zod` 4, `typescript` 6, GitHub Actions v6,
`@types/node` 25).

No API changes — all six tools, the auth model, the env vars, and
the CLI flags are unchanged. This is purely a build + dependency
freshness release.

Cold-start under `npx -y @scorezilla/mcp` should be noticeably
snappier on every MCP host-session.
