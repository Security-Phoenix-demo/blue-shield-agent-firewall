#!/usr/bin/env node
/**
 * @phoenix-security/mcp-firewall — MCP server for Phoenix Supply Chain Firewall
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

const API_URL = process.env.PHOENIX_API_URL || 'https://api.phxintel.security';
const API_KEY = process.env.PHOENIX_API_KEY || '';

if (!API_KEY) {
  console.error('[phoenix-firewall] PHOENIX_API_KEY not set. Set it in your environment.');
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
