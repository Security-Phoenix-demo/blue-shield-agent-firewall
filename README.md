# Phoenix Security Blue Shield - Firewall — Agent Hub

> Protect AI coding agents from malicious and vulnerable packages. One command secures Claude Code, Cursor, Codex, Windsurf, Cline, Aider, GitHub Copilot, and Gemini Antigravity.

<p align="center">
  <img src="assets/phoenix-firewall-banner.jpeg" alt="Phoenix Security Blue Shield - Firewall (Agent Hub) banner" width="600">
</p>

<h1 align="center">Phoenix Security Blue Shield - Firewall (Agent Hub)</h1>

<p align="center">
  <strong>Detection without enforcement is noise.</strong><br>
  Intelligence-driven package firewall for AI coding agents.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Agents%20Supported-Claude%20%7C%20Cursor%20%7C%20Codex%20%7C%20Windsurf%20%7C%20Cline%20%7C%20Aider%20%7C%20Copilot%20%7C%20Antigravity-1f6feb" alt="Agents Supported">
  <img src="https://img.shields.io/badge/Project%20Status-Released%20(Beta)-2da44e" alt="Project Status: Released Beta">
</p>

<p align="center">
  <a href="https://github.com/Security-Phoenix-demo/phoenix-firewall/actions"><img src="https://img.shields.io/github/actions/workflow/status/Security-Phoenix-demo/phoenix-firewall/release.yml?label=build" alt="Build Status"></a>
  <a href="https://github.com/Security-Phoenix-demo/phoenix-firewall/releases"><img src="https://img.shields.io/github/v/release/Security-Phoenix-demo/phoenix-firewall" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
  <a href="https://phxintel.security"><img src="https://img.shields.io/badge/powered%20by-Phoenix%20Security-orange" alt="Phoenix Security"></a>
</p>

---

## Overview

This repository is the **agent integration layer** of the Phoenix Security Blue Shield - Firewall. It contains the NPM packages, shell hooks, and Claude skills that connect AI coding agents to Phoenix's intelligence backend.

The companion binary repository ([Security-Phoenix-demo/phoenix-firewall](https://github.com/Security-Phoenix-demo/phoenix-firewall)) contains the Go proxy and endpoint agent. The two repositories work together but are independently usable:

| What you need | Use |
|---------------|-----|
| Block packages inside AI agent sessions | **This repo** (hooks + MCP) |
| Intercept ALL network traffic from a machine | [phoenix-firewall](https://github.com/Security-Phoenix-demo/phoenix-firewall) proxy mode |
| Intercept at the command level on developer workstations | [phoenix-firewall](https://github.com/Security-Phoenix-demo/phoenix-firewall) endpoint/shim mode |
| Both at once | Both repos — they auto-deduplicate verdicts |

---

## How It Works

When an AI agent attempts a package install, Phoenix evaluates the request in real time:

```
Agent session
   |
   | npm install / pip install / cargo add / ...
   v
PreToolUse hook OR MCP tool call
   |
   | POST /api/v1/firewall/evaluate
   v
Phoenix Intelligence Backend
   |
   +-- Malware signals (77 heuristics, dual-LLM adversarial verification)
   +-- Vulnerability data (CVSS, EPSS, CISA KEV, PoC presence)
   +-- PS-OSS risk score (0-100, open source risk composite)
   +-- License compliance (SPDX categories, copyleft flags)
   +-- Supply chain hygiene (age, maintainer rep, typosquatting)
   |
   v
{ action: "block" | "warn" | "allow", for_llm_reasoning: "...", remediation: {...} }
   |
   v
Hook exits 2 (block) or 0 (allow) — or MCP returns structured verdict
```

If blocked, agents receive a `for_llm_reasoning` narrative explaining *why* and listing safe alternatives — enabling autonomous remediation without human escalation.

### Endpoint mode coexistence (v4)

When the [Phoenix Shield Endpoint](https://github.com/Security-Phoenix-demo/phoenix-firewall) v4 agent is installed on the same workstation, hooks auto-detect the local worker via `~/.config/phoenix-firewall/agent-bridge.json` and route evaluation locally instead of calling the backend directly. This:

- Reduces latency (local Unix socket vs HTTPS round-trip)
- Deduplicates verdicts between hook and shim layers
- Allows offline policy evaluation when backend is unreachable

---

## Quick Start

```bash
# Set your API key (get one at https://phxintel.security)
export PHOENIX_API_KEY=phx_your_key_here

# Initialize in your project (detects agents, scaffolds config)
npx @phoenix-security/cli init

# Install PreToolUse hook for Claude Code
npx @phoenix-security/cli install-hooks claude-code

# Scan an existing lockfile
npx @phoenix-security/cli scan package-lock.json

# Run the MCP server directly
npx -y @phoenix-security/mcp-firewall
```

---

## Packages

### `@phoenix-security/mcp-firewall`

An MCP (Model Context Protocol) server exposing 7 `phoenix_*` tools. AI agents with MCP support can use these tools proactively — checking packages before installing, auditing lockfiles, and fetching safe alternatives.

**Install / run:**
```bash
npx -y @phoenix-security/mcp-firewall
# or pin a version
npx @phoenix-security/mcp-firewall@0.1.0
```

**Environment variables:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PHOENIX_API_KEY` | Yes | — | Your Phoenix API key |
| `PHOENIX_API_URL` | No | `https://api.phxintel.security` | Override for self-hosted or dev |

**Transport modes:**
- `stdio` (default) — for local agent integration via `.mcp.json` / `mcp.json`
- `--http <port>` — Streamable HTTP for hosted deployments (e.g., `npx -y @phoenix-security/mcp-firewall --http 3100`)

#### MCP Tools Reference

| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `phoenix_check_package` | `purl: string` (e.g. `pkg:npm/axios@1.7.0`) | `{action, verdict, for_llm_reasoning, remediation}` | Pre-install check — primary enforcement point |
| `phoenix_check_lockfile` | `lockfile_path: string` | `{results: [...], blocked_count, warn_count}` | Batch scan all pinned dependencies |
| `phoenix_check_diff` | `diff: string` (git diff text) | `{added_packages: [...], results: [...]}` | Evaluate only newly added deps from a git diff |
| `phoenix_get_package_intel` | `purl: string` | `{ps_oss_score, vulnerabilities, malware_signals, license, alternatives}` | Full intelligence profile for a package |
| `phoenix_get_alternatives` | `purl: string` | `{alternatives: [{purl, score, reason}]}` | Safe alternatives for a blocked or risky package |
| `phoenix_get_vulnerability` | `cve_id: string` | `{cvss, epss, kev, ransomware, poc, remediation}` | CVE details with threat context |
| `phoenix_firewall_rules` | — | `{rules: [...], policy}` | Your tenant's active firewall rules summary |

#### `phoenix_check_package` response shape

```json
{
  "action": "block",
  "verdict": "malicious",
  "ps_oss_score": 87,
  "for_llm_reasoning": "Package 'malicious-pkg' matches 14 malware signals including obfuscated install scripts and network exfiltration patterns. DO NOT install. Recommended alternative: 'safe-pkg@2.1.0' (PS-OSS: 12).",
  "remediation": {
    "alternatives": [{"purl": "pkg:npm/safe-pkg@2.1.0", "score": 12}],
    "safe_versions": []
  }
}
```

---

### `@phoenix-security/cli`

CLI for project initialization, hook installation, lockfile scanning, and configuration validation.

**Install:**
```bash
npm install -g @phoenix-security/cli
# or use npx without installing
npx @phoenix-security/cli <command>
```

#### Commands

| Command | Description |
|---------|-------------|
| `phoenix-firewall init` | Scaffold `.phoenix-firewall.yaml`, detect installed agents, print next steps |
| `phoenix-firewall install-hooks <agent>` | Install the PreToolUse hook for a specific agent |
| `phoenix-firewall scan <lockfile>` | Scan a lockfile against the Phoenix API |
| `phoenix-firewall doctor` | Validate configuration, API key, and hook installation |

**`install-hooks` agent values:**

```bash
phoenix-firewall install-hooks claude-code
phoenix-firewall install-hooks cursor
phoenix-firewall install-hooks codex
phoenix-firewall install-hooks windsurf
phoenix-firewall install-hooks cline
phoenix-firewall install-hooks aider
phoenix-firewall install-hooks github-copilot
phoenix-firewall install-hooks gemini-antigravity
```

**`scan` output example:**

```
Scanning package-lock.json (1,247 packages)...

  BLOCKED  lodash-utils@1.0.0       — malware: exfiltration scripts (PS-OSS: 91)
  WARN     axios@0.27.0             — CVE-2023-45857 CVSS 6.5 (patch: 1.6.0)
  ALLOW    react@18.2.0             — PS-OSS: 8

Summary: 1 blocked, 1 warning, 1245 clean
```

---

### `@phoenix-security/schema`

Shared TypeScript types and JSON schemas for Phoenix Security Blue Shield - Firewall API payloads. Use this in your own integrations to stay in sync with the API contract.

```bash
npm install @phoenix-security/schema
```

```typescript
import type { EvaluateRequest, EvaluateResponse, FirewallVerdict } from '@phoenix-security/schema';
```

---

## Agent Configuration

### Claude Code

Add to `.mcp.json` in your project root (or `~/.claude/settings.json` for global):

```json
{
  "mcpServers": {
    "phoenix-firewall": {
      "command": "npx",
      "args": ["-y", "@phoenix-security/mcp-firewall"],
      "env": { "PHOENIX_API_KEY": "${PHOENIX_API_KEY}" }
    }
  }
}
```

For hook-based enforcement (blocks `Bash` tool install commands), add the PreToolUse hook:

```bash
npx @phoenix-security/cli install-hooks claude-code
# or manually: copy hooks/claude-code/pre-tool-use.sh and reference it in ~/.claude/settings.json
```

Hook settings snippet (`~/.claude/settings.json`):
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/phoenix-pre-tool-use.sh" }]
      }
    ]
  }
}
```

**How the hook works:**
1. Receives the `TOOL_INPUT` environment variable (the Bash command string)
2. Pattern-matches against `npm install`, `pip install`, `yarn add`, `pnpm add`, `cargo add`, `gem install`, `uv pip install`, `poetry add`
3. Extracts package names and detects ecosystem from the command prefix
4. POSTs to `/api/v1/firewall/evaluate`
5. Exits `0` (allow) or `2` (block — Claude Code denies the tool call)
6. Prints a `for_llm_reasoning` message when blocking so Claude understands why

**Hook environment variables:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PHOENIX_API_KEY` | Yes | — | API key |
| `PHOENIX_API_URL` | No | `https://api.phxintel.security` | Override URL |
| `PHOENIX_STRICT` | No | `false` | `true` = block when API is unreachable (fail-closed) |

---

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "phoenix-firewall": {
      "command": "npx",
      "args": ["-y", "@phoenix-security/mcp-firewall"],
      "env": { "PHOENIX_API_KEY": "${PHOENIX_API_KEY}" }
    }
  }
}
```

For terminal command blocking, add the `cursorrules` snippet from [hooks/cursor/cursorrules-snippet.md](hooks/cursor/cursorrules-snippet.md) to your `.cursorrules` file. This instructs Cursor to call `phoenix_check_package` before any install command.

---

### Codex CLI

Add hook configuration to `~/.codex/hooks.json`:

```json
{
  "hooks": {
    "pre_tool_call": {
      "command": "~/.codex/hooks/phoenix-pre-tool-use.sh",
      "env": { "PHOENIX_API_KEY": "${PHOENIX_API_KEY}" }
    }
  }
}
```

See [hooks/codex/hooks.json](hooks/codex/hooks.json) for the full template.

---

### Windsurf

Copy the pre-run-command hook to your Windsurf configuration directory:

```bash
cp hooks/windsurf/pre-run-command.sh ~/.windsurf/hooks/phoenix-firewall.sh
chmod +x ~/.windsurf/hooks/phoenix-firewall.sh
```

Configure in Windsurf settings to run before terminal commands. The hook intercepts `npm`, `pip`, `cargo`, and other package manager commands.

---

### Cline

See [hooks/cline/README.md](hooks/cline/README.md). Cline uses VS Code's task system for pre-command hooks; the README provides a `tasks.json` snippet for each supported package manager.

---

### Aider

Aider's `--pre-commit` hook runs before each commit; the Phoenix integration wraps install commands through a proxy script:

```bash
aider --pre-commit ~/.aider/hooks/phoenix-pre-install.sh
```

See [hooks/aider/pre-install-wrapper.sh](hooks/aider/pre-install-wrapper.sh) for the full script.

---

### GitHub Copilot

Three integration surfaces:

**1. Copilot CLI (terminal):**
```bash
cp hooks/github-copilot/pre-suggest.sh ~/.copilot/hooks/phoenix-firewall.sh
chmod +x ~/.copilot/hooks/phoenix-firewall.sh
```

**2. VS Code tasks:**
Add the snippet from [hooks/github-copilot/vscode-tasks-snippet.json](hooks/github-copilot/vscode-tasks-snippet.json) to your `.vscode/tasks.json`. This creates a `Phoenix: Check Package` task that runs before terminal install commands.

**3. Visual Studio (Windows):**
Use the PowerShell script [hooks/github-copilot/ps-pre-execute.ps1](hooks/github-copilot/ps-pre-execute.ps1), which intercepts `npm`, `pip`, and `cargo` commands in the Developer PowerShell.

See [hooks/github-copilot/README.md](hooks/github-copilot/README.md) for full setup instructions.

---

### Gemini Antigravity

Add pre-tool-use hook configuration:

```json
{
  "hooks": {
    "pre_tool_use": "~/.gemini/hooks/phoenix-pre-tool-use.sh"
  }
}
```

Copy the snippet from [hooks/gemini-antigravity/config-snippet.json](hooks/gemini-antigravity/config-snippet.json). See [hooks/gemini-antigravity/README.md](hooks/gemini-antigravity/README.md) for workspace config details.

---

## Claude Skills

Three reusable skills for Claude Code. Copy the desired skill directories to `~/.claude/skills/`:

```bash
# Option 1: copy all three
cp -r skills/vet-dependency skills/audit-lockfile skills/remediate-vuln ~/.claude/skills/

# Option 2: install via CLI
npx @phoenix-security/cli install-hooks claude-code --include-skills
```

### `phoenix-security:vet-dependency`

**Trigger:** Before any `npm install`, `pip install`, `cargo add`, etc.

**Flow:**
1. Extract package name, ecosystem, and version
2. Call `phoenix_check_package` with the PURL
3. If `action: block` — refuse installation, surface `for_llm_reasoning`, suggest `remediation.alternatives`
4. If `action: warn` — show warning, suggest `remediation.safe_versions`
5. If `action: allow` — proceed

**Usage in Claude Code:**
```
/phoenix-security:vet-dependency
```
Or reference the skill in a system prompt to have Claude apply it automatically.

---

### `phoenix-security:audit-lockfile`

**Trigger:** Before committing changes that include lockfile modifications.

**Flow:**
1. Detect lockfile type (`package-lock.json`, `Pipfile.lock`, `Cargo.lock`, `Gemfile.lock`, `poetry.lock`, `yarn.lock`, `pnpm-lock.yaml`)
2. Call `phoenix_check_lockfile` with the file path
3. Surface all blocked and warned packages
4. For blocked packages, call `phoenix_get_alternatives` and suggest replacements
5. Refuse commit if any blocked packages remain

---

### `phoenix-security:remediate-vuln`

**Trigger:** When a vulnerability is found in a dependency.

**Flow:**
1. Call `phoenix_get_vulnerability` with the CVE ID
2. Call `phoenix_get_alternatives` for the affected package
3. Present safe upgrade path or replacement options
4. Apply the fix (bump version in `package.json`, update lockfile, etc.)

---

## Intelligence Signals

Every verdict is backed by Phoenix's multi-source intelligence:

| Signal Category | Sources | What it checks |
|-----------------|---------|----------------|
| **Malware heuristics** | 77 signals | Obfuscated scripts, suspicious install hooks, exfiltration patterns, typosquatting |
| **LLM adversarial verification** | Dual-model (MPI v3.1) | Independent LLM consensus on malware classification |
| **Vulnerability data** | NVD, CISA KEV, EPSS, ZDI, VulnCheck, OSV | CVSS scores, exploit availability, ransomware associations |
| **PS-OSS risk score** | Phoenix proprietary | 0-100 composite: maintenance, reputation, age, license, vuln history |
| **License compliance** | SPDX | Copyleft detection, commercial restrictions, FOSS category |
| **Supply chain hygiene** | npm/PyPI/crates.io/RubyGems metadata | Package age, download velocity anomalies, maintainer changes |

---

## Repository Structure

```
PUB-firewall-agents-hub/
├── packages/
│   ├── mcp-firewall/      # @phoenix-security/mcp-firewall — MCP server (7 tools)
│   ├── cli/               # @phoenix-security/cli — init, install-hooks, scan, doctor
│   └── schema/            # @phoenix-security/schema — shared TypeScript types
├── hooks/
│   ├── claude-code/       # pre-tool-use.sh + settings-snippet.json
│   ├── cursor/            # cursorrules-snippet.md
│   ├── codex/             # hooks.json
│   ├── windsurf/          # pre-run-command.sh
│   ├── cline/             # README.md (VS Code tasks approach)
│   ├── aider/             # pre-install-wrapper.sh
│   ├── github-copilot/    # pre-suggest.sh + ps-pre-execute.ps1 + vscode-tasks-snippet.json
│   └── gemini-antigravity/ # pre-tool-use.sh + config-snippet.json
├── skills/
│   ├── vet-dependency/    # phoenix-security:vet-dependency skill
│   ├── audit-lockfile/    # phoenix-security:audit-lockfile skill
│   └── remediate-vuln/    # phoenix-security:remediate-vuln skill
├── docs/                  # Additional documentation
├── examples/              # Usage examples
├── assets/                # Images and marketing assets
├── .changeset/            # Changesets for versioning
├── CODEOWNERS             # @frank @alfonso
├── LICENSE                # Apache-2.0
└── SECURITY.md            # Vulnerability reporting
```

---

## Relationship to the Go Binary

This repo and [Security-Phoenix-demo/phoenix-firewall](https://github.com/Security-Phoenix-demo/phoenix-firewall) (the Go binary) are complementary:

```
                      ┌─────────────────────────────────────┐
                      │         AI Agent Session             │
                      │  (Claude Code / Cursor / Codex / ...) │
                      └─────────────┬───────────────────────┘
                                    │ package install command
                          ┌─────────┴─────────┐
                          │                   │
               ┌──────────▼──────────┐  ┌────▼────────────────────┐
               │  MCP Tool Call OR   │  │  PreToolUse Hook         │
               │  phoenix_check_*    │  │  (pre-tool-use.sh)       │
               │  (this repo)        │  │  (this repo)             │
               └──────────┬──────────┘  └────┬────────────────────┘
                          │                   │
                          └─────────┬─────────┘
                                    │
                    ┌───────────────▼─────────────────┐
                    │  agent-bridge.json present?      │
                    │  ~/.config/phoenix-firewall/     │
                    └───────────┬─────────────────────┘
                               YES                  NO
                                │                    │
               ┌────────────────▼──┐    ┌────────────▼───────────────┐
               │  Local v4 agent   │    │  Phoenix Backend            │
               │  worker (IPC)     │    │  api.phxintel.security      │
               │  (Go binary repo) │    │  POST /api/v1/firewall/     │
               └───────────────────┘    │  evaluate                  │
                                        └────────────────────────────┘
```

**Proxy mode** (Go binary) operates at the network layer — it intercepts HTTP/HTTPS traffic from any process on the machine, including package managers run directly in a terminal (not inside an agent session). It requires `HTTPS_PROXY` to be set.

**Endpoint/shim mode** (Go binary) operates at the process layer — PATH shims intercept `npm`, `pip`, etc. before they execute, even if the agent session doesn't have an MCP server.

**Hooks/MCP** (this repo) operate at the agent session layer — they intercept tool calls from AI agents specifically. They don't affect manual terminal commands outside agent sessions.

**Coverage matrix:**

| Scenario | Hooks/MCP (this repo) | Proxy mode | Shim mode |
|----------|-----------------------|------------|-----------|
| Agent installs package | Yes | Yes (if HTTPS_PROXY set) | Yes (if shim in PATH) |
| Developer runs `npm install` manually | No | Yes | Yes |
| CI pipeline runs package manager | No | Via `HTTPS_PROXY` env | Via PATH |
| Offline / no network | No (API unreachable) | No | Yes (local cache) |
| Low latency (local) | Depends on API | No | Yes (v4 local worker) |

For maximum coverage, deploy all three together. They deduplicate via `agent-bridge.json`.

---

## Development

### Prerequisites

- Node.js 20+
- npm 10+

### Build

```bash
# Install all workspace dependencies
npm install

# Build all packages
npm run build --workspaces

# Build a single package
cd packages/mcp-firewall && npm run build
```

### Testing

```bash
npm test --workspaces
```

### Publishing

This monorepo uses [Changesets](https://github.com/changesets/changesets). To release:

```bash
# Create a changeset for your changes
npx changeset

# Version packages
npx changeset version

# Publish to npm
npx changeset publish
```

---

## CI Templates

Primary CI templates (GitHub Actions, GitLab CI, Jenkins, Azure DevOps, Bitbucket Pipelines) live in the companion repo:

[phoenix-firewall/integrations/](https://github.com/Security-Phoenix-demo/phoenix-firewall/tree/main/integrations)

Quick GitHub Actions example using only this repo (no binary required):

```yaml
- name: Phoenix lockfile scan
  env:
    PHOENIX_API_KEY: ${{ secrets.PHOENIX_API_KEY }}
  run: |
    npx @phoenix-security/cli scan package-lock.json
```

---

## Domains

| Domain | Purpose |
|--------|---------|
| `api.phxintel.security` | REST API (primary) |
| `mcp.phxintel.security` | Hosted MCP server (Streamable HTTP) |
| `dev.phxintel.security` | Dev/staging |

---

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting and supply chain verification (SHA-256 checksums, CycloneDX SBOM).

---

## License

Apache-2.0 — see [LICENSE](LICENSE).
