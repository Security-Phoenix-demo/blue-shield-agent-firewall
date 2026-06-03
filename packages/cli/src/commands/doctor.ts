import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { resolveApiUrl } from '../util/api-url.js';

const INSTALLED_HOOKS: Array<{ agent: string; rel: string }> = [
  { agent: 'claude-code', rel: '.claude/hooks/pre-tool-use.sh' },
  { agent: 'codex', rel: '.codex/hooks/pre-tool-use.sh' },
  { agent: 'windsurf', rel: '.windsurf/hooks/pre-run-command.sh' },
];

export function doctorCommand(): Command {
  return new Command('doctor')
    .description('Check Phoenix Security Blue Shield - Firewall configuration and connectivity')
    .action(async () => {
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

      // Check 2: API URL is valid and allowlisted
      let apiUrl = '';
      try {
        apiUrl = resolveApiUrl(process.env.PHOENIX_API_URL);
        console.log(`  [pass] PHOENIX_API_URL valid: ${apiUrl}`);
      } catch (e) {
        console.log(`  [FAIL] ${e instanceof Error ? e.message : e}`);
        allOk = false;
      }

      // Check 3: Fail mode (a firewall that fails open provides false assurance)
      const failOpen = /^(true|1|yes|on)$/i.test(process.env.PHOENIX_FAIL_OPEN || '');
      const strict = /^(true|1|yes|on)$/i.test(process.env.PHOENIX_STRICT || '');
      if (failOpen && !strict) {
        console.log('  [warn] PHOENIX_FAIL_OPEN is set — installs are ALLOWED when the API cannot verify them');
      } else {
        console.log('  [pass] Fail mode is CLOSED (installs blocked when the firewall cannot verify)');
      }

      // Check 4: Config file
      const configPath = join(process.cwd(), '.phoenix-firewall.yaml');
      if (existsSync(configPath)) {
        console.log('  [pass] .phoenix-firewall.yaml found');
      } else {
        console.log('  [warn] .phoenix-firewall.yaml not found — run "phoenix-firewall init"');
      }

      // Check 5: Installed hooks + co-located library (catches the silent-no-op class)
      const home = process.env.HOME || '';
      const installed = INSTALLED_HOOKS.filter((h) => home && existsSync(join(home, h.rel)));
      if (installed.length === 0) {
        console.log('  [info] No agent hooks installed — run "phoenix-firewall install-hooks <agent>"');
      }
      for (const h of installed) {
        const hookPath = join(home, h.rel);
        const libPath = join(home, h.rel, '..', 'phoenix-firewall.sh');
        const hookSrc = (() => { try { return readFileSync(hookPath, 'utf8'); } catch { return ''; } })();
        if (existsSync(libPath) && hookSrc.includes('phoenix_fw_evaluate')) {
          console.log(`  [pass] ${h.agent} hook installed and wired to the library`);
        } else {
          console.log(`  [FAIL] ${h.agent} hook present but its library is missing/unwired — it would NOT enforce. Reinstall.`);
          allOk = false;
        }
      }

      // Check 6: MCP config
      const mcpPath = join(process.cwd(), '.mcp.json');
      if (existsSync(mcpPath)) {
        console.log('  [pass] .mcp.json found (Claude Code MCP config)');
      } else {
        console.log('  [info] .mcp.json not found — MCP not configured for this project');
      }

      // Check 7: API connectivity
      if (apiKey && apiUrl) {
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
