# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security reports. Instead:

- Email **security@scorezilla.dev** with a description of the issue, steps to reproduce, and any proof-of-concept code
- Or use [GitHub's private vulnerability reporting](https://github.com/isco-tec/scorezilla-mcp/security/advisories/new)

We'll acknowledge within 72 hours and aim to ship a fix within 14 days for critical issues.

## Scope

This repository is the `scorezilla-mcp` MCP server only. For issues in:

- The Scorezilla SDK (`scorezilla` npm package): see [isco-tec/scorezilla-js](https://github.com/isco-tec/scorezilla-js/security)
- The Scorezilla API or dashboard: report to security@scorezilla.dev

## Tokens

If you suspect your `SCOREZILLA_TOKEN` has been exposed (committed to a public repo, leaked in a screenshot, etc.):

1. Revoke immediately at https://dashboard.scorezilla.dev/account/tokens
2. Generate a fresh token
3. If the exposure was on GitHub, request a credential rotation via GitHub's secret scanning flow — the `mcp_live_` prefix is monitored.

Tokens are bearer credentials; treat them like passwords.

## Supported versions

The latest published version on the `@latest` and `@next` npm dist-tags receives security updates. Older versions are best-effort only.
