#!/usr/bin/env node
/**
 * @phoenix-security/mcp-firewall — MCP server for Phoenix Security Blue Shield - Firewall
 * Provides 7 phoenix_* tools for AI coding agents.
 *
 * Usage:
 *   npx @phoenix-security/mcp-firewall              # stdio (default)
 *   npx @phoenix-security/mcp-firewall --http 3100   # Streamable HTTP
 *
 * Env: PHOENIX_API_KEY (required), PHOENIX_API_URL (default: https://api.phxintel.security)
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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
const DEFAULT_API_URL = 'https://api.phxintel.security';
const ALLOWED_HOSTS = new Set([
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
const server = new Server({ name: 'phoenix-firewall', version: '0.1.0' }, { capabilities: { tools: {} } });

registerTools(server, client, cache);

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--http')) {
    const portIdx = args.indexOf('--http');
    const port = parseInt(args[portIdx + 1] || '3100', 10);
    // Streamable HTTP transport — requires @modelcontextprotocol/sdk HTTP support
    console.error(`[phoenix-firewall] Streamable HTTP on port ${port} (not yet implemented — use stdio)`);
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => { console.error('[phoenix-firewall] Fatal:', err); process.exit(1); });
