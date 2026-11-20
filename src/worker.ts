// Cloudflare Worker entry: stateless Streamable HTTP at /mcp, heartbeat at /health.
// Each request gets a fresh server and transport (no sessions, no storage).
// MCP sampling needs a held-open stream, so use_client_model is a stdio feature;
// over HTTP it falls back to returning judge prompts.

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { SNAPSHOT_DATE } from './data/snapshot.ts';
import { currentIndex } from './siteindex.ts';
import { PROFILE, VERSION } from './content.ts';
import { buildServer } from './server.ts';

// Open CORS on purpose: public, read-only, no cookies or credentials.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, mcp-session-id, mcp-protocol-version, last-event-id',
  'access-control-expose-headers': 'mcp-session-id',
  'x-content-type-options': 'nosniff',
};

function withCors(res: Response): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

// Request limits for the public endpoint. One JSON-RPC message per POST is the
// normal case; a small batch is allowed, a large one is refused.
// The tool schemas allow about 400 KB (30,000-char answer + 30 x 12,000-char sources).
export const MAX_BODY_BYTES = 512 * 1024;
export const MAX_BATCH = 4;

function rpcError(status: number, code: number, message: string, id: unknown = null): Response {
  return withCors(Response.json({ jsonrpc: '2.0', id, error: { code, message } }, { status }));
}

function log(level: 'warn' | 'error', event: string, data: Record<string, unknown> = {}): void {
  console[level](JSON.stringify({ event, ...data }));
}

// Health: ok only when the site was read live and the index looks whole.
export function healthOf(meta: { source: string; entries: number; curated_dropped: string[] }, listings: Array<{ kind: string }>): string[] {
  const problems: string[] = [];
  if (meta.source !== 'live') problems.push(`site not read live (${meta.source})`);
  if (meta.entries < 60) problems.push(`only ${meta.entries} index entries (expected 60 or more)`);
  for (const kind of ['case-study', 'writing', 'note']) if (!listings.some((l) => l.kind === kind)) problems.push(`no ${kind} entries parsed from llms.txt`);
  if (meta.curated_dropped.length > 5) problems.push(`${meta.curated_dropped.length} curated claims no longer on the site`);
  return problems;
}

export interface Env {
  OPENAI_APPS_CHALLENGE?: string;
}

export async function handle(req: Request, env: Env = {}): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  // OpenAI app directory domain verification: the portal's token as plain text.
  if (url.pathname === '/.well-known/openai-apps-challenge') {
    const token = env.OPENAI_APPS_CHALLENGE?.trim();
    return token ? new Response(token, { headers: { 'content-type': 'text/plain' } }) : new Response('Not found\n', { status: 404 });
  }

  if (url.pathname === '/health') {
    // Heartbeat: 503 with reasons when the site was not read live or the index looks broken
    // (an llms.txt format change would show up here before anyone notices bad answers).
    const ix = await currentIndex();
    const problems = healthOf(ix.meta, ix.listings);
    if (problems.length) log('warn', 'health_degraded', { problems });
    return withCors(
      Response.json({
        ok: problems.length === 0,
        problems,
        name: 'zoebnomi',
        version: VERSION,
        snapshot_date: SNAPSHOT_DATE,
        site: { source: ix.meta.source, fetched_at: ix.meta.fetched_at, entries: ix.meta.entries, curated_dropped: ix.meta.curated_dropped },
        tools: ['check_citations', 'verify_claim', 'fit_to_role'],
      }, { status: problems.length ? 503 : 200 }),
    );
  }

  if (url.pathname === '/mcp') {
    let forward = req;
    if (req.method === 'POST') {
      const declared = Number(req.headers.get('content-length') ?? 0);
      if (declared > MAX_BODY_BYTES) return rpcError(413, -32600, `Request body over ${MAX_BODY_BYTES} bytes.`);
      const body = await req.text();
      if (body.length > MAX_BODY_BYTES) return rpcError(413, -32600, `Request body over ${MAX_BODY_BYTES} bytes.`);
      try {
        const parsed = JSON.parse(body) as unknown;
        if (Array.isArray(parsed) && parsed.length > MAX_BATCH) return rpcError(400, -32600, `Batches of more than ${MAX_BATCH} messages are not accepted.`);
      } catch {
        // Not JSON: let the transport return its own parse error.
      }
      forward = new Request(req.url, { method: 'POST', headers: req.headers, body });
    }
    const server = buildServer();
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      return withCors(await transport.handleRequest(forward));
    } catch (e) {
      log('error', 'mcp_unhandled', { message: (e as Error)?.message });
      return rpcError(500, -32603, 'Internal error. Try again; if it persists, see https://mcp.zoebnomi.com/health.');
    } finally {
      // JSON mode has resolved the response by now; release the per-request server.
      void server.close();
    }
  }

  if (url.pathname === '/') {
    return withCors(
      new Response(
        `${PROFILE.name}: MCP server v${VERSION}\n\nMCP endpoint (Streamable HTTP): ${url.origin}/mcp\nHealth: ${url.origin}/health\nSource and install: https://github.com/zoeb-nomi/zoebnomi-mcp\nSite: ${PROFILE.links.site}\n`,
        { headers: { 'content-type': 'text/plain; charset=utf-8' } },
      ),
    );
  }

  return withCors(new Response('Not found\n', { status: 404 }));
}

export default { fetch: (req: Request, env: Env) => handle(req, env) };
