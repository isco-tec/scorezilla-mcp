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
import type {
  McpBootstrapSuccess,
  McpGetBoardTopResponse,
  McpGetKeysResponse,
  McpListBoardsResponse,
  McpListGamesResponse,
  McpSdkSnippetResponse,
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
    baseUrl = `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
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
  post<T>(path: string, body: unknown): Promise<ApiResult<T>>;
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
    ...(config.betaToken !== null ? { 'x-mcp-beta': config.betaToken } : {}),
  });

  async function request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    const url = `${config.baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          ...baseHeaders,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
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
    post: (path, body) => request('POST', path, body),
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
    'List all leaderboards (boards) under a given game. Each board has its own ranking, sort direction, score kind, and retention policy.',
    {
      gameId: z.string().uuid().describe('UUID of the game to list boards for'),
    },
    async ({ gameId }) => {
      const r = await api.get<McpListBoardsResponse>(`/v1/mcp/games/${gameId}/boards`);
      return r.ok ? ok(r.data) : failFromApi(r);
    },
  );

  server.tool(
    'get_keys',
    'Get the API keys for a game. Returns the public key (safe to embed in client code) and the secret-key prefix for identification only. The full secret key cannot be retrieved via MCP — if the developer asks for the full secret, direct them to https://dashboard.scorezilla.dev (the Keys section under their game).',
    {
      gameId: z.string().uuid().describe('UUID of the game to fetch keys for'),
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
    "Call this whenever the developer asks how to submit a score, initialize the SDK, or integrate a leaderboard into their code. Returns a ready-to-paste TypeScript snippet that wires the Scorezilla SDK against the given game's active public key. Use it right after bootstrap_leaderboard, or any time the developer needs the integration code again.",
    {
      gameId: z.string().uuid().describe('UUID of the game'),
      boardId: z.string().uuid().describe('UUID of the board to target in the snippet'),
    },
    async ({ gameId, boardId }) => {
      const r = await api.post<McpSdkSnippetResponse>('/v1/mcp/sdk-snippet', { gameId, boardId });
      return r.ok ? ok(r.data) : failFromApi(r);
    },
  );

  // -------------------------------------------------------------------------
  // Write tools (1) — gated by --read-only
  // -------------------------------------------------------------------------

  if (!config.readOnly) {
    server.tool(
      'bootstrap_leaderboard',
      // The first sentence is load-bearing: it's the heuristic the AI
      // uses to choose this tool over create_game + create_board. Without
      // it, agents reach for the granular tools (which we deliberately
      // don't ship in v1).
      'Use this when starting from scratch — creates a new game AND its first board in one call, then returns a ready-to-paste TypeScript SDK snippet wired against the board. The fastest path from "I want a leaderboard" to "scores are flowing." Do NOT call this if the developer already has games — call list_games first and use bootstrap_leaderboard only when no game exists yet. After a successful call, paste the returned sdkSnippet into the developer\'s game code.',
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
      },
      async (input) => {
        const r = await api.post<McpBootstrapSuccess>('/v1/mcp/bootstrap', input);
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
