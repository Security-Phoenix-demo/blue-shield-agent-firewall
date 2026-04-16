import { Command } from 'commander';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { stringify } from 'yaml';

const AGENTS = [
  { name: 'claude-code', dir: '.claude', configFile: '.mcp.json' },
  { name: 'cursor', dir: '.cursor', configFile: '.cursor/mcp.json' },
  { name: 'codex', dir: '.codex', configFile: '.codex/config.json' },
  { name: 'windsurf', dir: '.windsurf', configFile: '.windsurf/mcp.json' },
  { name: 'cline', dir: '.cline', configFile: '.cline/mcp.json' },
];

const DEFAULT_CONFIG = {
  version: '1.0',
  api_key_env: 'PHOENIX_API_KEY',
  settings: { fail_mode: 'open', strict_mode: false, cache_ttl_seconds: 300, ecosystems: ['npm', 'pypi'] },
  agents: {
    claude_code: { on_block: 'suggest_alternative', on_warn: 'show_context_and_ask', auto_upgrade: false },
    cursor: { on_block: 'abort', on_warn: 'show_context_and_ask' },
    ci: { on_block: 'fail_pipeline', on_warn: 'annotate_pr', strict_mode: true },
  },
};

const MCP_CONFIG = {
  mcpServers: {
    'phoenix-firewall': {
      command: 'npx',
      args: ['-y', '@phoenix-security/mcp-firewall'],
      env: { PHOENIX_API_KEY: '${PHOENIX_API_KEY}', PHOENIX_API_URL: 'https://api.phxintel.security' },
    },
  },
};

export function initCommand(): Command {
  return new Command('init')
    .description('Initialize Phoenix Firewall in your project')
    .action(() => {
      const cwd = process.cwd();
      console.log('[phoenix-firewall] Initializing...\n');

      // 1. Write .phoenix-firewall.yaml
      const yamlPath = join(cwd, '.phoenix-firewall.yaml');
      if (!existsSync(yamlPath)) {
        writeFileSync(yamlPath, '# Phoenix Supply Chain Firewall config\n# Docs: https://github.com/Security-Phoenix-demo/firewall-agents\n\n' + stringify(DEFAULT_CONFIG));
        console.log('  Created .phoenix-firewall.yaml');
      } else {
        console.log('  .phoenix-firewall.yaml already exists — skipped');
      }

      // 2. Detect installed agents
      const home = process.env.HOME || '';
      const detected: string[] = [];
      for (const agent of AGENTS) {
        if (existsSync(join(home, agent.dir)) || existsSync(join(cwd, agent.dir))) {
          detected.push(agent.name);
        }
      }
      console.log(`\n  Detected agents: ${detected.length > 0 ? detected.join(', ') : 'none'}`);

      // 3. Write MCP config for Claude Code if detected
      if (detected.includes('claude-code')) {
        const mcpPath = join(cwd, '.mcp.json');
        if (!existsSync(mcpPath)) {
          writeFileSync(mcpPath, JSON.stringify(MCP_CONFIG, null, 2) + '\n');
          console.log('  Created .mcp.json (Claude Code MCP config)');
        }
      }

      console.log('\n  Next steps:');
      console.log('    1. Set PHOENIX_API_KEY in your environment');
      console.log('    2. Run: npx @phoenix-security/cli install-hooks claude-code');
      console.log('    3. Start coding — the firewall is active!\n');
    });
}
