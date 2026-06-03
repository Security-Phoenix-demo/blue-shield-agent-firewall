# Gemini Antigravity — Phoenix Security Blue Shield - Firewall hook

Intercepts package-install commands proposed by Google's Gemini Antigravity (the agentic IDE / browser companion) and evaluates them against the Phoenix firewall before they run.

## Integration surfaces

Antigravity exposes two relevant hook points:

### 1. Pre-tool-execution shell hook (`pre-tool-use.sh`)

Antigravity's CLI agent honours `~/.config/antigravity/hooks/pre-tool-use` (Linux/macOS) or `%APPDATA%\Antigravity\hooks\pre-tool-use.cmd` (Windows). The script receives the proposed tool invocation on stdin and returns exit code 0 (allow) or 2 (block).

This wrapper delegates to the same shared evaluator used by `hooks/claude-code/` to keep behaviour consistent across coding agents.

Install:
```bash
mkdir -p ~/.config/antigravity/hooks
ln -sf "$(pwd)/pre-tool-use.sh" ~/.config/antigravity/hooks/pre-tool-use
chmod +x pre-tool-use.sh
```

### 2. Workspace-level `antigravity.config.json`

For Antigravity's IDE mode, register the same hook in workspace config so block decisions surface as inline IDE diagnostics rather than terminal errors. See `config-snippet.json`.

## Bridge discovery (PRD R-FUNC-092)

When `/etc/phoenix-firewall/agent-bridge.json` (Linux/macOS) or `%PROGRAMDATA%\PhoenixFirewall\agent-bridge.json` (Windows) is present and `PHOENIX_BRIDGE_AUTO != false`, the hook calls the local v4 worker via `phoenix-firewall agent-bridge` rather than the backend `/api/v1/firewall/evaluate` endpoint. This avoids double-counting verdicts when v4 endpoint mode is also active (see PRD R-FUNC-091, R-FUNC-094).

## Environment variables

Identical surface to `hooks/claude-code/` — `PHOENIX_API_KEY`, `PHOENIX_API_URL`, `PHOENIX_STRICT`, `PHOENIX_BRIDGE_AUTO`.

## Status

Scaffolded — implementations track PRD-SCF-001-v4 §1.10 R-FUNC-093. Parity with `hooks/claude-code/` is the v4 GA exit criterion.
