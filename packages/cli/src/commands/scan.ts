import { Command } from 'commander';
import { readFileSync } from 'fs';

export function scanCommand(): Command {
  return new Command('scan')
    .description('Scan a lockfile for supply chain risks')
    .argument('<lockfile>', 'Path to lockfile (package-lock.json, requirements.txt, etc.)')
    .action(async (lockfile: string) => {
      const apiUrl = process.env.PHOENIX_API_URL || 'https://api.phxintel.security';
      const apiKey = process.env.PHOENIX_API_KEY;
      if (!apiKey) { console.error('[phoenix-firewall] PHOENIX_API_KEY not set'); process.exit(1); }

      const content = readFileSync(lockfile);
      const ecosystem = lockfile.includes('package-lock') ? 'npm' : lockfile.includes('requirements') ? 'pypi' : 'unknown';

      console.log(`[phoenix-firewall] Scanning ${lockfile} (${ecosystem})...`);

      const body = {
        source: 'custom',
        event_type: 'manual',
        repository: process.cwd(),
        lockfiles: [{ path: lockfile, ecosystem, content_base64: content.toString('base64') }],
      };

      try {
        const resp = await fetch(`${apiUrl}/api/v1/firewall/webhook/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        });
        if (!resp.ok) { console.error(`API error: ${resp.status}`); process.exit(1); }
        const result = await resp.json() as { summary?: { total_packages: number; blocked: number; warned: number; clean: number }; blocked_packages?: Array<{ package: string; reason: string }>; exit_code?: number };

        console.log(`\n  Total: ${result.summary?.total_packages || 0}`);
        console.log(`  Blocked: ${result.summary?.blocked || 0}`);
        console.log(`  Warned: ${result.summary?.warned || 0}`);
        console.log(`  Clean: ${result.summary?.clean || 0}`);

        if (result.blocked_packages?.length) {
          console.log('\n  Blocked packages:');
          for (const pkg of result.blocked_packages) {
            console.log(`    - ${pkg.package}: ${pkg.reason}`);
          }
        }

        process.exit(result.exit_code || 0);
      } catch (err) {
        console.error(`[phoenix-firewall] Scan failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
