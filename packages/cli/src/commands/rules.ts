import { Command } from 'commander';

/**
 * `phoenix-firewall rules list` — fetch firewall rules attached to the
 * authenticated user's account via GET /api/v1/firewall/rules.
 *
 * Accepts a phx_fw_* Malware Firewall key, a phx_whk_* Webhook key, or any
 * other valid Phoenix API key with rule-read access. Reads PHOENIX_API_KEY
 * from the environment, same as `scan` / `doctor` / `install-hooks`.
 */
export function rulesCommand(): Command {
  const rules = new Command('rules').description('Retrieve firewall rules from your Phoenix account');

  rules
    .command('list')
    .description('List firewall rules for the authenticated user')
    .option('--limit <n>', 'Maximum rules to return (1-500)', '100')
    .option('--offset <n>', 'Pagination offset', '0')
    .option('--json', 'Emit raw JSON instead of a table')
    .action(async (opts: { limit: string; offset: string; json?: boolean }) => {
      const apiUrl = process.env.PHOENIX_API_URL || 'https://api.phxintel.security';
      const apiKey = process.env.PHOENIX_API_KEY;
      if (!apiKey) {
        console.error('[phoenix-firewall] PHOENIX_API_KEY not set');
        process.exit(1);
      }

      const url = `${apiUrl}/api/v1/firewall/rules?limit=${encodeURIComponent(opts.limit)}&offset=${encodeURIComponent(opts.offset)}`;
      try {
        const resp = await fetch(url, {
          method: 'GET',
          headers: { 'x-api-key': apiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(30_000),
        });
        const text = await resp.text();
        if (!resp.ok) {
          console.error(`[phoenix-firewall] API error ${resp.status}: ${text}`);
          process.exit(1);
        }
        if (opts.json) {
          console.log(text);
          return;
        }
        const parsed = JSON.parse(text) as {
          items?: Array<{ rule_id: string; name: string; action: string; enabled: boolean; priority: number }>;
          total?: number;
        };
        const items = parsed.items || [];
        console.log(`\nPhoenix Security Blue Shield - Firewall rules — ${parsed.total ?? items.length} total\n`);
        console.log('RULE_ID                               NAME                            ACTION           ENABLED   PRIORITY');
        for (const r of items) {
          const name = (r.name || '').length > 30 ? (r.name || '').slice(0, 27) + '...' : (r.name || '');
          console.log(
            `${r.rule_id.padEnd(38)}${name.padEnd(32)}${r.action.padEnd(17)}${String(r.enabled).padEnd(10)}${r.priority}`,
          );
        }
      } catch (err) {
        console.error(`[phoenix-firewall] rules list failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  return rules;
}
