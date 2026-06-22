/**
 * Wire-level response shapes for the `/v1/mcp/*` endpoints this server
 * consumes.
 *
 * These types mirror `apps/api/src/mcp/contract.ts` in the private
 * monorepo verbatim. When the API team updates the contract on their
 * side, this file MUST be updated in the same release cycle — the
 * integration tests in `test/integration.test.ts` validate every mocked
 * response against these types so drift fails the TS compile here.
 *
 * Eventually the API will publish a `@scorezilla/mcp-contract` npm
 * package and this file becomes a re-export; for now, a manual mirror
 * is the right shape (one source of truth, copied with intent rather
 * than coupling two repos at the build layer).
 */

export interface McpOk {
  ok: true;
}

export interface McpError {
  ok: false;
  error: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// GET /v1/mcp/games
// ---------------------------------------------------------------------------

export interface McpGameSummary {
  id: string;
  slug: string;
  name: string;
  createdAt: number;
}

export interface McpListGamesResponse extends McpOk {
  games: McpGameSummary[];
}

// ---------------------------------------------------------------------------
// GET /v1/mcp/games/:gameId/boards
// ---------------------------------------------------------------------------

export interface McpBoardSummary {
  id: string;
  slug: string;
  name: string;
  sortDir: 'asc' | 'desc';
  scoreKind: 'integer' | 'duration_ms' | 'float';
  retentionPolicy: 'all' | 'top_n' | 'rolling_30d';
  retentionN: number | null;
  minScore: number | null;
  maxScore: number | null;
  createdAt: number;
}

export interface McpListBoardsResponse extends McpOk {
  boards: McpBoardSummary[];
}

// ---------------------------------------------------------------------------
// Create-only write tools: create_game / create_board / mint_key
// ---------------------------------------------------------------------------

export interface McpCreateGameResponse extends McpOk {
  gameId: string;
  slug: string;
  name: string;
  createdAt: number;
}

export interface McpCreateBoardResponse extends McpOk {
  board: McpBoardSummary;
}

export interface McpMintKeyResponse extends McpOk {
  publicKey: string;
  secretKey: string;
  secretKeyPrefix: string;
}

// ---------------------------------------------------------------------------
// Config-update write tools: update_board_config / update_game_config
// ---------------------------------------------------------------------------

/** Board after a partial config update (maxScore / minScore / retention). */
export interface McpUpdateBoardConfigResponse extends McpOk {
  board: McpBoardSummary;
}

/** A game's allowed-origins after an update (normalized; empty ⇒ all origins). */
export interface McpUpdateGameConfigResponse extends McpOk {
  gameId: string;
  allowedOrigins: string[];
}

// ---------------------------------------------------------------------------
// GET /v1/mcp/games/:gameId/keys
// ---------------------------------------------------------------------------

export interface McpKeySummary {
  id: string;
  kind: 'public' | 'secret';
  prefix: string;
  /** For public keys: full plaintext. For secret keys: ALWAYS null —
   *  the full secret never leaves the dashboard. */
  plaintext: string | null;
  lastRotatedAt: number | null;
  revokedAt: number | null;
  createdAt: number;
}

export interface McpGetKeysResponse extends McpOk {
  keys: McpKeySummary[];
}

// ---------------------------------------------------------------------------
// POST /v1/mcp/bootstrap + POST /v1/mcp/sdk-snippet — integration axes
//
// Mirrors apps/api/src/mcp/contract.ts (ADRs 0002/0003/0004). The const
// arrays are the runtime-iterable source of truth the tool schemas build
// their Zod enums from (src/index.ts), so the wire enum and the validator
// can't drift inside this repo.
// ---------------------------------------------------------------------------

/**
 * Player attribution strategy for the generated snippet (ADR 0003).
 * - `anonymous`            — SDK mints a local UUID; no prompt, no PII (default).
 * - `prompted_local`       — One-time prompt, saved to localStorage.
 * - `auth_provider`        — OAuth sign-in (requires `authProvider`).
 * - `server_authoritative` — Game server attaches the playerId (requires a
 *                            server-mediated `hostingPattern`).
 * - `custom_callback`      — Dev-supplied async function returning the playerId.
 */
export type McpPlayerIdentityStrategy =
  | 'anonymous'
  | 'prompted_local'
  | 'auth_provider'
  | 'server_authoritative'
  | 'custom_callback';

export const MCP_IDENTITY_STRATEGIES = [
  'anonymous',
  'prompted_local',
  'auth_provider',
  'server_authoritative',
  'custom_callback',
] as const satisfies readonly McpPlayerIdentityStrategy[];

/**
 * OAuth / app-auth provider for `playerIdentityStrategy: 'auth_provider'`.
 * `supabase`/`clerk`/`auth0`/`firebase` are the app-auth platforms whose JWTs
 * the generated secure-submit endpoint can verify server-side; `google` ships
 * a browser helper today; `custom` is the escape hatch.
 */
export type McpAuthProvider =
  | 'google'
  | 'github'
  | 'apple'
  | 'discord'
  | 'supabase'
  | 'clerk'
  | 'auth0'
  | 'firebase'
  | 'custom';

export const MCP_AUTH_PROVIDERS = [
  'google',
  'github',
  'apple',
  'discord',
  'supabase',
  'clerk',
  'auth0',
  'firebase',
  'custom',
] as const satisfies readonly McpAuthProvider[];

/** App-auth platforms with a built-in `scorezilla/server` JWT verifier. */
export const MCP_VERIFIABLE_AUTH_PROVIDERS = [
  'supabase',
  'clerk',
  'auth0',
  'firebase',
] as const satisfies readonly McpAuthProvider[];

export type McpVerifiableAuthProvider = (typeof MCP_VERIFIABLE_AUTH_PROVIDERS)[number];

/**
 * Hosting / key strategy (ADR 0004).
 * - `client_only`        — Browser holds pk_*; simplest; no anti-cheat (default).
 * - `client_with_server` — Game server holds sk_*, validates + signs; higher
 *                          integrity (this is the anti-cheat path).
 * - `server_only`        — Server reads/writes + renders SSR; max integrity;
 *                          no widget.
 */
export type McpHostingPattern = 'client_only' | 'client_with_server' | 'server_only';

export const MCP_HOSTING_PATTERNS = [
  'client_only',
  'client_with_server',
  'server_only',
] as const satisfies readonly McpHostingPattern[];

/**
 * Language for the server-side snippet. Required for `server_only`; optional
 * for `client_with_server` (defaults to `typescript`, which gets the turnkey
 * `createScoreSubmitHandler` endpoint). Non-TS languages return a best-effort
 * snippet plus a "coming soon" note.
 */
export type McpServerLanguage = 'typescript' | 'python' | 'go' | 'csharp';

export const MCP_SERVER_LANGUAGES = [
  'typescript',
  'python',
  'go',
  'csharp',
] as const satisfies readonly McpServerLanguage[];

/**
 * Per-axis integration snippets (ADR 0002). Returned together so the AI sees
 * both options. `widget` is the drop-in HTML embed (null for `server_only`);
 * `sdk` is the framework/language-specific code (always present).
 */
export interface McpSnippetBundle {
  widget: string | null;
  sdk: string;
}

export interface McpBootstrapSuccess extends McpOk {
  gameId: string;
  boardId: string;
  publicKey: string;
  /**
   * @deprecated since 2026-05-17 (ADR 0002). Use `snippets.sdk`. Kept as an
   * alias during the transition window; the API still returns it.
   */
  sdkSnippet: string;
  /** Per-axis snippet bundle (widget + sdk). Prefer this. */
  snippets: McpSnippetBundle;
  /** Plain-English guidance (widget vs SDK, identity tradeoffs, hosting
   *  pattern) for the assistant to relay or use as a tiebreaker. */
  recommendation: string;
}

/**
 * Complete-failure error codes for POST /v1/mcp/bootstrap (game not created).
 * `incompatible_axes` = the identity + hosting combination is invalid (e.g.
 * `server_authoritative` needs a server-mediated hosting pattern).
 */
export type McpBootstrapErrorCode =
  | 'slug_taken_active'
  | 'slug_taken_reserved'
  | 'incompatible_axes'
  | 'invalid_input'
  | 'invalid_json';

export interface McpBootstrapError {
  ok: false;
  error: McpBootstrapErrorCode;
  message?: string;
}

export interface McpBootstrapPartialFailure {
  ok: false;
  error: 'partial_failure';
  message: string;
  partial: {
    gameId: string;
    gameCreated: boolean;
    keysIssued: boolean;
    boardCreated: boolean;
  };
}

/** Tagged union of every POST /v1/mcp/bootstrap response. Narrow on `ok`
 *  first, then on `error`. */
export type McpBootstrapResponse =
  | McpBootstrapSuccess
  | McpBootstrapError
  | McpBootstrapPartialFailure;

// ---------------------------------------------------------------------------
// GET /v1/mcp/boards/:boardId/top
// ---------------------------------------------------------------------------

export interface McpLeaderboardEntry {
  rank: number;
  playerId: string;
  /** The player's public display name, when set. */
  name?: string;
  score: number;
  submittedAt: number;
  metadata?: Record<string, unknown>;
}

export interface McpGetBoardTopResponse extends McpOk {
  boardId: string;
  entries: McpLeaderboardEntry[];
}

// ---------------------------------------------------------------------------
// POST /v1/mcp/sdk-snippet
// ---------------------------------------------------------------------------

export interface McpSdkSnippetResponse extends McpOk {
  snippet: string;
}
