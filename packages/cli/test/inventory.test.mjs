import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildAgentHubInventoryPayload } from '../dist/inventory.js';

test('buildAgentHubInventoryPayload reports hooks, MCP, skills, tooling, and metadata hints', () => {
  const root = mkdtempSync(join(tmpdir(), 'phoenix-agent-hub-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  mkdirSync(join(home, '.claude', 'hooks'), { recursive: true });
  mkdirSync(join(project, '.codex', 'skills', 'vet-dependency'), { recursive: true });
  writeFileSync(join(home, '.claude', 'hooks', 'pre-tool-use.sh'), '#!/usr/bin/env bash\n');
  writeFileSync(join(project, '.mcp.json'), JSON.stringify({ mcpServers: { 'phoenix-firewall': { command: 'npx' } } }));
  writeFileSync(join(project, '.codex', 'skills', 'vet-dependency', 'SKILL.md'), '---\nname: vet-dependency\n---\n');

  const payload = buildAgentHubInventoryPayload({
    deviceId: '00000000-0000-0000-0000-000000000001',
    homeDir: home,
    projectDir: project,
    teamIdHint: 'team-a',
    projectIdHint: 'repo-a',
    now: '2026-06-14T10:00:00.000Z',
  });

  assert.equal(payload.device_id, '00000000-0000-0000-0000-000000000001');
  assert.equal(payload.collector_type, 'hook');
  assert.equal(payload.collected_at, '2026-06-14T10:00:00.000Z');
  assert.equal(payload.team_id, undefined);
  assert.equal(payload.tenant_id, undefined);
  assert.ok(payload.skills.some((item) => item.target_kind === 'hook' && item.platform === 'claude-code'));
  assert.ok(payload.skills.some((item) => item.target_kind === 'mcp_server' && item.name === 'phoenix-firewall'));
  assert.ok(payload.skills.some((item) => item.target_kind === 'agent_skill' && item.name === 'vet-dependency'));
  assert.ok(payload.software.some((item) => item.software_kind === 'coding_agent' && item.name === 'claude-code'));
  assert.ok(payload.software.some((item) => item.software_kind === 'phoenix_component' && item.name === 'phoenix-firewall-agents-hub'));
  assert.ok(payload.skills.every((item) => item.metadata?.team_id_hint === 'team-a'));
  assert.ok(payload.software.every((item) => item.metadata?.project_id_hint === 'repo-a'));
});
