# Phoenix Security Blue Shield - Firewall -- Installation and Testing Guide

> Protect every AI coding agent from malicious, vulnerable, and non-compliant packages.
> This guide walks you through setup, configuration, and validation from scratch.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Quick Start (30-Second Setup)](#2-quick-start-30-second-setup)
3. [MCP Server Installation -- Per Agent](#3-mcp-server-installation----per-agent)
   - 3.1 [Claude Code](#31-claude-code)
   - 3.2 [Cursor](#32-cursor)
   - 3.3 [Codex CLI](#33-codex-cli)
   - 3.4 [Windsurf](#34-windsurf)
   - 3.5 [Cline (VS Code)](#35-cline-vs-code)
   - 3.6 [VS Code Copilot (Agent Mode)](#36-vs-code-copilot-agent-mode)
   - 3.7 [JetBrains IDEs](#37-jetbrains-ides)
4. [PreToolUse Hook Installation -- Per Agent](#4-pretooluse-hook-installation----per-agent)
   - 4.1 [Claude Code Hooks](#41-claude-code-hooks)
   - 4.2 [Codex CLI Hooks](#42-codex-cli-hooks)
   - 4.3 [Windsurf Hooks](#43-windsurf-hooks)
   - 4.4 [Cursor Rules Integration](#44-cursor-rules-integration)
   - 4.5 [Aider Integration](#45-aider-integration)
5. [Claude Skills Installation](#5-claude-skills-installation)
6. [CLI Usage Guide](#6-cli-usage-guide)
7. [Project Configuration (.phoenix-firewall.yaml)](#7-project-configuration-phoenix-firewallyaml)
8. [Testing Guide -- Validation Scenarios](#8-testing-guide----validation-scenarios)
   - 8.1 [Block Malware Package](#81-test-block-malware-package)
   - 8.2 [Warn on Vulnerable Package](#82-test-warn-on-vulnerable-package)
   - 8.3 [Allow Clean Package](#83-test-allow-clean-package)
   - 8.4 [Block + Suggest Alternative](#84-test-block--suggest-alternative)
   - 8.5 [Lockfile Scan](#85-test-lockfile-scan)
9. [Troubleshooting](#9-troubleshooting)
10. [Security Considerations](#10-security-considerations)
11. [Enterprise Deployment](#11-enterprise-deployment)

---

## 1. Prerequisites

### Node.js 18+

The MCP server and CLI are built on Node.js. Verify your version:

```bash
node --version
```

Expected output (any version 18 or higher):

```
v18.20.0
```

If you need to install or upgrade Node.js, visit [nodejs.org](https://nodejs.org/) or use a version manager such as `nvm`:

```bash
nvm install 18
nvm use 18
```

### Get a Phoenix API Key

1. Go to [phxintel.security](https://phxintel.security)
2. Sign up for a free account (no credit card required)
3. Navigate to **Settings > API Keys**
4. Click **Generate New Key**
5. Copy the key -- you will need it in the next step

> Free-tier keys include 1,000 package lookups per month. Pro and Enterprise tiers
> offer higher limits and additional features such as custom firewall rules.

### Set the PHOENIX_API_KEY Environment Variable

Choose the section that matches your shell.

**Bash (~/.bashrc or ~/.bash_profile):**

```bash
export PHOENIX_API_KEY="phx_your_key_here"
```

Reload:

```bash
source ~/.bashrc
```

**Zsh (~/.zshrc):**

```bash
export PHOENIX_API_KEY="phx_your_key_here"
```

Reload:

```bash
source ~/.zshrc
```

**Fish (~/.config/fish/config.fish):**

```fish
set -gx PHOENIX_API_KEY "phx_your_key_here"
```

Reload:

```fish
source ~/.config/fish/config.fish
```

**Windows PowerShell (persistent via profile):**

```powershell
# Add to your PowerShell profile ($PROFILE)
$Env:PHOENIX_API_KEY = "phx_your_key_here"
```

Or set it system-wide via Settings > System > Environment Variables.

Verify it is set:

```bash
echo $PHOENIX_API_KEY
```

Expected output:

```
phx_your_key_here
```

### Optional: Install jq

The hook scripts provide richer output (blocked package names, rule names) when `jq` is available. It is not required -- the hooks fall back to basic pattern matching.

```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# Windows (scoop)
scoop install jq
```

---

## 2. Quick Start (30-Second Setup)

Run one command in your project root:

```bash
npx @phoenix-security/cli init
```

**What it does behind the scenes:**

1. Detects which AI coding agents are present (Claude Code, Cursor, Codex, Windsurf, Cline, Aider)
2. Creates a `.phoenix-firewall.yaml` configuration file in your project root
3. Scaffolds MCP config files for detected agents (`.mcp.json`, `.cursor/mcp.json`, etc.)
4. Installs PreToolUse hooks for agents that support them
5. Validates that `PHOENIX_API_KEY` is set

**Expected output:**

```
[phoenix-firewall] Initializing project...
[OK] Detected agents: claude-code, cursor
[OK] Created .phoenix-firewall.yaml
[OK] Created .mcp.json (Claude Code MCP config)
[OK] Created .cursor/mcp.json (Cursor MCP config)
[OK] PHOENIX_API_KEY is set
[OK] Ready. Run 'npx @phoenix-security/cli doctor' to verify.
```

> If you prefer manual setup, or need to configure a specific agent, follow the
> per-agent sections below.

---

## 3. MCP Server Installation -- Per Agent

The MCP (Model Context Protocol) server exposes seven `phoenix_*` tools that AI agents call to check packages, scan lockfiles, and get intelligence. Each agent discovers these tools automatically once the MCP server is configured.

**Available MCP Tools:**

| Tool | Purpose |
|------|---------|
| `phoenix_check_package` | Pre-install verdict: block, warn, or allow |
| `phoenix_check_lockfile` | Batch scan all dependencies in a lockfile |
| `phoenix_check_diff` | Evaluate only changed deps from a git diff |
| `phoenix_get_package_intel` | Full intelligence: PS-OSS score, vulns, malware, license |
| `phoenix_get_alternatives` | Safe alternatives for a blocked package |
| `phoenix_get_vulnerability` | CVE details with EPSS, KEV status, remediation |
| `phoenix_firewall_rules` | Your active firewall rules summary |

### 3.1 Claude Code

**Step 1: Create `.mcp.json` in your project root**

```bash
cat > .mcp.json << 'EOF'
{
  "mcpServers": {
    "phoenix-firewall": {
      "command": "npx",
      "args": ["-y", "@phoenix-security/mcp-firewall"],
      "env": {
        "PHOENIX_API_KEY": "${PHOENIX_API_KEY}"
      }
    }
  }
}
EOF
```

**Step 2: Restart Claude Code**

Close and reopen Claude Code (or run `/mcp` in the Claude Code CLI to refresh MCP servers). The phoenix-firewall server should appear in the active MCP servers list.

**Step 3: Verify**

In Claude Code, type:

```
Check if lodash@4.17.20 is safe to install
```

**Step 4: Expected behavior**

Claude Code calls `phoenix_check_package` with `pkg:npm/lodash@4.17.20`. You should see a response containing:

- Verdict: `warn` (known CVEs exist for this version)
- CVE details and EPSS scores
- Remediation: upgrade to `lodash@4.17.21`
- A `for_llm_reasoning` narrative explaining the risk

### 3.2 Cursor

**Step 1: Create `.cursor/mcp.json` in your project root**

```bash
mkdir -p .cursor
cat > .cursor/mcp.json << 'EOF'
{
  "mcpServers": {
    "phoenix-firewall": {
      "command": "npx",
      "args": ["-y", "@phoenix-security/mcp-firewall"],
      "env": {
        "PHOENIX_API_KEY": "${PHOENIX_API_KEY}"
      }
    }
  }
}
EOF
```

**Step 2: Verify in Cursor settings**

Open Cursor and go to **Settings > MCP Servers**. You should see `phoenix-firewall` listed with a green status indicator.

**Step 3: Test**

In Cursor chat, type:

```
Is it safe to add colors@1.4.1 to this project?
```

**Expected behavior:** Cursor calls `phoenix_check_package` and returns a `block` verdict (colors@1.4.1 is a known protestware/malware package).

### 3.3 Codex CLI

**Step 1: Create or edit `~/.codex/config.json`**

```bash
mkdir -p ~/.codex
cat > ~/.codex/config.json << 'EOF'
{
  "mcpServers": {
    "phoenix-firewall": {
      "command": "npx",
      "args": ["-y", "@phoenix-security/mcp-firewall"],
      "env": {
        "PHOENIX_API_KEY": "${PHOENIX_API_KEY}"
      }
    }
  }
}
EOF
```

**Step 2: Test with Codex**

```bash
codex "Check if event-stream@3.3.6 is safe to install"
```

**Expected behavior:** Codex calls `phoenix_check_package` and returns a `block` verdict (event-stream@3.3.6 contained a supply chain attack).

### 3.4 Windsurf

**Step 1: Open Windsurf MCP configuration**

In Windsurf, go to **Settings > Extensions > MCP Servers** or edit the MCP config file directly at `~/.windsurf/mcp.json`:

```bash
mkdir -p ~/.windsurf
cat > ~/.windsurf/mcp.json << 'EOF'
{
  "mcpServers": {
    "phoenix-firewall": {
      "command": "npx",
      "args": ["-y", "@phoenix-security/mcp-firewall"],
      "env": {
        "PHOENIX_API_KEY": "${PHOENIX_API_KEY}"
      }
    }
  }
}
EOF
```

**Step 2: Restart Windsurf**

Close and reopen Windsurf. The MCP server should appear in the active tools panel.

**Step 3: Test**

Ask Windsurf:

```
Before installing ua-parser-js@0.7.29, check if it's safe
```

**Expected behavior:** Windsurf calls `phoenix_check_package` and returns a `warn` verdict (this version had a brief supply chain compromise).

### 3.5 Cline (VS Code)

Cline supports MCP natively. No custom hook scripts are needed.

**Step 1: Open Cline MCP settings**

In VS Code with the Cline extension, open the command palette (Cmd+Shift+P / Ctrl+Shift+P) and select **Cline: MCP Settings**. Add the following server:

```json
{
  "mcpServers": {
    "phoenix-firewall": {
      "command": "npx",
      "args": ["-y", "@phoenix-security/mcp-firewall"],
      "env": {
        "PHOENIX_API_KEY": "${PHOENIX_API_KEY}",
        "PHOENIX_API_URL": "https://phxintel.security"
      }
    }
  }
}
```

**Step 2: Verify**

Cline will automatically discover all seven `phoenix_*` tools. You can verify by checking the Cline tools panel -- `phoenix_check_package`, `phoenix_check_lockfile`, and others should be listed.

**Step 3: Test**

Ask Cline:

```
Add axios to this project, but check it for security issues first
```

**Expected behavior:** Cline calls `phoenix_check_package` before running `npm install axios`, and shows the verdict inline.

### 3.6 VS Code Copilot (Agent Mode)

VS Code Copilot supports MCP natively since v1.102 (GA).

**Step 1: Create `.vscode/mcp.json` in your project root**

```bash
mkdir -p .vscode
cat > .vscode/mcp.json << 'EOF'
{
  "servers": {
    "phoenix-firewall": {
      "command": "npx",
      "args": ["-y", "@phoenix-security/mcp-firewall"],
      "env": {
        "PHOENIX_API_KEY": "${PHOENIX_API_KEY}"
      }
    }
  }
}
EOF
```

> Note: VS Code Copilot uses `servers` as the top-level key, not `mcpServers`.

**Step 2: Enable MCP in Copilot**

Open VS Code settings (Cmd+, / Ctrl+,) and search for `chat.mcp.enabled`. Set it to `true`.

**Step 3: Restart VS Code**

The phoenix-firewall server will appear in the Copilot tools panel (click the tools icon in the Copilot chat input).

**Step 4: Test**

In Copilot Agent mode (select "Agent" from the chat mode dropdown), type:

```
Check if lodash@4.17.20 has known vulnerabilities
```

**Expected behavior:** Copilot calls `phoenix_check_package` and shows the verdict with remediation guidance.

### 3.7 JetBrains IDEs

JetBrains IDEs (IntelliJ IDEA, WebStorm, PyCharm, etc.) support MCP through the official MCP plugin.

**Step 1: Install the MCP plugin**

Go to **Settings > Plugins > Marketplace** and search for "MCP". Install the **MCP Server Support** plugin and restart the IDE.

**Step 2: Configure the MCP server**

Go to **Settings > Tools > MCP Servers** and add a new server:

- **Name:** `phoenix-firewall`
- **Command:** `npx`
- **Arguments:** `-y @phoenix-security/mcp-firewall`
- **Environment Variables:**
  - `PHOENIX_API_KEY` = (your key)

Alternatively, create a `.idea/mcp.json` file in your project:

```json
{
  "mcpServers": {
    "phoenix-firewall": {
      "command": "npx",
      "args": ["-y", "@phoenix-security/mcp-firewall"],
      "env": {
        "PHOENIX_API_KEY": "${PHOENIX_API_KEY}"
      }
    }
  }
}
```

**Step 3: Test**

In the AI Assistant chat, ask:

```
Check if express@4.17.1 is safe to install
```

**Expected behavior:** The AI assistant calls `phoenix_check_package` and shows the verdict.

---

## 4. PreToolUse Hook Installation -- Per Agent

Hooks intercept package-install commands (npm install, pip install, yarn add, etc.) *before* they execute and check packages against the Phoenix firewall API. If a package is blocked, the command is stopped before any code runs on your machine.

> Hooks and MCP serve complementary roles. MCP lets the agent *ask* about packages
> proactively. Hooks *enforce* policy even when the agent forgets to ask. For maximum
> protection, configure both.

### 4.1 Claude Code Hooks

#### Option A: Automated (recommended)

```bash
npx @phoenix-security/cli install-hooks claude-code
```

Expected output:

```
[OK] Copied pre-tool-use.sh to ~/.claude/hooks/phoenix-firewall/
[OK] Updated ~/.claude/settings.json with PreToolUse hook
[OK] Hook installed. Restart Claude Code to activate.
```

#### Option B: Manual installation

**Step 1: Copy the hook script**

```bash
mkdir -p ~/.claude/hooks/phoenix-firewall

# If you cloned the repo:
cp PUB-firewall-agents/hooks/claude-code/pre-tool-use.sh \
   ~/.claude/hooks/phoenix-firewall/pre-tool-use.sh

# Or download directly:
curl -o ~/.claude/hooks/phoenix-firewall/pre-tool-use.sh \
  https://raw.githubusercontent.com/Security-Phoenix-demo/phoenix-firewall/main/tools/firewall-agents/hooks/claude-code/pre-tool-use.sh

chmod +x ~/.claude/hooks/phoenix-firewall/pre-tool-use.sh
```

**Step 2: Edit `~/.claude/settings.json`**

Add the `hooks` section (create the file if it does not exist):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hook": "~/.claude/hooks/phoenix-firewall/pre-tool-use.sh"
      }
    ]
  }
}
```

This tells Claude Code: before any Bash tool call, run the firewall hook. The hook only activates for install commands (npm install, pip install, etc.) and passes through everything else.

**Step 3: Restart Claude Code**

Close and reopen Claude Code for the hook to take effect.

**Step 4: Test -- block a known compromised package**

Ask Claude Code:

```
Install colors@1.4.1 in this project
```

Expected output:

```
[phoenix-firewall] BLOCKED: Package colors@1.4.1: blocked by rule malware-detection
```

The install command will NOT execute. Claude Code will see the block and explain why.

**Step 5: Test -- allow a safe package**

Ask Claude Code:

```
Install chalk@5.3.0 in this project
```

Expected output:

```
(no firewall output — the command runs normally)
```

The install proceeds because chalk@5.3.0 is a clean, well-maintained package.

### 4.2 Codex CLI Hooks

**Step 1: Copy the hooks configuration**

```bash
mkdir -p ~/.codex
cp PUB-firewall-agents/hooks/codex/hooks.json ~/.codex/hooks.json
```

Or create it manually:

```bash
cat > ~/.codex/hooks.json << 'EOF'
{
  "hooks": {
    "PreToolUse": [
      {
        "event": "shell_command",
        "match": "(npm install|npm add|pip install|yarn add|pnpm add|cargo add|gem install|uv pip install|poetry add)",
        "handler": {
          "type": "script",
          "path": "~/.claude/hooks/phoenix-firewall/pre-tool-use.sh",
          "description": "Evaluates packages against Phoenix firewall before install."
        },
        "on_deny": {
          "exit_code": 2,
          "message": "Package blocked by Phoenix Security Blue Shield - Firewall policy."
        }
      }
    ]
  }
}
EOF
```

> The hook script is the same one used by Claude Code. Make sure you have already
> copied it to `~/.claude/hooks/phoenix-firewall/pre-tool-use.sh` (see Section 4.1).

**Step 2: Test**

```bash
codex "Install event-stream@3.3.6"
```

Expected output:

```
[phoenix-firewall] BLOCKED: Package event-stream@3.3.6: blocked by rule malware-detection
Package blocked by Phoenix Security Blue Shield - Firewall policy.
```

### 4.3 Windsurf Hooks

**Step 1: Copy the hook script**

```bash
mkdir -p ~/.windsurf/hooks/phoenix-firewall

cp PUB-firewall-agents/hooks/windsurf/pre-run-command.sh \
   ~/.windsurf/hooks/phoenix-firewall/pre-run-command.sh

chmod +x ~/.windsurf/hooks/phoenix-firewall/pre-run-command.sh
```

**Step 2: Configure in Windsurf settings**

Open Windsurf settings and add the pre-run-command hook:

```json
{
  "hooks": {
    "pre_run_command": "~/.windsurf/hooks/phoenix-firewall/pre-run-command.sh"
  }
}
```

The exact location of this setting depends on your Windsurf version. Check the Windsurf documentation for the hooks configuration path.

**Step 3: Test**

Ask Windsurf to install a known malicious package:

```
Add colors@1.4.1 as a dependency
```

Expected output:

```
[phoenix-firewall] BLOCKED: Package colors@1.4.1: blocked by rule malware-detection
```

### 4.4 Cursor Rules Integration

Cursor does not support shell-based hooks. Instead, it uses instruction-based rules that guide the AI agent's behavior.

**Step 1: Add to your `.cursorrules` file**

Create or edit `.cursorrules` in your project root and add:

```
## Supply Chain Security (Phoenix Security Blue Shield - Firewall)

Before adding any dependency via `npm install`, `pip install`, `yarn add`,
`pnpm add`, `cargo add`, `gem install`, `uv pip install`, or `poetry add`:

1. Call the Phoenix Security firewall API to check the package:

   POST ${PHOENIX_API_URL:-https://phxintel.security}/api/v1/firewall/evaluate
   Headers: x-api-key: <from PHOENIX_API_KEY env var>
   Body: {"packages": [{"ecosystem": "<npm|pypi|crates.io|rubygems>", "name": "<pkg>", "version": "<ver>"}]}

2. If the response contains "action": "block" for any package:
   - Do NOT install the package.
   - Report the block reason to the user.
   - Suggest alternatives from the response if available.

3. If the response contains "action": "warn":
   - Show the warning and ask the user before proceeding.

4. If the API is unreachable:
   - Proceed with the install (fail-open) unless the project has
     PHOENIX_STRICT=true, in which case abort.

5. Never log or display the PHOENIX_API_KEY value.

If the Phoenix MCP server is configured, prefer using the `phoenix_check_package`
MCP tool instead of calling the REST API directly.
```

**How it works:** Cursor reads `.cursorrules` on every interaction and follows the instructions. When the MCP server is also configured (Section 3.2), Cursor will prefer the MCP tool. The rules act as a safety net for cases where the agent might skip the MCP call.

**Step 2: Test**

In Cursor chat:

```
Add lodash@4.17.20 to the project
```

Expected behavior: Cursor calls the firewall API (via MCP or REST), sees the `warn` verdict, and asks you whether to proceed or upgrade to `lodash@4.17.21`.

### 4.5 Aider Integration

**Step 1: Copy the pre-install wrapper script**

```bash
mkdir -p ~/.aider/hooks

cp PUB-firewall-agents/hooks/aider/pre-install-wrapper.sh \
   ~/.aider/hooks/pre-install-wrapper.sh

chmod +x ~/.aider/hooks/pre-install-wrapper.sh
```

**Step 2: Configure `.aider.conf.yml`**

Create or edit `.aider.conf.yml` in your project root:

```yaml
# Phoenix Security Blue Shield - Firewall wrapper
# Wraps package manager calls through the firewall check
pre-install-command: ~/.aider/hooks/pre-install-wrapper.sh
```

Alternatively, alias your package manager to use the wrapper:

```bash
# Add to ~/.bashrc or ~/.zshrc
alias npm="~/.aider/hooks/pre-install-wrapper.sh npm"
alias pip="~/.aider/hooks/pre-install-wrapper.sh pip"
alias yarn="~/.aider/hooks/pre-install-wrapper.sh yarn"
```

**Step 3: Test**

```bash
~/.aider/hooks/pre-install-wrapper.sh npm install colors@1.4.1
```

Expected output:

```
[phoenix-firewall] BLOCKED packages:
  - colors@1.4.1: malware-detection
Install aborted. Review firewall rules or use approved alternatives.
```

Test with a safe package:

```bash
~/.aider/hooks/pre-install-wrapper.sh npm install chalk@5.3.0
```

Expected output:

```
[phoenix-firewall] All packages approved
(npm install proceeds normally)
```

---

## 5. Claude Skills Installation

Claude Skills are opinionated workflows that Claude Code can invoke by name. Three skills ship with the Phoenix firewall.

**Step 1: Copy skills to the Claude skills directory**

```bash
mkdir -p ~/.claude/skills

cp -r PUB-firewall-agents/skills/vet-dependency \
      ~/.claude/skills/phoenix-security_vet-dependency

cp -r PUB-firewall-agents/skills/audit-lockfile \
      ~/.claude/skills/phoenix-security_audit-lockfile

cp -r PUB-firewall-agents/skills/remediate-vuln \
      ~/.claude/skills/phoenix-security_remediate-vuln
```

**Step 2: Verify**

Restart Claude Code. The skills will appear in the skills list. You can verify by typing `/` and looking for `phoenix-security:` prefixed entries.

**Step 3: Test each skill**

**phoenix-security:vet-dependency** -- Check a single package before installing:

```
Use vet-dependency to check if express@4.17.1 is safe
```

Expected behavior: Claude calls `phoenix_check_package` with `pkg:npm/express@4.17.1`, returns the verdict (warn -- older version with known CVEs), and suggests upgrading to the latest safe version.

**phoenix-security:audit-lockfile** -- Scan an entire lockfile:

```
Use audit-lockfile to scan my package-lock.json
```

Expected behavior: Claude reads `package-lock.json`, calls `phoenix_check_lockfile` with all packages, and returns a summary: total packages scanned, blocked count, warned count, and clean count.

**phoenix-security:remediate-vuln** -- Find alternatives for a blocked package:

```
Use remediate-vuln to find alternatives for request
```

Expected behavior: Claude calls `phoenix_get_alternatives` for the `request` package (deprecated, multiple CVEs) and returns a ranked list of alternatives with their PS-OSS risk scores (e.g., `got`, `axios`, `node-fetch`).

---

## 6. CLI Usage Guide

The CLI provides four commands. All are available via `npx` without installing globally.

### `init` -- Initialize a project

```bash
npx @phoenix-security/cli init
```

Expected output:

```
[phoenix-firewall] Initializing project...
[OK] Detected agents: claude-code, cursor
[OK] Created .phoenix-firewall.yaml
[OK] Created .mcp.json (Claude Code MCP config)
[OK] Created .cursor/mcp.json (Cursor MCP config)
[OK] PHOENIX_API_KEY is set
[OK] Ready. Run 'npx @phoenix-security/cli doctor' to verify.
```

Options:

```bash
npx @phoenix-security/cli init --agents claude-code,cursor  # Limit to specific agents
npx @phoenix-security/cli init --strict                      # Enable fail-closed mode
```

### `install-hooks` -- Install hooks for a specific agent

```bash
npx @phoenix-security/cli install-hooks claude-code
npx @phoenix-security/cli install-hooks codex
npx @phoenix-security/cli install-hooks windsurf
npx @phoenix-security/cli install-hooks cursor
npx @phoenix-security/cli install-hooks aider
```

Expected output (Claude Code example):

```
[OK] Copied pre-tool-use.sh to ~/.claude/hooks/phoenix-firewall/
[OK] Updated ~/.claude/settings.json with PreToolUse hook
[OK] Hook installed. Restart Claude Code to activate.
```

### `scan` -- Scan a lockfile

```bash
npx @phoenix-security/cli scan package-lock.json
```

You can also scan other lockfile formats:

```bash
npx @phoenix-security/cli scan requirements.txt
npx @phoenix-security/cli scan yarn.lock
npx @phoenix-security/cli scan Cargo.lock
npx @phoenix-security/cli scan go.sum
```

Expected output:

```
[phoenix-firewall] Scanning package-lock.json...

Scanned 247 packages in 3.2s

  BLOCKED (2):
    colors@1.4.1         — malware (protestware incident)
    event-stream@3.3.6   — malware (supply chain attack)

  WARNED (5):
    lodash@4.17.20       — CVE-2021-23337 (prototype pollution), upgrade to 4.17.21
    minimist@1.2.5       — CVE-2021-44906 (prototype pollution), upgrade to 1.2.8
    json5@2.2.1          — CVE-2022-46175 (prototype pollution), upgrade to 2.2.3
    qs@6.9.4             — CVE-2022-24999 (prototype pollution), upgrade to 6.11.0
    express@4.17.1       — CVE-2024-29041, upgrade to 4.19.2

  CLEAN (240):
    All other packages passed firewall checks.

Summary: 247 total | 2 blocked | 5 warned | 240 clean
```

### `doctor` -- Verify your setup

```bash
npx @phoenix-security/cli doctor
```

Expected output (everything passing):

```
[phoenix-firewall] Running diagnostics...

  [OK] Node.js version: v20.11.0 (>= 18 required)
  [OK] PHOENIX_API_KEY is set
  [OK] API reachable: https://phxintel.security (200 OK, 142ms)
  [OK] .phoenix-firewall.yaml found
  [OK] MCP config: .mcp.json (Claude Code)
  [OK] Hook installed: ~/.claude/hooks/phoenix-firewall/pre-tool-use.sh

All checks passed.
```

Expected output (with failures):

```
[phoenix-firewall] Running diagnostics...

  [OK]   Node.js version: v20.11.0 (>= 18 required)
  [FAIL] PHOENIX_API_KEY is not set
         Fix: export PHOENIX_API_KEY="phx_your_key_here"
  [FAIL] API unreachable: connection timed out
         Fix: Check your network connection and proxy settings
  [WARN] .phoenix-firewall.yaml not found
         Fix: Run 'npx @phoenix-security/cli init'
  [OK]   MCP config: .mcp.json (Claude Code)
  [FAIL] Hook not found: ~/.claude/hooks/phoenix-firewall/pre-tool-use.sh
         Fix: Run 'npx @phoenix-security/cli install-hooks claude-code'

1 passed, 2 failed, 1 warning.
```

---

## 7. Project Configuration (.phoenix-firewall.yaml)

Place `.phoenix-firewall.yaml` in your project root. It is read by the MCP server, CLI, and hook scripts.

### Full Annotated Reference

```yaml
# .phoenix-firewall.yaml -- Phoenix Security Blue Shield - Firewall project config
# Documentation: https://docs.phoenix.security/scf/config
# Schema version: 1.0

version: "1.0"

# Name of the environment variable holding your API key.
# NEVER put the actual key in this file -- it is committed to source control.
api_key_env: "PHOENIX_API_KEY"

settings:
  # Behavior when the Phoenix API is unreachable:
  #   open   -- allow all installs (default, least disruptive)
  #   closed -- block all installs until API is reachable
  fail_mode: "open"

  # When true, non-2xx API responses also trigger a block.
  strict_mode: false

  # Local verdict cache TTL in seconds. Set to 0 to disable caching.
  cache_ttl_seconds: 300

  # Ecosystems to evaluate. Packages from unlisted ecosystems are allowed.
  ecosystems: ["npm", "pypi"]

# Per-agent behavior overrides.
agents:
  claude_code:
    # What to do when a package is blocked:
    #   suggest_alternative -- show safe alternatives and let the agent pick
    #   abort               -- hard-stop the tool call
    on_block: "suggest_alternative"

    # What to do on a warning verdict:
    #   show_context_and_ask -- display context, let the user decide
    #   auto_allow           -- proceed silently
    on_warn: "show_context_and_ask"

    # If true, the agent may auto-upgrade to a safe version on block.
    auto_upgrade: false

  cursor:
    on_block: "abort"
    on_warn: "show_context_and_ask"

  codex:
    on_block: "abort"
    on_warn: "show_context_and_ask"

  windsurf:
    on_block: "abort"
    on_warn: "show_context_and_ask"

  aider:
    on_block: "abort"
    on_warn: "auto_allow"

  ci:
    # CI environments should be strict by default.
    on_block: "fail_pipeline"
    on_warn: "annotate_pr"
    strict_mode: true
```

### Common Configuration Examples

**Example: Block malware only (permissive)**

```yaml
version: "1.0"
api_key_env: "PHOENIX_API_KEY"
settings:
  fail_mode: "open"
  strict_mode: false
  ecosystems: ["npm", "pypi", "crates.io", "rubygems"]
agents:
  claude_code:
    on_block: "suggest_alternative"
    on_warn: "auto_allow"
```

**Example: Block malware + critical CVEs (balanced)**

```yaml
version: "1.0"
api_key_env: "PHOENIX_API_KEY"
settings:
  fail_mode: "open"
  strict_mode: false
  ecosystems: ["npm", "pypi"]
agents:
  claude_code:
    on_block: "suggest_alternative"
    on_warn: "show_context_and_ask"
    auto_upgrade: true
```

**Example: Block malware + CVEs + copyleft licenses (strict)**

```yaml
version: "1.0"
api_key_env: "PHOENIX_API_KEY"
settings:
  fail_mode: "closed"
  strict_mode: true
  ecosystems: ["npm", "pypi", "crates.io", "rubygems"]
agents:
  claude_code:
    on_block: "abort"
    on_warn: "show_context_and_ask"
  ci:
    on_block: "fail_pipeline"
    on_warn: "fail_pipeline"
    strict_mode: true
```

---

## 8. Testing Guide -- Validation Scenarios

These test cases validate that your firewall setup is working correctly. Run them after completing installation.

### 8.1 Test: Block Malware Package

`colors@1.4.1` is a known compromised package (the maintainer intentionally introduced an infinite loop as protestware in January 2022).

**Via CLI:**

```bash
npx @phoenix-security/cli scan <<< '{"dependencies":{"colors":"1.4.1"}}'
```

**Via MCP (Claude Code):**

```
Check if colors@1.4.1 is safe to install
```

**Via hook (Claude Code):**

```
Run: npm install colors@1.4.1
```

**Expected result for all methods:**

```
[FAIL] BLOCKED -- colors@1.4.1
  Reason: Confirmed malware (protestware incident)
  Rule: malware-detection
  Action: Do NOT install this package.
  Alternative: chalk@5.3.0 (PS-OSS risk score: 12/100)
```

### 8.2 Test: Warn on Vulnerable Package

`lodash@4.17.20` has known CVEs with available patches.

**Via MCP (Claude Code):**

```
Check if lodash@4.17.20 is safe to install
```

**Expected result:**

```
[WARN] lodash@4.17.20
  Vulnerabilities:
    - CVE-2021-23337 (CVSS 7.2, EPSS 0.23) -- command injection via template
  Safe version: 4.17.21
  Upgrade command: npm install lodash@4.17.21
  Action: Upgrade recommended. The vulnerability is in lodash.template().
```

### 8.3 Test: Allow Clean Package

`chalk@5.3.0` is a well-maintained, clean package with no known issues.

**Via MCP (Claude Code):**

```
Check if chalk@5.3.0 is safe to install
```

**Expected result:**

```
[OK] chalk@5.3.0
  Verdict: allow
  PS-OSS risk score: 12/100 (low risk)
  License: MIT
  Malware: none detected
  Vulnerabilities: 0 known CVEs
```

### 8.4 Test: Block + Suggest Alternative

This test validates the full remediation flow where the agent receives alternatives and can switch automatically.

**Via MCP (Claude Code):**

```
I need a package for HTTP requests. Install request@2.88.2
```

**Expected behavior:**

1. Claude calls `phoenix_check_package` for `request@2.88.2`
2. Receives a `warn` or `block` verdict (deprecated, multiple CVEs)
3. The `for_llm_reasoning` narrative explains why and lists alternatives
4. Claude calls `phoenix_get_alternatives` for the `request` package
5. Receives alternatives: `got`, `axios`, `node-fetch`, `undici`
6. Claude suggests the best alternative (e.g., `axios@1.7.0`) and offers to install it
7. If `auto_upgrade` is true in config, Claude installs the alternative automatically

**Expected output flow:**

```
[WARN] request@2.88.2
  Status: Deprecated (February 2020)
  Vulnerabilities: 3 known CVEs
  Alternative packages:
    1. axios@1.7.0     (PS-OSS: 15/100, MIT license)
    2. got@14.4.0      (PS-OSS: 18/100, MIT license)
    3. node-fetch@3.3.2 (PS-OSS: 20/100, MIT license)

  Recommendation: Use axios@1.7.0 -- most popular, actively maintained, low risk.
```

### 8.5 Test: Lockfile Scan

**Step 1: Create a test lockfile**

If you have a project with `package-lock.json`, use that. Otherwise, create a minimal test:

```bash
mkdir /tmp/firewall-test && cd /tmp/firewall-test
npm init -y
npm install lodash@4.17.20 express@4.17.1 chalk@5.3.0
```

**Step 2: Run the scan**

```bash
npx @phoenix-security/cli scan package-lock.json
```

**Expected output:**

```
[phoenix-firewall] Scanning package-lock.json...

Scanned 58 packages in 1.8s

  BLOCKED (0):
    (none)

  WARNED (2):
    lodash@4.17.20  — CVE-2021-23337, upgrade to 4.17.21
    express@4.17.1  — CVE-2024-29041, upgrade to 4.19.2

  CLEAN (56):
    All other packages passed firewall checks.

Summary: 58 total | 0 blocked | 2 warned | 56 clean
```

---

## 9. Troubleshooting

### "PHOENIX_API_KEY not set"

The API key environment variable is missing or empty.

**Fix (per shell):**

```bash
# Bash/Zsh -- add to your shell profile and reload
export PHOENIX_API_KEY="phx_your_key_here"
source ~/.bashrc  # or source ~/.zshrc

# Fish
set -gx PHOENIX_API_KEY "phx_your_key_here"

# Windows PowerShell
$Env:PHOENIX_API_KEY = "phx_your_key_here"
```

Verify:

```bash
echo $PHOENIX_API_KEY
```

### "Cannot reach API" / Connection timeout

The CLI or hook cannot connect to `phxintel.security`.

**Possible causes and fixes:**

1. **Network issue:** Verify you have internet access: `curl -s https://phxintel.security/health`
2. **Corporate proxy:** Set your proxy environment variables:
   ```bash
   export HTTPS_PROXY="http://proxy.yourcompany.com:8080"
   ```
3. **Corporate firewall:** Ask your network team to allow outbound HTTPS to `phxintel.security` (port 443)
4. **DNS resolution:** Try `nslookup phxintel.security`

### "MCP tools not appearing"

The agent does not show `phoenix_check_package` or other tools.

**Fixes:**

1. **Restart the agent.** Most agents only load MCP servers on startup.
2. **Check the config file path:**
   - Claude Code: `.mcp.json` in project root
   - Cursor: `.cursor/mcp.json` in project root
   - Cline: check Cline MCP settings in VS Code
   - VS Code Copilot: `.vscode/mcp.json` in project root
3. **Verify JSON syntax:** Run `cat .mcp.json | python3 -m json.tool` to check for syntax errors.
4. **Check PHOENIX_API_KEY:** The MCP server exits immediately if the key is not set. Look for `[phoenix-firewall] PHOENIX_API_KEY not set` in the agent's output panel.

### "Hook not triggering"

The hook exists but install commands are not being checked.

**Fixes:**

1. **File permissions:** Ensure the hook script is executable:
   ```bash
   chmod +x ~/.claude/hooks/phoenix-firewall/pre-tool-use.sh
   ```
2. **Path in settings.json:** Verify the path in `~/.claude/settings.json` matches the actual file location. Use an absolute path.
3. **Restart the agent:** Hooks are loaded on startup.
4. **Test the hook directly:**
   ```bash
   TOOL_INPUT="npm install colors@1.4.1" \
   PHOENIX_API_KEY="$PHOENIX_API_KEY" \
   bash ~/.claude/hooks/phoenix-firewall/pre-tool-use.sh
   echo "Exit code: $?"
   ```
   Expected: exit code 2 (blocked) or 0 (allowed).

### "Strict mode blocking everything"

When `PHOENIX_STRICT=true` is set, the firewall blocks all installs if the API is unreachable or returns non-2xx responses.

**Fixes:**

1. **Temporary:** Unset strict mode to unblock:
   ```bash
   unset PHOENIX_STRICT
   ```
2. **Permanent:** Set `strict_mode: false` in `.phoenix-firewall.yaml` or remove `PHOENIX_STRICT` from your shell profile.
3. **Root cause:** Check why the API is unreachable (see "Cannot reach API" above).

### "npx hangs or downloads slowly"

The first `npx @phoenix-security/mcp-firewall` run downloads the package from npm.

**Fix:** Pre-install globally to avoid repeated downloads:

```bash
npm install -g @phoenix-security/mcp-firewall @phoenix-security/cli
```

Then update your MCP config to use the global binary:

```json
{
  "mcpServers": {
    "phoenix-firewall": {
      "command": "phoenix-firewall-mcp",
      "env": {
        "PHOENIX_API_KEY": "${PHOENIX_API_KEY}"
      }
    }
  }
}
```

---

## 10. Security Considerations

### API Key Handling

- Store `PHOENIX_API_KEY` as an environment variable, NEVER in source files
- The `.phoenix-firewall.yaml` config file references the environment variable name (`api_key_env`), not the key itself
- Add `PHOENIX_API_KEY` to your CI/CD secrets manager (GitHub Secrets, GitLab CI Variables, etc.)
- The MCP server and hook scripts never log or display the API key value
- Rotate keys periodically via the [phxintel.security](https://phxintel.security) dashboard

### What Data Is Sent to the API

The firewall sends only:

- **Package name** (e.g., `lodash`)
- **Package version** (e.g., `4.17.21`)
- **Ecosystem** (e.g., `npm`, `pypi`)

The firewall does NOT send:

- Your source code
- File contents
- Environment variables (other than through the API key header)
- Repository URLs or file paths
- User names or email addresses

### Provenance Verification

For maximum supply chain security, combine the Phoenix firewall with npm provenance verification:

```bash
npm audit signatures
```

This verifies that packages were built and published through trusted CI/CD pipelines. The Phoenix firewall checks *what* is in the package; provenance verification checks *who* built it.

### Fail-Open vs. Fail-Closed

By default, the firewall operates in **fail-open** mode: if the API is unreachable, installs proceed normally. This prevents the firewall from blocking development when there are network issues.

For higher-security environments, enable **fail-closed** mode:

```yaml
# .phoenix-firewall.yaml
settings:
  fail_mode: "closed"
  strict_mode: true
```

Or via environment variable:

```bash
export PHOENIX_STRICT=true
```

In fail-closed mode, all installs are blocked when the API is unreachable. Use this in CI/CD pipelines and security-sensitive projects.

---

## 11. Enterprise Deployment

### Managed MCP Configuration for Claude Code Enterprise

For organization-wide deployment, create a managed MCP config that applies to all team members:

```json
{
  "mcpServers": {
    "phoenix-firewall": {
      "command": "npx",
      "args": ["-y", "@phoenix-security/mcp-firewall"],
      "env": {
        "PHOENIX_API_KEY": "${PHOENIX_API_KEY}",
        "PHOENIX_API_URL": "https://phxintel.security"
      }
    }
  }
}
```

Distribute this as a managed configuration through your Claude Code Enterprise admin console.

### Organization-Wide .phoenix-firewall.yaml

Create a shared configuration and distribute it via your internal package registry or dotfiles repository:

```yaml
version: "1.0"
api_key_env: "PHOENIX_API_KEY"
settings:
  fail_mode: "closed"
  strict_mode: true
  cache_ttl_seconds: 300
  ecosystems: ["npm", "pypi", "crates.io", "rubygems"]
agents:
  claude_code:
    on_block: "abort"
    on_warn: "show_context_and_ask"
  cursor:
    on_block: "abort"
    on_warn: "show_context_and_ask"
  ci:
    on_block: "fail_pipeline"
    on_warn: "annotate_pr"
    strict_mode: true
```

### CI/CD Integration

The Phoenix Security Blue Shield - Firewall integrates with all major CI/CD platforms. For GitHub Actions, GitLab CI, Jenkins, Azure DevOps, and Bitbucket Pipelines templates, see:

[phoenix-firewall/integrations/](https://github.com/Security-Phoenix-demo/phoenix-firewall/tree/main/integrations)

**Quick GitHub Actions example:**

```yaml
# .github/workflows/supply-chain-check.yml
name: Supply Chain Firewall
on:
  pull_request:
    paths:
      - 'package-lock.json'
      - 'requirements.txt'
      - 'yarn.lock'

jobs:
  firewall-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Scan lockfile
        env:
          PHOENIX_API_KEY: ${{ secrets.PHOENIX_API_KEY }}
        run: npx @phoenix-security/cli scan package-lock.json --strict
```

---

## Further Resources

- [Phoenix Security Documentation](https://docs.phoenix.security)
- [Phoenix Security Blue Shield - Firewall GitHub Repository](https://github.com/Security-Phoenix-demo/phoenix-firewall)
- [API Reference](https://phxintel.security/docs)
- [Get an API Key](https://phxintel.security)
- [CI/CD Integration Templates](https://github.com/Security-Phoenix-demo/phoenix-firewall/tree/main/integrations)
- [Report a Security Issue](https://github.com/Security-Phoenix-demo/phoenix-firewall/blob/main/SECURITY.md)
