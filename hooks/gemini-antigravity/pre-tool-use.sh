#!/usr/bin/env bash
# Phoenix Security Blue Shield - Firewall — Gemini Antigravity pre-tool-use hook.
#
# Antigravity passes the proposed tool invocation on stdin (JSON) or via
# $ANTIGRAVITY_TOOL_INPUT env var. We forward the install command text to the
# shared evaluator under hooks/claude-code/pre-tool-use.sh which already
# encapsulates: pattern-match, package parse, ecosystem detect, JSON build,
# bridge-vs-backend dispatch, response interpretation.
#
# Exit codes:
#   0 — allow
#   2 — deny

set -euo pipefail

# Antigravity stdin payload looks like: {"tool": "Bash", "input": {"command": "..."}}
if [ -t 0 ]; then
    TOOL_INPUT="${ANTIGRAVITY_TOOL_INPUT:-}"
else
    PAYLOAD=$(cat)
    if command -v jq >/dev/null 2>&1; then
        TOOL_INPUT=$(echo "$PAYLOAD" | jq -r '.input.command // .input.cmd // empty' 2>/dev/null || true)
    else
        # Fallback: best-effort grep-extract
        TOOL_INPUT=$(echo "$PAYLOAD" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    fi
fi

if [ -z "${TOOL_INPUT:-}" ]; then
    exit 0
fi

export TOOL_INPUT
exec "$(dirname "${BASH_SOURCE[0]}")/../claude-code/pre-tool-use.sh"
