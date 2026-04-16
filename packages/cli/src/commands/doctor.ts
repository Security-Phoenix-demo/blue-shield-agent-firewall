import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';

export function doctorCommand(): Command {
  return new Command('doctor')
    .description('Check Phoenix Firewall configuration and connectivity')
    .action(async () => {
      const apiUrl = process.env.PHOENIX_API_URL || 'https://api.phxintel.security';
      const apiKey = process.env.PHOENIX_API_KEY;
      let allOk = true;

      console.log('[phoenix-firewall] Running diagnostics...\n');

      // Check 1: API key
      if (apiKey) {
        console.log('  [pass] PHOENIX_API_KEY is set');
      } else {
        console.log('  [FAIL] PHOENIX_API_KEY is not set');
        allOk = false;
      }

      // Check 2: Config file
      const configPath = join(process.cwd(), '.phoenix-firewall.yaml');
      if (existsSync(configPath)) {
        console.log('  [pass] .phoenix-firewall.yaml found');
      } else {
        console.log('  [warn] .phoenix-firewall.yaml not found — run "phoenix-firewall init"');
      }

      // Check 3: MCP config
      const mcpPath = join(process.cwd(), '.mcp.json');
      if (existsSync(mcpPath)) {
        console.log('  [pass] .mcp.json found (Claude Code MCP config)');
      } else {
        console.log('  [info] .mcp.json not found — MCP not configured for this project');
      }

      // Check 4: API connectivity
      if (apiKey) {
        try {
          const resp = await fetch(`${apiUrl}/api/v1/firewall/rules`, {
            headers: { 'x-api-key': apiKey },
            signal: AbortSignal.timeout(5_000),
          });
          if (resp.ok) {
            console.log(`  [pass] API reachable at ${apiUrl}`);
          } else {
            console.log(`  [FAIL] API returned ${resp.status} at ${apiUrl}`);
            allOk = false;
          }
        } catch {
          console.log(`  [FAIL] Cannot reach ${apiUrl}`);
          allOk = false;
        }
      }

      console.log(allOk ? '\n  All checks passed!' : '\n  Some checks failed — see above.');
      process.exit(allOk ? 0 : 1);
    });
}
