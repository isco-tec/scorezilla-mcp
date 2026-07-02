// GENERATED — DO NOT EDIT BY HAND.
// Vendored verbatim from the Scorezilla monorepo source of truth: apps/api/src/mcp/contract.ts
// Regenerate via the cross-repo contract-sync (or `node scripts/sync-contract.mjs`
// in the monorepo). The drift guard in this repo recomputes source-sha256 below
// and fails if this file was edited by hand or drifted from the SoT.
// source-sha256: a6ab44c53576ada66ea03e9dd1a8c4db6b033d4c97b2b2c4b94141dc50cb2879

/**
 * MCP response contract (#102, drift detector).
 *
 * The TypeScript types here are the source of truth for `/v1/mcp/*`
 * response shapes. The handlers in `index.ts` return values that conform
 * to these types; the integration tests in `mcp.test.ts` assert against
 * them. If a handler ever drifts, tests fail in the SAME PR that changed
 * the handler — which is the only practical drift signal we have until
 * we publish a shared `@scorezilla/mcp-contract` npm package and have
 * the public `scorezilla-mcp` scaffold consume it.
 *
 * The scaffold mirrors these types in its own `src/contract.ts`
 * (https://github.com/isco-tec/scorezilla-mcp/blob/main/src/contract.ts).
 * When we change anything here, change there too — the scaffold-side
 * `expectTypeOf` tests in `test/integration.test.ts` catch the omission
 * on the next sync. Drift discipline lives in BOTH README headers; if
 * you only opened one file, look at the other before merging.
 *
 * Note: the wire is JSON, so all values are JSON-serializable. We use
 * plain interfaces (not Zod schemas) to keep the API's runtime surface
 * small. Runtime validation is the consumer's job; the API's job is to
 * stay shape-stable.
 */

// ---------------------------------------------------------------------------
// Common shapes
// ---------------------------------------------------------------------------

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
  /** Number of top scores retained when `retentionPolicy === 'top_n'`; null otherwise. */
  retentionN: number | null;
  minScore: number | null;
  maxScore: number | null;
  createdAt: number;
}

export interface McpListBoardsResponse extends McpOk {
  boards: McpBoardSummary[];
}

// ---------------------------------------------------------------------------
// Create-only write tools (AI provisioning): POST /v1/mcp/games,
// POST /v1/mcp/games/:gameId/boards, POST /v1/mcp/games/:gameId/keys.
// Destructive ops (edit/archive/delete) stay dashboard-only by design.
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

/** #403: the board after a partial config update (maxScore / minScore /
 *  retention). Same shape as create — the full, current board. */
export interface McpUpdateBoardConfigResponse extends McpOk {
  board: McpBoardSummary;
}

/** #403: a game's allowed-origins after an update. The normalized, stored list
 *  (lowercased + de-duped); empty ⇒ all origins allowed. */
export interface McpUpdateGameConfigResponse extends McpOk {
  gameId: string;
  allowedOrigins: string[];
}

/** Both plaintext keys are shown ONCE here — the secret is never retrievable
 *  again (only its prefix is stored). The caller must persist them now. */
export interface McpMintKeyResponse extends McpOk {
  publicKey: string;
  secretKey: string;
  secretKeyPrefix: string;
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
// POST /v1/mcp/bootstrap
// ---------------------------------------------------------------------------

/**
 * Player attribution strategies for the returned SDK snippet. Closes part
 * of #116 (ADR 0003: identity axis).
 *
 * - `anonymous`            — SDK mints a UUID locally; no prompt; no PII.
 * - `prompted_local`       — One-time prompt on first visit, save to localStorage.
 * - `auth_provider`        — OAuth sign-in (requires `authProvider`).
 * - `server_authoritative` — Game server attaches playerId (requires
 *                            server-mediated hostingPattern, see below).
 * - `custom_callback`      — Dev-supplied async function returning playerId.
 *
 * Default: `anonymous` (privacy-safest).
 */
export type McpPlayerIdentityStrategy =
  | 'anonymous'
  | 'prompted_local'
  | 'auth_provider'
  | 'server_authoritative'
  | 'custom_callback';

/**
 * Runtime-iterable companion to `McpPlayerIdentityStrategy`. The
 * `satisfies` constraint makes the compiler verify exhaustiveness at
 * the definition site — adding a new member to the union without
 * extending this array fails the build. Handler-side validation builds
 * its `Set` from this constant, so the type union and the validator
 * can't drift.
 */
export const MCP_IDENTITY_STRATEGIES = [
  'anonymous',
  'prompted_local',
  'auth_provider',
  'server_authoritative',
  'custom_callback',
] as const satisfies readonly McpPlayerIdentityStrategy[];

/** Type guard for `McpPlayerIdentityStrategy`. Use at the request-body
 *  boundary so the narrowed value can be assigned without a cast. */
export function isMcpPlayerIdentityStrategy(v: unknown): v is McpPlayerIdentityStrategy {
  return typeof v === 'string' && (MCP_IDENTITY_STRATEGIES as readonly string[]).includes(v);
}

/**
 * Auth provider for `playerIdentityStrategy: 'auth_provider'`. Two families:
 *
 * - **SDK-helper OAuth** (`google`, `github`, `apple`, `discord`): the
 *   browser signs in via `useAuthProvider` (Google ships today; GitHub
 *   needs a server-side exchange; Apple + Discord follow — scorezilla#125).
 * - **App-auth platforms** (`supabase`, `clerk`, `auth0`, `firebase`): the
 *   game already authenticates players with this platform; the client
 *   reads the session from the platform SDK, and on the secure path
 *   (`client_with_server`) the generated endpoint verifies the platform
 *   JWT server-side via the matching `scorezilla/server` verifier (#212).
 *
 * `custom` is the escape hatch for anything else.
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

/**
 * The app-auth platforms whose JWTs the generated secure-submit endpoint
 * can verify with a built-in `scorezilla/server` verifier (#211/#212).
 * Runtime-iterable for the snippet generator + tests.
 */
export const MCP_VERIFIABLE_AUTH_PROVIDERS = [
  'supabase',
  'clerk',
  'auth0',
  'firebase',
] as const satisfies readonly McpAuthProvider[];

export type McpVerifiableAuthProvider = (typeof MCP_VERIFIABLE_AUTH_PROVIDERS)[number];

export function isMcpVerifiableAuthProvider(v: unknown): v is McpVerifiableAuthProvider {
  return typeof v === 'string' && (MCP_VERIFIABLE_AUTH_PROVIDERS as readonly string[]).includes(v);
}

export function isMcpAuthProvider(v: unknown): v is McpAuthProvider {
  return typeof v === 'string' && (MCP_AUTH_PROVIDERS as readonly string[]).includes(v);
}

/**
 * Hosting / key strategy for the integration. Closes part of #116 (ADR
 * 0004: key strategy axis).
 *
 * - `client_only`         — Browser holds pk_*; HMAC writes; client renders.
 *                           Simplest; no anti-cheat. The default.
 * - `client_with_server`  — Game server holds sk_*; validates + signs;
 *                           browser submits to game's own endpoint. Higher
 *                           integrity, more infrastructure.
 * - `server_only`         — No client-side Scorezilla; game server reads
 *                           + writes, renders SSR HTML. SEO-friendly,
 *                           max integrity. Widget snippet is omitted for
 *                           this pattern (incompatible with SSR).
 *
 * Default: `client_only`.
 */
export type McpHostingPattern = 'client_only' | 'client_with_server' | 'server_only';

export const MCP_HOSTING_PATTERNS = [
  'client_only',
  'client_with_server',
  'server_only',
] as const satisfies readonly McpHostingPattern[];

export function isMcpHostingPattern(v: unknown): v is McpHostingPattern {
  return typeof v === 'string' && (MCP_HOSTING_PATTERNS as readonly string[]).includes(v);
}

/**
 * Language for the server-side snippet. Required for
 * `hostingPattern: 'server_only'`; optional for `client_with_server`
 * (defaults to `typescript`, which gets the turnkey
 * `createScoreSubmitHandler` endpoint — #212). v1 ships `typescript`
 * only; the other languages return a best-effort snippet plus a
 * "coming soon" note.
 */
export type McpServerLanguage = 'typescript' | 'python' | 'go' | 'csharp';

export const MCP_SERVER_LANGUAGES = [
  'typescript',
  'python',
  'go',
  'csharp',
] as const satisfies readonly McpServerLanguage[];

export function isMcpServerLanguage(v: unknown): v is McpServerLanguage {
  return typeof v === 'string' && (MCP_SERVER_LANGUAGES as readonly string[]).includes(v);
}

/**
 * Per-axis integration snippets. Closes part of #116 (ADR 0002: rendering
 * axis). Returned together so the AI sees both options and can pick (or
 * ask the developer) based on context.
 *
 * - `widget` is the drop-in HTML embed served from widget.scorezilla.dev.
 *   Themeable via CSS vars + data attrs. Free-tier ships with a "Powered
 *   by Scorezilla" backlink; paid-tier removes it. Omitted entirely for
 *   `hostingPattern: 'server_only'` (the widget is client-side JS).
 * - `sdk` is the framework-specific init code (TypeScript by default;
 *   Python/Go/C# when `serverLanguage` is set on a server_only pattern).
 *   Always returned.
 */
export interface McpSnippetBundle {
  /** Null when `hostingPattern === 'server_only'` (widget is client-side
   *  JS, incompatible with SSR). String otherwise. */
  widget: string | null;
  sdk: string;
}

export interface McpBootstrapSuccess extends McpOk {
  gameId: string;
  boardId: string;
  publicKey: string;
  /**
   * @deprecated since 2026-05-17 (ADR 0002). Use `snippets.sdk` instead.
   * Kept during a transition window so existing AI clients that already
   * parse this field don't break on day one.
   *
   * Removal trigger: bump of the public `scorezilla-mcp` scaffold to
   * `0.2.0` (per ADR 0002 §"Compatibility window"). At that point this
   * field is deleted from both the API contract and the scaffold mirror,
   * and `snippets.sdk` becomes the canonical reader.
   */
  sdkSnippet: string;
  /** New: per-axis snippet bundle. See `McpSnippetBundle`. */
  snippets: McpSnippetBundle;
  /** Plain-English summary of when to pick widget vs SDK, identity
   *  strategy tradeoffs, and hosting-pattern guidance. Surfaced to the
   *  AI as tool-call output; intended for the assistant to relay to the
   *  developer or to use as a tiebreaker when context is ambiguous. */
  recommendation: string;
}

/**
 * Error codes returned by POST /v1/mcp/bootstrap on a "complete" failure
 * (game wasn't created). For *partial* failures — game created, board
 * not — see McpBootstrapPartialFailure below. Closes #115.
 *
 * - `slug_taken_active`   — gameSlug collides with a live game in the
 *                           tenant. Pick a different slug.
 * - `slug_taken_reserved` — gameSlug collides with a soft-deleted
 *                           (archived) game. Slug stays reserved through
 *                           soft-delete by design (public keys in the
 *                           wild + audit integrity). Pick a different
 *                           slug, or restore the deleted game in the
 *                           dashboard.
 * - `incompatible_axes`   — combination of playerIdentityStrategy +
 *                           hostingPattern doesn't make sense (e.g.,
 *                           `server_authoritative` identity needs server-
 *                           mediated hosting). Pick a compatible pair —
 *                           see ADR 0004's cross-axis matrix.
 * - `invalid_input`       — request body failed shape validation
 *                           (slug pattern, required fields, enum
 *                           membership, …).
 * - `invalid_json`        — request body wasn't valid JSON.
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

/**
 * Tagged union of every possible POST /v1/mcp/bootstrap response.
 * Narrow on `ok` first, then on `error` for the full type-safe matrix.
 * Mirror in the scaffold's contract.ts so downstream consumers get the
 * same exhaustiveness checks.
 */
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
  score: number;
  submittedAt: number;
  metadata?: Record<string, unknown>;
  /** #314: the player's public display name, when set. */
  name?: string;
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
