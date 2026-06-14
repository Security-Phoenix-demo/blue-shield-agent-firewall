/** Register all 7 phoenix_* MCP tools */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { PhoenixApiClient } from '../client/api.js';
import { LRUCache } from '../cache/lru.js';

const MAX_PURL_LENGTH = 1000;
const MAX_DIFF_LENGTH = 1_000_000;
const MAX_LOCKFILE_PACKAGES = 5000;

function parsePurl(purl: string) {
  if (typeof purl !== 'string' || purl.length === 0 || purl.length > MAX_PURL_LENGTH) return null;
  const m = purl.match(/^pkg:([^/]+)\/(.+?)(?:@(.+))?$/);
  return m ? { ecosystem: m[1], name: m[2], version: m[3] } : null;
}

const TOOL_DEFS = [
  {
    name: 'phoenix_check_package',
    description: 'Check a package against Phoenix firewall rules before installation. Returns block/warn/allow verdict with intelligence context and remediation.',
    inputSchema: { type: 'object' as const, properties: { purl: { type: 'string', description: 'Package URL (e.g. pkg:npm/axios@6.0.20)' }, context: { type: 'string', description: 'Optional: why the package is being installed' } }, required: ['purl'] },
  },
  {
    name: 'phoenix_check_lockfile',
    description: 'Batch-evaluate all packages in a lockfile. Returns per-package verdicts and aggregate pass/fail.',
    inputSchema: { type: 'object' as const, properties: { packages: { type: 'array', items: { type: 'string' }, description: 'Array of purls' } }, required: ['packages'] },
  },
  {
    name: 'phoenix_check_diff',
    description: 'Evaluate only changed dependencies from a git diff.',
    inputSchema: { type: 'object' as const, properties: { diff: { type: 'string', description: 'Git diff content' } }, required: ['diff'] },
  },
  {
    name: 'phoenix_get_package_intel',
    description: 'Get full intelligence for a package: PS-OSS score, vulnerabilities, malware status, license.',
    inputSchema: { type: 'object' as const, properties: { ecosystem: { type: 'string' }, name: { type: 'string' } }, required: ['ecosystem', 'name'] },
  },
  {
    name: 'phoenix_get_alternatives',
    description: 'Get safe alternative packages when a package is blocked or risky.',
    inputSchema: { type: 'object' as const, properties: { ecosystem: { type: 'string' }, name: { type: 'string' } }, required: ['ecosystem', 'name'] },
  },
  {
    name: 'phoenix_get_vulnerability',
    description: 'Get vulnerability details for a CVE or package version.',
    inputSchema: { type: 'object' as const, properties: { cve_id: { type: 'string' }, purl: { type: 'string' } } },
  },
  {
    name: 'phoenix_firewall_rules',
    description: 'Get summary of your active firewall rules.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
];

export function registerTools(server: Server, client: PhoenixApiClient, cache: LRUCache<string, unknown>) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      switch (name) {
        case 'phoenix_check_package': {
          const purl = (args as { purl: string }).purl;
          const cacheKey = `check:${purl}`;
          const cached = cache.get(cacheKey);
          if (cached) return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
          const parsed = parsePurl(purl);
          if (!parsed) return { content: [{ type: 'text', text: 'Invalid purl format. Use pkg:<ecosystem>/<name>@<version>' }], isError: true };
          const result = await client.evaluateEnriched([{ ecosystem: parsed.ecosystem, name: parsed.name, version: parsed.version || 'latest' }]);
          await emitPackageActivity(client, parsed.ecosystem, parsed.name, parsed.version || 'latest', {
            source: 'mcp',
            tool: 'phoenix_check_package',
            purl,
          });
          cache.set(cacheKey, result);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'phoenix_check_lockfile': {
          const purls = (args as { packages: string[] }).packages;
          if (!Array.isArray(purls)) return { content: [{ type: 'text', text: 'packages must be an array of purls.' }], isError: true };
          const packages = purls.slice(0, MAX_LOCKFILE_PACKAGES).map(p => parsePurl(p)).filter(Boolean) as Array<{ ecosystem: string; name: string; version?: string }>;
          if (purls.length > MAX_LOCKFILE_PACKAGES) {
            console.error(`[phoenix-firewall] lockfile truncated to first ${MAX_LOCKFILE_PACKAGES} of ${purls.length} packages`);
          }
          const result = await client.evaluate(packages.map(p => ({ ...p, version: p.version || 'latest' })));
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'phoenix_check_diff': {
          const diff = (args as { diff: string }).diff;
          if (typeof diff !== 'string') return { content: [{ type: 'text', text: 'diff must be a string.' }], isError: true };
          if (diff.length > MAX_DIFF_LENGTH) return { content: [{ type: 'text', text: 'Diff too large to evaluate.' }], isError: true };
          const added = diff.match(/^\+\s*"([^"]+)":\s*"([^"]+)"/gm) || [];
          const packages = added.map(l => { const m = l.match(/"([^"]+)":\s*"([^"]+)"/); return m ? { ecosystem: 'npm', name: m[1], version: m[2] } : null; }).filter(Boolean) as Array<{ ecosystem: string; name: string; version: string }>;
          if (packages.length === 0) return { content: [{ type: 'text', text: 'No new dependencies detected in diff.' }] };
          const result = await client.evaluate(packages);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'phoenix_get_package_intel': {
          const { ecosystem, name: pkgName } = args as { ecosystem: string; name: string };
          const result = await client.getLibraryIntel(ecosystem, pkgName);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'phoenix_get_alternatives': {
          const { ecosystem, name: pkgName } = args as { ecosystem: string; name: string };
          const result = await client.getAlternatives(ecosystem, pkgName);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'phoenix_get_vulnerability': {
          const { cve_id, purl } = args as { cve_id?: string; purl?: string };
          const query = cve_id || purl || '';
          return { content: [{ type: 'text', text: JSON.stringify({ query, note: 'CVE detail lookup — wire to /api/v1/cves/{id} in production' }, null, 2) }] };
        }
        case 'phoenix_firewall_rules': {
          const result = await client.getRules();
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });
}

async function emitPackageActivity(
  client: PhoenixApiClient,
  ecosystem: string,
  name: string,
  version: string,
  metadata: Record<string, unknown>,
) {
  const deviceId = process.env.PHOENIX_DEVICE_ID || '';
  if (!deviceId) return;
  const teamIdHint = process.env.PHOENIX_TEAM_ID || '';
  try {
    await client.sendActivity({
      device_id: deviceId,
      event_type: 'package_install',
      collector_type: 'mcp',
      occurred_at: new Date().toISOString(),
      ecosystem,
      package_name: name,
      package_version: version,
      metadata: teamIdHint ? { ...metadata, team_id_hint: teamIdHint } : metadata,
    });
  } catch (err) {
    console.error(`[phoenix-firewall] activity emit failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
