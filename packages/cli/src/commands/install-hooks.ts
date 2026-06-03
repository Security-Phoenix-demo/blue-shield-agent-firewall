import { Command } from 'commander';
import { writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';

// Canonical evaluation library, copied into the package at build time
// (see packages/cli build script: it copies hooks/lib/phoenix-firewall.sh here).
// Single source of truth — the installed hook runs the SAME logic as the
// standalone hooks/*.sh in the repo, so there is no weaker divergent copy.
// __dirname is a CommonJS global (this package compiles to CommonJS); at
// runtime it is dist/commands, so ../../templates resolves to the package root.
const LIB_TEMPLATE = join(__dirname, '..', '..', 'templates', 'phoenix-firewall.sh');

interface AgentSpec {
  /** hook script location, relative to $HOME */
  hookRel: string;
  /** how the agent passes the command into the hook */
  invocation: string;
}

const AGENTS: Record<string, AgentSpec> = {
  'claude-code': { hookRel: '.claude/hooks/pre-tool-use.sh', invocation: 'phoenix_fw_evaluate "${TOOL_INPUT:-}"' },
  'codex': { hookRel: '.codex/hooks/pre-tool-use.sh', invocation: 'phoenix_fw_evaluate "${TOOL_INPUT:-}"' },
  'windsurf': { hookRel: '.windsurf/hooks/pre-run-command.sh', invocation: 'phoenix_fw_evaluate "${1:-${PRE_RUN_COMMAND:-}}"' },
};

function thinHook(libAbsPath: string, invocation: string): string {
  // The hook sources the co-located library by ABSOLUTE path (no relative-path
  // surprises) and fails CLOSED if the library is missing.
  return `#!/usr/bin/env bash
set -euo pipefail
# Phoenix Security Blue Shield - Firewall — PreToolUse hook
# Auto-installed by @phoenix-security/cli. Edits will be overwritten on reinstall.
PHOENIX_FW_LIB="${libAbsPath}"
if [ ! -r "$PHOENIX_FW_LIB" ]; then
  >&2 echo "[phoenix-firewall] FATAL: evaluation library not found at $PHOENIX_FW_LIB"
  exit 2
fi
# shellcheck source=/dev/null
. "$PHOENIX_FW_LIB"
${invocation}
exit $?
`;
}

export function installHooksCommand(): Command {
  return new Command('install-hooks')
    .description('Install PreToolUse hook for a coding agent')
    .argument('<agent>', `Agent name: ${Object.keys(AGENTS).join(', ')}`)
    .action((agent: string) => {
      const spec = AGENTS[agent];
      if (!spec) {
        console.error(`Unknown agent: ${agent}. Supported: ${Object.keys(AGENTS).join(', ')}`);
        console.error('For Cursor: add rules from cursorrules-snippet.md');
        console.error('For Cline: configure the MCP server (no hook needed)');
        process.exit(1);
      }
      if (!existsSync(LIB_TEMPLATE)) {
        console.error(`[phoenix-firewall] Internal error: bundled library missing at ${LIB_TEMPLATE}`);
        console.error('  Reinstall @phoenix-security/cli, or build from source with "npm run build".');
        process.exit(1);
      }

      const home = process.env.HOME || '';
      if (!home) {
        console.error('[phoenix-firewall] HOME is not set — cannot determine install location');
        process.exit(1);
      }
      const hookPath = join(home, spec.hookRel);
      const hookDir = dirname(hookPath);
      if (!existsSync(hookDir)) mkdirSync(hookDir, { recursive: true });

      // 1. Deploy the canonical library next to the hook.
      const libPath = join(hookDir, 'phoenix-firewall.sh');
      copyFileSync(LIB_TEMPLATE, libPath);

      // 2. Write a thin hook that sources it by absolute path.
      writeFileSync(hookPath, thinHook(libPath, spec.invocation), { mode: 0o755 });

      console.log(`[phoenix-firewall] Library installed: ${libPath}`);
      console.log(`[phoenix-firewall] Hook installed:    ${hookPath}`);
      if (agent === 'codex') {
        console.log(`  Add to ~/.codex/hooks.json with an ABSOLUTE handler path: ${hookPath}`);
      }
      console.log('  Set PHOENIX_API_KEY to activate. Fail mode is CLOSED by default');
      console.log('  (override deliberately with PHOENIX_FAIL_OPEN=true).');
      console.log('  Verify with: npx @phoenix-security/cli doctor');
    });
}
