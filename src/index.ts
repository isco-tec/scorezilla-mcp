/**
 * scorezilla-mcp — Official MCP server for Scorezilla.
 *
 * Note: the runnable `#!/usr/bin/env node` shebang is added at build
 * time by tsup's `banner.js` setting (see tsup.config.ts) so the dist
 * output always has it regardless of source state. Keeping the shebang
 * here too would produce a duplicate `#!` at line 2 of dist/index.js,
 * which node treats as a syntax error on execute.
 *
 * Exposes six tools that let AI coding assistants (Claude Code, Cursor,
 * Continue.dev, …) set up and inspect Scorezilla leaderboards on the
 * developer's behalf.
 *
 * Stdio transport is the only supported mode in v0.1 — the server is
 * spawned by the MCP host (Claude Code, etc.) via `npx scorezilla-mcp`.
 *
 * Auth: the developer mints a token at https://dashboard.scorezilla.dev
 * and pastes it into their MCP host's config as `SCOREZILLA_TOKEN`.
 *
 * Repo: https://github.com/isco-tec/scorezilla-mcp
 * License: MIT
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  MCP_AUTH_PROVIDERS,
  MCP_HOSTING_PATTERNS,
  MCP_IDENTITY_STRATEGIES,
  MCP_SERVER_LANGUAGES,
} from './contract';
import type {
  McpBootstrapSuccess,
  McpCreateBoardResponse,
  McpCreateGameResponse,
  McpGetBoardTopResponse,
  McpGetKeysResponse,
  McpListBoardsResponse,
  McpListGamesResponse,
  McpMintKeyResponse,
  McpSdkSnippetResponse,
  McpUpdateBoardConfigResponse,
  McpUpdateGameConfigResponse,
} from './contract';

// ---------------------------------------------------------------------------
// Build metadata
// ---------------------------------------------------------------------------

/** Version pinned at build time. Surfaced via the `initialize` handshake
 *  so MCP hosts can display it. Replaced by tsup's `define` at build
 *  from `package.json#version` — the literal token below is what tsup
 *  matches. In dev (no build), `__SCOREZILLA_MCP_VERSION__` stays as-is
 *  in `pnpm test` because tests stub the initialize handshake. */
declare const __SCOREZILLA_MCP_VERSION__: string;
const VERSION =
  typeof __SCOREZILLA_MCP_VERSION__ !== 'undefined'
    ? __SCOREZILLA_MCP_VERSION__
    : '0.0.0-dev';

/** Default API base URL. Override per-process via the `--base-url` CLI
 *  flag or the `SCOREZILLA_BASE_URL` env var. */
const DEFAULT_BASE_URL = 'https://api.scorezilla.dev';

// ---------------------------------------------------------------------------
// CLI args + env config
// ---------------------------------------------------------------------------

interface RuntimeConfig {
  baseUrl: string;
  token: string;
  /** If true, write tools (bootstrap_leaderboard) are not registered.
   *  Lets a dev wire the server into a shared/CI context with the
   *  promise that no resource-creating tools can fire. */
  readOnly: boolean;
  /** Optional closed-beta token. When set, sent as `X-MCP-Beta` on every
   *  API request. The API uses it to unlock the MCP namespace on prod
   *  before the public switch is flipped. Read from
   *  `SCOREZILLA_BETA_TOKEN` env var; absent is the common case once the
   *  service is public. */
  betaToken: string | null;
}

/**
 * Parse process.argv. Accepts:
 *   --read-only           refuse to register write tools
 *   --base-url=<url>      override the API origin
 *
 * Token comes from the `SCOREZILLA_TOKEN` env var — never a CLI flag,
 * so it doesn't show up in process listings.
 */
function loadConfig(argv: readonly string[]): RuntimeConfig {
  let baseUrl = process.env.SCOREZILLA_BASE_URL ?? DEFAULT_BASE_URL;
  let readOnly = false;

  for (const arg of argv.slice(2)) {
    if (arg === '--read-only') readOnly = true;
    else if (arg.startsWith('--base-url=')) baseUrl = arg.slice('--base-url='.length);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      process.stderr.write(`scorezilla-mcp ${VERSION}\n`);
      process.exit(0);
    } else {
      process.stderr.write(`scorezilla-mcp: unknown argument "${arg}"\n`);
      process.exit(64);
    }
  }

  // Canonicalize baseUrl: strip trailing slash, lowercase scheme+host.
  // Prevents two-entry-with-same-meaning issues for any downstream caller
  // that ever does string keying on the URL.
  try {
    const u = new URL(baseUrl);
    const proto = u.protocol.toLowerCase();
    const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    // Only HTTPS (or http://localhost for dev). The SCOREZILLA_TOKEN bearer is
    // sent on every request, so a poisoned --base-url (e.g. via prompt
    // injection) must not be able to redirect credentials to a plaintext or
    // attacker-controlled origin.
    if (proto !== 'https:' && !(proto === 'http:' && isLocal)) {
      process.stderr.write(
        `scorezilla-mcp: base URL must use https:// (got "${baseUrl}"); ` +
          'only http://localhost is allowed for local dev\n',
      );
      process.exit(64);
    }
    baseUrl = `${proto}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    process.stderr.write(`scorezilla-mcp: invalid base URL "${baseUrl}"\n`);
    process.exit(64);
  }

  const token = process.env.SCOREZILLA_TOKEN ?? '';
  if (token.length === 0) {
    process.stderr.write(
      'scorezilla-mcp: SCOREZILLA_TOKEN is not set.\n' +
        '\n' +
        '  1. Generate a token: https://dashboard.scorezilla.dev/account/tokens\n' +
        '  2. Paste it into your MCP-host config under env.SCOREZILLA_TOKEN.\n' +
        '     (For Claude Code: ~/.claude/settings.json — make sure that file\n' +
        '      is not committed to source and is `chmod 600`.)\n',
    );
    process.exit(78);
  }

  // Optional closed-beta header value. Pre-public-launch only.
  const betaTokenRaw = process.env.SCOREZILLA_BETA_TOKEN ?? '';
  const betaToken = betaTokenRaw.length > 0 ? betaTokenRaw : null;

  return { baseUrl, token, readOnly, betaToken };
}

function printHelp(): void {
  process.stderr.write(
    `scorezilla-mcp ${VERSION}\n\n` +
      'Usage: scorezilla-mcp [--read-only] [--base-url=<url>]\n\n' +
      'Auth: set SCOREZILLA_TOKEN env var to a token issued at\n' +
      '      https://dashboard.scorezilla.dev/account/tokens\n\n' +
      'Flags:\n' +
      '  --read-only         Refuse to register write tools (bootstrap_leaderboard).\n' +
      '  --base-url=<url>    Override the API origin (default: ' +
      DEFAULT_BASE_URL +
      ').\n' +
      '  --help, -h          Print this help and exit.\n' +
      '  --version, -v       Print version and exit.\n',
  );
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

interface ApiOk<T> {
  ok: true;
  data: T;
}
interface ApiFail {
  ok: false;
  status: number;
  error: string;
  message: string;
  /** Some error responses include a resource_uri the host can surface
   *  back to the user via an MCP resource (e.g. "go run login"). */
  resource_uri?: string;
}
type ApiResult<T> = ApiOk<T> | ApiFail;

interface ApiClient {
  get<T>(path: string): Promise<ApiResult<T>>;
  post<T>(path: string, body: unknown, idempotencyKey?: string): Promise<ApiResult<T>>;
  /** Partial config updates (naturally idempotent → no Idempotency-Key). */
  patch<T>(path: string, body: unknown): Promise<ApiResult<T>>;
}

function buildApiClient(config: RuntimeConfig): ApiClient {
  // Headers built once at construction, spread per request so future
  // per-call additions (Idempotency-Key, etc.) don't bleed into the
  // shared closure.
  // The closed-beta header (when set) is recognized by the API and
  // unlocks the MCP namespace before the public release. Absent in
  // the common case once the service is generally available.
  const baseHeaders: Readonly<Record<string, string>> = Object.freeze({
    accept: 'application/json',
    authorization: `Bearer ${config.token}`,
    'user-agent': `scorezilla-mcp/${VERSION}`,
    // Server captures this header on every MCP-path log line so ops
    // can attribute traffic + errors to specific client builds (#109
    // Part B). User-Agent already carries the version but is parsed
    // less consistently downstream; a dedicated header is cheaper to
    // index and immune to UA-rewriting middleware.
    'x-mcp-client-version': VERSION,
    ...(config.betaToken !== null ? { 'x-mcp-beta': config.betaToken } : {}),
  });

  async function request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<ApiResult<T>> {
    const url = `${config.baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          ...baseHeaders,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          // Content-derived idempotency key on writes — a retry of the SAME
          // logical create dedupes server-side (5-min window) instead of
          // creating a duplicate; for mint_key it replays the same key pair.
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      return {
        ok: false,
        status: 0,
        error: 'network_error',
        message: `Could not reach ${config.baseUrl}: ${(err as Error)?.message ?? 'unknown error'}`,
      };
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      return {
        ok: false,
        status: res.status,
        error: 'invalid_response',
        message: `Server returned non-JSON (HTTP ${res.status})`,
      };
    }

    if (!res.ok) {
      const p = payload as Partial<ApiFail>;
      return {
        ok: false,
        status: res.status,
        error: p.error ?? 'request_failed',
        message: p.message ?? `Request failed (HTTP ${res.status})`,
        ...(typeof p.resource_uri === 'string' ? { resource_uri: p.resource_uri } : {}),
      };
    }
    return { ok: true, data: payload as T };
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body, idempotencyKey) => request('POST', path, body, idempotencyKey),
    patch: (path, body) => request('PATCH', path, body),
  };
}

// ---------------------------------------------------------------------------
// Tool-response helpers
// ---------------------------------------------------------------------------
//
// Return types are inferred (no explicit interface) so the SDK's
// CallToolResult union — which carries an index signature — accepts the
// helper output without a type-assertion dance.

/** Successful return — single text block with a pretty-printed JSON payload.
 *  Keeps the wire shape simple; hosts that want structured data parse the
 *  JSON, hosts that just display it see something legible. */
function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

/** Tool-level error — content + isError:true. The LLM sees this as a
 *  recoverable failure (different from a thrown protocol error). */
function fail(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

/** Map an API failure into a tool error, preserving the resource_uri
 *  hint when present so the host can surface it to the user. */
function failFromApi(r: ApiFail) {
  const lines = [`Error: ${r.message} (${r.error}, HTTP ${r.status})`];
  if (r.resource_uri) lines.push(`See: ${r.resource_uri}`);
  return { content: [{ type: 'text' as const, text: lines.join('\n') }], isError: true };
}

// ---------------------------------------------------------------------------
// Integration-axis inputs (shared by bootstrap_leaderboard + get_sdk_snippet)
// ---------------------------------------------------------------------------
//
// All optional — omitting every one yields the simplest anonymous +
// client_only setup. Provided, they steer the generated snippet across the
// three axes (ADRs 0002/0003/0004): WHO the player is, WHERE keys live (i.e.
// whether there's real anti-cheat), and which language the server snippet is.
// The Zod enums are built from the contract's const arrays so the wire enum
// and the tool schema can't drift.

const axisInputShape = {
  playerIdentityStrategy: z
    .enum(MCP_IDENTITY_STRATEGIES)
    .optional()
    .describe(
      "How players are attributed. 'anonymous' (default) mints a local UUID, no PII; " +
        "'prompted_local' asks once and saves to localStorage; 'auth_provider' uses OAuth " +
        "(also set authProvider); 'server_authoritative' has the game server attach the " +
        "playerId (needs hostingPattern client_with_server or server_only); 'custom_callback' " +
        'for a dev-supplied function.',
    ),
  authProvider: z
    .enum(MCP_AUTH_PROVIDERS)
    .optional()
    .describe(
      "Required when playerIdentityStrategy is 'auth_provider'. supabase/clerk/auth0/firebase " +
        'get a server-side JWT-verifying secure-submit endpoint (real anti-cheat); google ships ' +
        'a browser helper; github/apple/discord are planned; custom is the escape hatch.',
    ),
  hostingPattern: z
    .enum(MCP_HOSTING_PATTERNS)
    .optional()
    .describe(
      "Integrity model. 'client_only' (default): the browser holds the public key — simplest, " +
        "but NO anti-cheat. 'client_with_server': your server validates + signs scores — use this " +
        "for competitive boards where cheating matters. 'server_only': server reads/writes and " +
        'renders SSR HTML (max integrity, SEO-friendly, no widget).',
    ),
  serverLanguage: z
    .enum(MCP_SERVER_LANGUAGES)
    .optional()
    .describe(
      "Language for the server-side snippet. Required for hostingPattern 'server_only'; optional " +
        "for 'client_with_server' (defaults to typescript, which gets the turnkey " +
        'createScoreSubmitHandler endpoint). python/go/csharp return a best-effort snippet.',
    ),
};

// ---------------------------------------------------------------------------
// Server construction (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Build an McpServer with all tools registered. Exported so the test
 * harness can build a server backed by InMemoryTransport instead of
 * stdio. The CLI entry point calls this with `loadConfig(process.argv)`.
 */
export function buildServer(config: RuntimeConfig): McpServer {
  const api = buildApiClient(config);
  const server = new McpServer({
    name: 'scorezilla-mcp',
    version: VERSION,
  });

  // -------------------------------------------------------------------------
  // Read tools (5)
  // -------------------------------------------------------------------------

  server.tool(
    'list_games',
    'List all games owned by the authenticated developer. Returns each game with id, slug, name, and createdAt. Use this first to orient before creating new resources or inspecting an existing game. If the result is an empty list and the developer wants to add a leaderboard, call bootstrap_leaderboard next.',
    {},
    async () => {
      const r = await api.get<McpListGamesResponse>('/v1/mcp/games');
      return r.ok ? ok(r.data) : failFromApi(r);
    },
  );

  server.tool(
    'list_boards',
    'List all leaderboards (boards) under a given game. Each board has its own id, slug, ranking (sortDir: desc = high-score-wins, asc = lowest-time-wins), score kind (integer / duration_ms / float), retention policy, and optional min/max score bounds. Call this to find a board\'s id before generating a snippet (get_sdk_snippet) or reading standings (get_board_top_n), or to show the developer what boards already exist under a game returned by list_games.',
    {
      gameId: z.string().uuid().describe('UUID of the game to list boards for (from list_games)'),
    },
    async ({ gameId }) => {
      const r = await api.get<McpListBoardsResponse>(`/v1/mcp/games/${gameId}/boards`);
      return r.ok ? ok(r.data) : failFromApi(r);
    },
  );

  server.tool(
    'get_keys',
    "Get a game's API keys. Returns, per key: kind ('public' | 'secret'), prefix, createdAt, and rotation/revocation timestamps. The PUBLIC key includes its full plaintext (it's safe to embed in client code). The SECRET key's plaintext is ALWAYS null over MCP — only its prefix is shown, for identification. Use this to retrieve the public key for a client_only integration, or to check which keys exist / have been revoked. If the developer needs the full SECRET key (for a client_with_server / server_only anti-cheat setup), direct them to https://dashboard.scorezilla.dev — the Keys section under their game — since it never leaves the dashboard.",
    {
      gameId: z.string().uuid().describe('UUID of the game to fetch keys for (from list_games)'),
    },
    async ({ gameId }) => {
      const r = await api.get<McpGetKeysResponse>(`/v1/mcp/games/${gameId}/keys`);
      return r.ok ? ok(r.data) : failFromApi(r);
    },
  );

  server.tool(
    'get_board_top_n',
    'Get the top-ranked entries on a leaderboard. Call this after the developer submits a test score to confirm the integration is wired correctly — they will see their own test entry appear. Also useful for displaying current standings.',
    {
      boardId: z.string().uuid().describe('UUID of the board'),
      n: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(10)
        .describe('Number of entries to return (1–100). Defaults to 10.'),
    },
    async ({ boardId, n }) => {
      const r = await api.get<McpGetBoardTopResponse>(`/v1/mcp/boards/${boardId}/top?n=${n}`);
      return r.ok ? ok(r.data) : failFromApi(r);
    },
  );

  server.tool(
    'get_sdk_snippet',
    "Call this whenever the developer asks how to submit a score, initialize the SDK, or integrate a leaderboard into their code — INCLUDING when they want a setup other than the default: anti-cheat (server-validated scores), OAuth player identity, or a non-TypeScript server. Returns a ready-to-paste integration snippet (the `snippet` field) tailored to the axis arguments. Omit the axis args for the simplest anonymous + client-only TypeScript setup; set hostingPattern='client_with_server' (+ a serverLanguage and/or auth provider) for the secure anti-cheat path. Use it right after bootstrap_leaderboard, or any time the developer needs the integration code again or wants to switch approach. (For the drop-in widget HTML embed, bootstrap_leaderboard returns it as snippets.widget.)",
    {
      gameId: z.string().uuid().describe('UUID of the game'),
      boardId: z.string().uuid().describe('UUID of the board to target in the snippet'),
      ...axisInputShape,
    },
    async (input) => {
      const r = await api.post<McpSdkSnippetResponse>('/v1/mcp/sdk-snippet', input);
      return r.ok ? ok(r.data) : failFromApi(r);
    },
  );

  // -------------------------------------------------------------------------
  // Write tools (1) — gated by --read-only
  // -------------------------------------------------------------------------

  if (!config.readOnly) {
    server.tool(
      'bootstrap_leaderboard',
      // The first sentence is load-bearing: it's the heuristic the AI uses to
      // choose this one-shot over the granular create_game + create_board when
      // starting from scratch (one call, and it returns ready-to-paste code).
      'Use this when starting from scratch — creates a new game AND its first board in one call, then returns ready-to-paste integration code wired against the board. The fastest path from "I want a leaderboard" to "scores are flowing." Do NOT call this if the developer already has games — call list_games first and use bootstrap_leaderboard only when no game exists yet. The response includes `snippets.sdk` (framework/server code), `snippets.widget` (a themeable drop-in HTML embed; null for server_only), and a plain-English `recommendation` to relay to the developer — paste `snippets.sdk` (and/or `snippets.widget`) into their code. The optional axis args tailor the output: set hostingPattern=\'client_with_server\' for anti-cheat (server-validated scores), playerIdentityStrategy=\'auth_provider\' (+ authProvider) for OAuth identity, or serverLanguage for a non-TypeScript server. Omit them all for the simplest anonymous + client-only setup.',
      {
        gameName: z.string().min(1).max(100).describe('Display name of the game (any string)'),
        gameSlug: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{0,40}[a-z0-9]$/, '2–42 chars, lowercase alphanumeric and hyphens')
          .describe('URL-safe slug for the game, e.g. "my-racing-game" (2–42 chars, lowercase + hyphens; derive from gameName)'),
        boardName: z.string().min(1).max(100).describe('Display name of the leaderboard'),
        boardSlug: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{0,40}[a-z0-9]$/, '2–42 chars, lowercase alphanumeric and hyphens')
          .describe('URL-safe slug for the board, e.g. "high-scores" (2–42 chars, lowercase + hyphens)'),
        sortDir: z
          .enum(['asc', 'desc'])
          .default('desc')
          .describe('"desc" for high-scores-win, "asc" for lowest-time-wins'),
        scoreKind: z
          .enum(['integer', 'duration_ms', 'float'])
          .default('integer')
          .describe('Score type: integer (default), duration_ms (time trials), or float'),
        ...axisInputShape,
      },
      async (input) => {
        const r = await api.post<McpBootstrapSuccess>('/v1/mcp/bootstrap', input);
        return r.ok ? ok(r.data) : failFromApi(r);
      },
    );

    server.tool(
      'create_game',
      "Create a new (empty) game in the developer's account. Use this when they ALREADY have a game (so bootstrap_leaderboard would conflict) or want an additional game — call list_games first to check. Returns the gameId; follow up with create_board to add leaderboards and mint_key for keys. For a first-ever game from scratch, prefer bootstrap_leaderboard (it does game + board + keys + code in one call).",
      {
        name: z.string().min(1).max(100).describe('Display name of the game'),
        slug: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{0,40}[a-z0-9]$/, '2–42 chars, lowercase alphanumeric and hyphens')
          .describe('URL-safe slug, e.g. "neon-runner" (2–42 chars, lowercase + hyphens; derive from name)'),
      },
      async (input) => {
        const r = await api.post<McpCreateGameResponse>(
          '/v1/mcp/games',
          input,
          `create_game:${input.slug}`,
        );
        return r.ok ? ok(r.data) : failFromApi(r);
      },
    );

    server.tool(
      'create_board',
      'Add a leaderboard board to an EXISTING game (by gameId — get it from list_games). This is how you add boards to a game that already exists; bootstrap_leaderboard only works for brand-new games. sortDir "desc" = high-scores-win, "asc" = lowest-time-wins. Returns the created board including its id.',
      {
        gameId: z.string().uuid().describe('UUID of the game to add the board to (from list_games)'),
        name: z.string().min(1).max(100).describe('Display name of the leaderboard'),
        slug: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{0,40}[a-z0-9]$/, '2–42 chars, lowercase alphanumeric and hyphens')
          .describe('URL-safe slug for the board, e.g. "high-scores" (2–42 chars, lowercase + hyphens)'),
        sortDir: z
          .enum(['asc', 'desc'])
          .default('desc')
          .describe('"desc" for high-scores-win, "asc" for lowest-time-wins'),
        scoreKind: z
          .enum(['integer', 'duration_ms', 'float'])
          .default('integer')
          .describe('Score type: integer (default), duration_ms (time trials), or float'),
        retentionPolicy: z
          .enum(['all', 'top_n', 'rolling_30d'])
          .optional()
          .describe('How long scores are kept: all (default), top_n (best N — set retentionN), or rolling_30d'),
        retentionN: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Required when retentionPolicy="top_n": how many top scores to retain (1–1,000,000)'),
        minScore: z.number().optional().describe('Optional lower bound; scores below are rejected'),
        maxScore: z.number().optional().describe('Optional upper bound; scores above are rejected'),
      },
      async (input) => {
        const { gameId, ...board } = input;
        const r = await api.post<McpCreateBoardResponse>(
          `/v1/mcp/games/${gameId}/boards`,
          board,
          `create_board:${gameId}:${board.slug}`,
        );
        return r.ok ? ok(r.data) : failFromApi(r);
      },
    );

    server.tool(
      'mint_key',
      'Mint a fresh public/secret key pair for an EXISTING game (by gameId). Returns publicKey (pk_ — safe for the browser/widget) and secretKey (sk_ — server-only, shown ONCE; tell the developer to store it now). Use when a game needs keys, or to add another pair. Key revocation/rotation is done in the dashboard. Note: the secret also appears in this MCP host\'s tool-call transcript, so treat the conversation as sensitive until cleared.',
      {
        gameId: z.string().uuid().describe('UUID of the game to mint keys for (from list_games)'),
      },
      async (input) => {
        const r = await api.post<McpMintKeyResponse>(
          `/v1/mcp/games/${input.gameId}/keys`,
          {},
          `mint_key:${input.gameId}`,
        );
        return r.ok ? ok(r.data) : failFromApi(r);
      },
    );

    server.tool(
      'update_board_config',
      'Update a board\'s scoring config AFTER creation (by gameId + boardId — from list_games / list_boards). PARTIAL: only the fields you pass change. Use it to cap scores for anti-cheat (maxScore), set a floor (minScore), or change retention. A bound can be cleared by passing null. Returns the full updated board.',
      {
        gameId: z.string().uuid().describe('UUID of the game (from list_games)'),
        boardId: z.string().uuid().describe('UUID of the board to update (from list_boards)'),
        minScore: z
          .number()
          .nullable()
          .optional()
          .describe('Lower bound; scores below are rejected. Pass null to clear it.'),
        maxScore: z
          .number()
          .nullable()
          .optional()
          .describe('Upper bound; scores above are rejected (the anti-cheat cap). Pass null to clear it.'),
        retentionPolicy: z
          .enum(['all', 'top_n', 'rolling_30d'])
          .optional()
          .describe('How long scores are kept: all, top_n (set retentionN), or rolling_30d'),
        retentionN: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional()
          .describe('Top scores to retain when retentionPolicy="top_n" (1–1,000,000); null clears it'),
      },
      async (input) => {
        const { gameId, boardId, ...config } = input;
        const r = await api.patch<McpUpdateBoardConfigResponse>(
          `/v1/mcp/games/${gameId}/boards/${boardId}/config`,
          config,
        );
        return r.ok ? ok(r.data) : failFromApi(r);
      },
    );

    server.tool(
      'update_game_config',
      'Set a game\'s allowed-origins allowlist AFTER creation (by gameId — from list_games). Restricts browser score submissions to specific web origins: an exact origin like "https://yourgame.com" or a wildcard host like "*.yourgame.com" (up to 20). Pass an empty array to allow all origins (the default). Returns the normalized stored list. Gates browser requests only — server-to-server calls send no Origin header.',
      {
        gameId: z.string().uuid().describe('UUID of the game (from list_games)'),
        allowedOrigins: z
          .array(z.string())
          .max(20)
          .describe('Origin patterns (exact https origin or *.host wildcard); [] allows all origins'),
      },
      async (input) => {
        const r = await api.patch<McpUpdateGameConfigResponse>(`/v1/mcp/games/${input.gameId}/config`, {
          allowedOrigins: input.allowedOrigins,
        });
        return r.ok ? ok(r.data) : failFromApi(r);
      },
    );
  }

  return server;
}

// ---------------------------------------------------------------------------
// Entry point — only runs when invoked as a CLI, not when imported
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = loadConfig(process.argv);
  const server = buildServer(config);
  const transport = new StdioServerTransport();

  // Graceful shutdown — the SDK does not wire these for us. Without
  // them, SIGTERM from the MCP host can leave the process hanging.
  const shutdown = async (): Promise<void> => {
    try {
      await server.close();
    } catch {
      // best-effort
    }
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await server.connect(transport);

  // Log to STDERR — stdout is the MCP wire protocol. Writing anything
  // else there will corrupt the connection. The startup line lets a
  // developer who's debugging see we connected without polluting the
  // protocol stream.
  process.stderr.write(
    `scorezilla-mcp ${VERSION} ready (base=${config.baseUrl}${config.readOnly ? ', read-only' : ''}${config.betaToken !== null ? ', beta' : ''})\n`,
  );
}

// Run main() only when this file is the entrypoint — preserves the
// `import { buildServer } from 'scorezilla-mcp'` test path.
const isEntrypoint =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith('/dist/index.js');
if (isEntrypoint) {
  main().catch((err) => {
    process.stderr.write(`scorezilla-mcp: fatal: ${(err as Error)?.message ?? String(err)}\n`);
    process.exit(1);
  });
}
