import { Command } from 'commander';
import { buildAgentHubInventoryPayload } from '../inventory.js';
import { resolveApiUrl } from '../util/api-url.js';

export function inventoryCommand(): Command {
  return new Command('inventory')
    .description('Collect and upload Phoenix hook/MCP/skill/tooling inventory')
    .option('--device-id <uuid>', 'Endpoint device UUID (or PHOENIX_DEVICE_ID)')
    .option('--team-id <id>', 'Optional team hint stored as collector metadata only')
    .option('--project-id <id>', 'Optional project/repository hint stored as collector metadata only')
    .option('--dry-run', 'Print payload instead of uploading')
    .action(async (opts: { deviceId?: string; teamId?: string; projectId?: string; dryRun?: boolean }) => {
      const deviceId = opts.deviceId || process.env.PHOENIX_DEVICE_ID || '';
      if (!deviceId) {
        console.error('[phoenix-firewall] --device-id or PHOENIX_DEVICE_ID is required');
        process.exit(1);
      }

      const payload = buildAgentHubInventoryPayload({
        deviceId,
        teamIdHint: opts.teamId || process.env.PHOENIX_TEAM_ID,
        projectIdHint: opts.projectId || process.env.PHOENIX_PROJECT_ID,
      });

      if (opts.dryRun) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      const apiKey = process.env.PHOENIX_API_KEY || '';
      if (!apiKey) {
        console.error('[phoenix-firewall] PHOENIX_API_KEY is required to upload inventory');
        process.exit(1);
      }

      let apiUrl: string;
      try {
        apiUrl = resolveApiUrl(process.env.PHOENIX_API_URL);
      } catch (e) {
        console.error(`[phoenix-firewall] ${e instanceof Error ? e.message : e}`);
        process.exit(1);
      }

      const resp = await fetch(`${apiUrl}/api/v1/firewall/agent/inventory/combined`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) {
        console.error(`[phoenix-firewall] inventory upload failed: HTTP ${resp.status} ${await resp.text()}`);
        process.exit(1);
      }
      console.log(`[phoenix-firewall] uploaded inventory: ${payload.skills.length} skills/tools, ${payload.software.length} software items`);
    });
}
