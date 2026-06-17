import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { endpointMetadata, fromHostMAC } from '../dist/endpoint-identity.js';
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
    endpointIdentity: fromHostMAC({
      hostname: 'Build-Host-01',
      primaryMac: 'AA:BB:CC:DD:EE:FF',
      macAddresses: ['aa:bb:cc:dd:ee:ff'],
      loggedInUser: 'alice',
      userUid: '501',
      userHomeDir: '/Users/alice',
    }),
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
  assert.ok(payload.skills.every((item) => item.metadata?.hostname === 'Build-Host-01'));
  assert.ok(payload.software.every((item) => item.metadata?.primary_mac === 'AA:BB:CC:DD:EE:FF'));
  assert.ok(payload.software.every((item) => item.metadata?.logged_in_user === 'alice'));
});

test('endpoint identity derives the same hostname plus MAC UUID as the Go collector', () => {
  const identity = fromHostMAC({
    hostname: 'Build-Host-01',
    primaryMac: 'AA:BB:CC:DD:EE:FF',
    macAddresses: ['aa:bb:cc:dd:ee:ff'],
    loggedInUser: 'alice',
    userUid: '501',
    userHomeDir: '/Users/alice',
  });
  assert.equal(identity.deviceId, '72460ba3-1292-5d86-958f-73e46058a088');
  assert.deepEqual(endpointMetadata(identity, 'hook').mac_addresses, ['aa:bb:cc:dd:ee:ff']);
});
