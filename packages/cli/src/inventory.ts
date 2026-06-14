import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { collectEndpointIdentity, endpointMetadata, type EndpointIdentity } from './endpoint-identity.js';

interface InventoryOptions {
  deviceId: string;
  homeDir?: string;
  projectDir?: string;
  teamIdHint?: string;
  projectIdHint?: string;
  endpointIdentity?: EndpointIdentity;
  now?: string;
}

interface InventoryMetadata {
  team_id_hint?: string;
  project_id_hint?: string;
  path?: string;
  configured?: boolean;
  [key: string]: string | string[] | boolean | undefined;
}

interface SkillInventoryItem {
  target_kind: 'agent_skill' | 'hook' | 'mcp_server' | 'extension' | 'agent';
  platform?: string;
  name: string;
  version?: string;
  install_source?: string;
  metadata?: InventoryMetadata;
}

interface SoftwareInventoryItem {
  software_kind: 'ide' | 'coding_agent' | 'package_manager' | 'phoenix_component' | 'other';
  name: string;
  version?: string;
  path?: string;
  install_source?: string;
  metadata?: InventoryMetadata;
}

export interface AgentHubInventoryPayload {
  device_id: string;
  collector_type: 'hook';
  collected_at: string;
  skills: SkillInventoryItem[];
  software: SoftwareInventoryItem[];
}

const HOOKS = [
  { platform: 'claude-code', path: '.claude/hooks/pre-tool-use.sh' },
  { platform: 'codex', path: '.codex/hooks/pre-tool-use.sh' },
  { platform: 'windsurf', path: '.windsurf/hooks/pre-run-command.sh' },
];

const AGENT_DIRS = [
  { name: 'claude-code', path: '.claude' },
  { name: 'codex', path: '.codex' },
  { name: 'cursor', path: '.cursor' },
  { name: 'windsurf', path: '.windsurf' },
  { name: 'cline', path: '.cline' },
];

export function buildAgentHubInventoryPayload(options: InventoryOptions): AgentHubInventoryPayload {
  const homeDir = options.homeDir || process.env.HOME || '';
  const projectDir = options.projectDir || process.cwd();
  const metadata = hintMetadata(options);
  const skills: SkillInventoryItem[] = [];
  const software: SoftwareInventoryItem[] = [
    {
      software_kind: 'phoenix_component',
      name: 'phoenix-firewall-agents-hub',
      version: '0.1.0',
      install_source: 'npm',
      metadata,
    },
  ];

  for (const hook of HOOKS) {
    const hookPath = join(homeDir, hook.path);
    if (!existsSync(hookPath)) continue;
    skills.push({
      target_kind: 'hook',
      platform: hook.platform,
      name: 'phoenix-firewall',
      install_source: 'install-hooks',
      metadata: { ...metadata, path: hookPath },
    });
  }

  for (const agent of AGENT_DIRS) {
    if (existsSync(join(homeDir, agent.path)) || existsSync(join(projectDir, agent.path))) {
      software.push({
        software_kind: 'coding_agent',
        name: agent.name,
        install_source: 'filesystem',
        metadata,
      });
    }
  }

  for (const serverName of discoverPhoenixMcpServers(projectDir)) {
    skills.push({
      target_kind: 'mcp_server',
      platform: 'mcp',
      name: serverName,
      install_source: '.mcp.json',
      metadata: { ...metadata, configured: true },
    });
  }

  for (const skill of discoverLocalSkills(projectDir)) {
    skills.push({
      target_kind: 'agent_skill',
      platform: skill.platform,
      name: skill.name,
      install_source: skill.source,
      metadata,
    });
  }

  return {
    device_id: options.deviceId,
    collector_type: 'hook',
    collected_at: options.now || new Date().toISOString(),
    skills,
    software,
  };
}

function hintMetadata(options: InventoryOptions): InventoryMetadata | undefined {
  const identity = options.endpointIdentity || collectEndpointIdentity();
  const metadata: InventoryMetadata = {
    ...endpointMetadata(identity, 'hook'),
  };
  if (options.teamIdHint) metadata.team_id_hint = options.teamIdHint;
  if (options.projectIdHint) metadata.project_id_hint = options.projectIdHint;
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function discoverPhoenixMcpServers(projectDir: string): string[] {
  const paths = [join(projectDir, '.mcp.json'), join(projectDir, '.cursor', 'mcp.json')];
  const names = new Set<string>();
  for (const path of paths) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as { mcpServers?: Record<string, unknown> };
      for (const name of Object.keys(parsed.mcpServers || {})) {
        if (name.includes('phoenix') || name.includes('firewall')) names.add(name);
      }
    } catch {
      // Inventory collection must not break local enforcement because of a bad config file.
    }
  }
  return [...names].sort();
}

function discoverLocalSkills(projectDir: string): Array<{ platform: string; name: string; source: string }> {
  const roots = [
    { platform: 'codex', path: join(projectDir, '.codex', 'skills') },
    { platform: 'claude-code', path: join(projectDir, '.claude', 'skills') },
    { platform: 'phoenix', path: join(projectDir, 'skills') },
  ];
  const results: Array<{ platform: string; name: string; source: string }> = [];
  for (const root of roots) {
    if (!existsSync(root.path)) continue;
    for (const entry of readdirSync(root.path, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillPath = join(root.path, entry.name, 'SKILL.md');
      if (!existsSync(skillPath)) continue;
      results.push({ platform: root.platform, name: entry.name, source: skillPath });
    }
  }
  return results.sort((a, b) => `${a.platform}:${a.name}`.localeCompare(`${b.platform}:${b.name}`));
}
