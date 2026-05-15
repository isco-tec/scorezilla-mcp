# Changesets

This directory contains [changesets](https://github.com/changesets/changesets) — small markdown files describing user-facing changes, used to drive the version bump + changelog automation.

## Adding a changeset

```bash
pnpm changeset
```

The CLI asks:

1. Which package(s) are bumped (just `scorezilla-mcp` here)
2. What bump type (`patch` / `minor` / `major`)
3. A description in **user-facing terms** (this lands in `CHANGELOG.md`)

The result is a `.changeset/<random>.md` file. Commit it with your PR.

## What goes in a changeset description

- **Yes:** "`bootstrap_leaderboard` now accepts `boardSlug` with mixed case."
- **No:** "Refactored slug validation into a helper."

Internal refactors that don't change behavior **don't need a changeset** — add `[skip-changeset]` to your PR title.

## Bump types

- **patch** — bug fix; no user-visible behavior change beyond the fix
- **minor** — new tool, new flag, additive change to an existing tool
- **major** — removed tool, renamed tool, breaking parameter change

While we're on `0.x.y` pre-1.0, treat majors as "actual semantic majors when we hit 1.0" — preview-release bumps go via the `@next` dist-tag.
