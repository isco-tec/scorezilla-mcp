---
name: add-leaderboard
description: Add a global Scorezilla leaderboard to the game in this project. Use when the user asks to add a leaderboard, high scores, a high-score table or global rankings to their game, or asks to wire up Scorezilla.
---

# Add a leaderboard to this game

Uses the `scorezilla` MCP server from this plugin. The flow is: find or create the game and board, get
integration code, put it into the project, then confirm a real score arrives.

## 1. Look at the project first

Before calling any tool, read enough of the project to answer:

- **Where the run ends.** Find the game-over / level-complete / finish code where the final score is known.
- **What the score is.** Points where higher wins, or a time where lower wins (a time trial)? Whole numbers,
  milliseconds or decimals?
- **Where it runs.** Browser only, or is there a server the game already talks to?

Ask the user only what the code can't tell you, such as the game's display name.

## 2. Find or create the board

1. Call `list_games`.
2. **No games yet:** call `bootstrap_leaderboard`. It creates the game and its first board in one call and
   returns `snippets.sdk`, `snippets.widget` and a `recommendation`.
   - `gameName` from the project (package name, title screen, README); `gameSlug` derived from it
     (lowercase, hyphens, 2–42 characters).
   - `boardName` / `boardSlug`: something like "High Scores" / `high-scores`.
   - `sortDir`: `desc` when higher wins, `asc` when lower wins.
   - `scoreKind`: `integer`, `duration_ms` for time trials, or `float`.
3. **The game already exists:** call `list_boards` with its `gameId`. Reuse a matching board, or call
   `create_board` to add one. Don't call `bootstrap_leaderboard` for a game that already exists.

## 3. Get the integration code

Call `get_sdk_snippet` with the `gameId` and `boardId`. If you just bootstrapped, you already have the code,
and only call it again to change the setup.

Pick the setup from what you learned in step 1:

- **Default (browser game, casual board):** leave the optional arguments out. The browser uses the public key,
  which is safe to embed. Scores are trusted from the client, so say plainly that this setup has no
  anti-cheat.
- **Competitive board where cheating matters, and the project has a server:** pass
  `hostingPattern: "client_with_server"` (and `serverLanguage` if the server isn't TypeScript). The server
  signs submissions with the game's secret key. The secret key is never returned over MCP: tell the user to
  copy it from https://dashboard.scorezilla.dev into an environment variable on their server.
- **Players already sign in** (Supabase, Clerk, Auth0, Firebase, Google): pass
  `playerIdentityStrategy: "auth_provider"` and the matching `authProvider`.

## 4. Put it into the project

- Install the SDK with the project's own package manager: the npm package is `scorezilla`.
- Paste the returned code where it fits the project's structure, and call the submit function at the point
  from step 1 where the final score is known.
- If the user wants a visible table, add `snippets.widget` (from `bootstrap_leaderboard`) where the game shows
  its menu or game-over screen.
- Never write the MCP token or a secret key into source files. The public key is the only key that belongs in
  client code.

## 5. Confirm it works

Ask the user to play one round (or run the game's test or dev build) so a score is submitted, then call
`get_board_top_n` with the `boardId`. When their test entry shows up, tell them it's live. If it doesn't, check
that the submit call runs, that the board id matches, and the browser console for errors.

Finish with a short summary: the game and board names, which files changed, and which setup you chose and why.

## Read-only and limits

- If the write tools are missing, the server is running with `--read-only`: say so and only use the read tools.
- A plan-limit error from a create call includes an upgrade link: pass it on to the user and don't retry.
