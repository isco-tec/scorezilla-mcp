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
  minScore: number | null;
  maxScore: number | null;
  createdAt: number;
}

export interface McpListBoardsResponse extends McpOk {
  boards: McpBoardSummary[];
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

export interface McpBootstrapSuccess extends McpOk {
  gameId: string;
  boardId: string;
  publicKey: string;
  sdkSnippet: string;
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

// ---------------------------------------------------------------------------
// GET /v1/mcp/boards/:boardId/top
// ---------------------------------------------------------------------------

export interface McpLeaderboardEntry {
  rank: number;
  playerId: string;
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
