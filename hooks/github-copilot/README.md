# GitHub Copilot — Phoenix Security Blue Shield - Firewall hook

Intercepts package-install commands suggested by GitHub Copilot (in VS Code, Visual Studio, and the `gh copilot` CLI) and evaluates them against the Phoenix firewall before they reach a terminal.

## Three integration surfaces

GitHub Copilot does not expose a single uniform hook system; this directory ships three thin wrappers, one per surface.

### 1. `gh copilot` CLI — pre-exec wrapper (`pre-suggest.sh`)

`gh copilot suggest` / `gh copilot explain` write proposed commands to stdout but do not execute them — the user copies/pastes. The wrapper intercepts the copy step by registering a `gh-copilot` shell function that pipes Copilot's suggestion through `phoenix-firewall agent-bridge` (v4 endpoint mode) or directly to the backend `/api/v1/firewall/evaluate` (no-endpoint mode) before printing it. Blocked suggestions are replaced with a Phoenix policy explanation.

Install:
```bash
echo 'source /opt/phoenix-firewall/agents-hub/github-copilot/pre-suggest.sh' >> ~/.bashrc
```

### 2. VS Code — task pre-launch task

VS Code Copilot Chat's `@workspace /run` and `@terminal` features can be gated with a workspace-level `pre-launch task`. Drop `.vscode/tasks.json` from `vscode-tasks-snippet.json` into the workspace; the task runs `pre-tool-use.sh` (shared with `hooks/claude-code/`) before any `npm install`-class command.

### 3. Visual Studio (Windows) — extension pre-execute event

Visual Studio's Copilot extension fires a `CopilotChatPreExecute` ETW event. The PowerShell handler at `ps-pre-execute.ps1` filters install commands and calls the same evaluate endpoint. Register via `Register-EngineEvent` in the user's PowerShell profile.

## Environment variables (all three surfaces)

| Var | Default | Purpose |
|---|---|---|
| `PHOENIX_API_KEY` | (required if no v4 endpoint) | API key for the firewall endpoint |
| `PHOENIX_API_URL` | `https://api.phxintel.security` | Backend base URL |
| `PHOENIX_STRICT` | `false` | Fail-closed when API unreachable |
| `PHOENIX_BRIDGE_AUTO` | `true` | If `/etc/phoenix-firewall/agent-bridge.json` exists, call local v4 worker instead of backend (per PRD R-FUNC-092) |

## Status

Scaffolded — implementations track PRD-SCF-001-v4 §1.10 R-FUNC-093. Functional coverage parity with `hooks/claude-code/` is the v4 GA exit criterion.
