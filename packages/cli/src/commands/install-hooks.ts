import { Command } from 'commander';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

const HOOK_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail
# Phoenix Supply Chain Firewall — PreToolUse hook
# Auto-installed by @phoenix-security/cli

PHOENIX_API_URL="\${PHOENIX_API_URL:-https://api.phxintel.security}"
COMMAND="\$1"

# Only check install commands
if ! echo "\$COMMAND" | grep -qE '(npm install|pip install|yarn add|pnpm add|cargo add|gem install|poetry add|uv pip install)'; then
  exit 0
fi

# Extract package names (simplified)
PKGS=$(echo "\$COMMAND" | grep -oE '[a-zA-Z0-9@/_.-]+' | tail -n +3)

if [ -z "\${PHOENIX_API_KEY:-}" ]; then
  >&2 echo "[phoenix-firewall] PHOENIX_API_KEY not set — skipping"
  exit 0
fi

for PKG in \$PKGS; do
  RESULT=$(curl -sf -X POST "\${PHOENIX_API_URL}/api/v1/firewall/evaluate" \\
    -H "Content-Type: application/json" \\
    -H "x-api-key: \${PHOENIX_API_KEY}" \\
    -d "{\\"packages\\":[{\\"ecosystem\\":\\"npm\\",\\"name\\":\\"\${PKG}\\",\\"version\\":\\"latest\\"}]}" 2>/dev/null) || {
    [ "\${PHOENIX_STRICT:-false}" = "true" ] && exit 2 || exit 0
  }
  ACTION=$(echo "\$RESULT" | grep -o '"action":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ "\$ACTION" = "block" ]; then
    REASON=$(echo "\$RESULT" | grep -o '"for_llm_reasoning":"[^"]*"' | head -1 | cut -d'"' -f4)
    >&2 echo "[phoenix-firewall] BLOCKED: \$PKG — \${REASON:-malicious or policy violation}"
    exit 2
  fi
done
exit 0
`;

const AGENT_PATHS: Record<string, string> = {
  'claude-code': '.claude/hooks/pre-tool-use.sh',
  'codex': '.codex/hooks/pre-tool-use.sh',
  'windsurf': '.windsurf/hooks/pre-run-command.sh',
};

export function installHooksCommand(): Command {
  return new Command('install-hooks')
    .description('Install PreToolUse hook for a coding agent')
    .argument('<agent>', 'Agent name: claude-code, codex, windsurf')
    .action((agent: string) => {
      const home = process.env.HOME || '';
      const hookRel = AGENT_PATHS[agent];
      if (!hookRel) {
        console.error(`Unknown agent: ${agent}. Supported: ${Object.keys(AGENT_PATHS).join(', ')}`);
        console.error('For Cursor: add rules from cursorrules-snippet.md');
        console.error('For Cline: configure MCP server (no hook needed)');
        process.exit(1);
      }
      const hookPath = join(home, hookRel);
      const hookDir = dirname(hookPath);
      if (!existsSync(hookDir)) mkdirSync(hookDir, { recursive: true });
      writeFileSync(hookPath, HOOK_SCRIPT, { mode: 0o755 });
      console.log(`[phoenix-firewall] Hook installed: ${hookPath}`);
      console.log('  Ensure PHOENIX_API_KEY is set in your environment.');
    });
}
