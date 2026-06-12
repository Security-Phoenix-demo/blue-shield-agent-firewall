#!/usr/bin/env node
/**
 * @phoenix-security/mcp-firewall — MCP server for Phoenix Security Blue Shield - Firewall
 * Provides 7 phoenix_* tools for AI coding agents.
 *
 * Usage:
 *   npx @phoenix-security/mcp-firewall              # stdio (default)
 *   npx @phoenix-security/mcp-firewall --http 3100   # Streamable HTTP
 *
 * Env: PHOENIX_API_KEY (required), PHOENIX_API_URL (default: https://phxintel.security)
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { PhoenixApiClient } from './client/api.js';
import { LRUCache } from './cache/lru.js';
import { registerTools } from './tools/register.js';

const API_KEY = process.env.PHOENIX_API_KEY || '';

if (!API_KEY) {
  console.error('[phoenix-firewall] PHOENIX_API_KEY not set. Set it in your environment.');
  process.exit(1);
}

// Validate PHOENIX_API_URL before sending the key anywhere. It may come from
// project-level MCP config; an attacker-controlled host must not receive the key.
// Phoenix Security API is served from the apex host under /api/v1; the `api.`
// subdomain does not exist (NXDOMAIN). Apex hosts MUST be allowlisted/default.
const DEFAULT_API_URL = 'https://phxintel.security';
const ALLOWED_HOSTS = new Set([
  'phxintel.security',
  'phxintel.appsecphoenix.io',
  'cvedetails.io',
  // Reserved for a future dedicated API subdomain; harmless to keep allowlisted.
  'api.phxintel.security',
  'api.phxintel.appsecphoenix.io',
  'api.cvedetails.io',
  ...(process.env.PHOENIX_API_ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
]);

function resolveApiUrl(raw: string | undefined): string {
  const value = raw && raw.trim() ? raw.trim() : DEFAULT_API_URL;
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('PHOENIX_API_URL is not a valid URL'); }
  const host = parsed.hostname.toLowerCase();
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) {
    throw new Error(`PHOENIX_API_URL must use HTTPS (got ${parsed.protocol}//${host})`);
  }
  if (!local && !ALLOWED_HOSTS.has(host)) {
    throw new Error(`PHOENIX_API_URL host '${host}' is not allowlisted (set PHOENIX_API_ALLOWED_HOSTS to permit it)`);
  }
  parsed.username = ''; parsed.password = '';
  return parsed.toString().replace(/\/$/, '');
}

let API_URL: string;
try {
  API_URL = resolveApiUrl(process.env.PHOENIX_API_URL);
} catch (e) {
  console.error(`[phoenix-firewall] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}

const client = new PhoenixApiClient(API_URL, API_KEY);
const cache = new LRUCache<string, unknown>(5000, 300_000);

// Streamable HTTP requires one Server instance per session (a Server can only be
// connected to a single transport at a time), so build servers via a factory. The
// API client + LRU cache are shared across sessions — they are stateless and safe.
function buildServer(): Server {
  const s = new Server({ name: 'phoenix-firewall', version: '0.1.0' }, { capabilities: { tools: {} } });
  registerTools(s, client, cache);
  return s;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return undefined;
  return JSON.parse(raw);
}

function parseHttpArgs(args: string[]): { port: number; host: string } {
  const portIdx = args.indexOf('--http');
  // Accept "--http", "--http 3100", or "--http=3100".
  let port = 3100;
  const inline = args[portIdx]?.split('=')[1];
  const next = args[portIdx + 1];
  if (inline) port = parseInt(inline, 10);
  else if (next && /^\d+$/.test(next)) port = parseInt(next, 10);
  const hostIdx = args.indexOf('--host');
  const host = (hostIdx >= 0 ? args[hostIdx + 1] : process.env.PHOENIX_MCP_HOST) || '127.0.0.1';
  return { port: Number.isFinite(port) ? port : 3100, host };
}

async function startHttp(port: number, host: string) {
  // Stateful Streamable HTTP: one transport+server per MCP session, keyed by the
  // Mcp-Session-Id header. Bind to loopback by default — this endpoint forwards the
  // Phoenix API key, so it must not be exposed on a public interface without intent.
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (req.method === 'POST') {
        const body = await readBody(req);
        let transport: StreamableHTTPServerTransport | undefined =
          sessionId ? transports[sessionId] : undefined;

        if (!transport && isInitializeRequest(body)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            enableDnsRebindingProtection: true,
            allowedHosts: [`${host}:${port}`, `localhost:${port}`, `127.0.0.1:${port}`],
            onsessioninitialized: (sid: string) => { transports[sid] = transport!; },
          });
          transport.onclose = () => {
            if (transport!.sessionId) delete transports[transport!.sessionId];
          };
          await buildServer().connect(transport);
        }

        if (!transport) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'No valid session: send an initialize request first.' },
            id: null,
          }));
          return;
        }
        await transport.handleRequest(req, res, body);
        return;
      }

      // GET (server->client SSE stream) and DELETE (session termination) require an
      // existing session.
      if (req.method === 'GET' || req.method === 'DELETE') {
        const transport = sessionId ? transports[sessionId] : undefined;
        if (!transport) {
          res.writeHead(400).end('Missing or unknown Mcp-Session-Id');
          return;
        }
        await transport.handleRequest(req, res);
        return;
      }

      res.writeHead(405).end('Method Not Allowed');
    } catch (err) {
      console.error('[phoenix-firewall] HTTP request error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        }));
      }
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(port, host, resolve));
  console.error(`[phoenix-firewall] Streamable HTTP listening on http://${host}:${port}/`);
  console.error(`[phoenix-firewall] API target: ${API_URL}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--http')) {
    const { port, host } = parseHttpArgs(args);
    await startHttp(port, host);
    return; // keep process alive serving HTTP
  }
  const transport = new StdioServerTransport();
  await buildServer().connect(transport);
}

main().catch((err) => { console.error('[phoenix-firewall] Fatal:', err); process.exit(1); });
