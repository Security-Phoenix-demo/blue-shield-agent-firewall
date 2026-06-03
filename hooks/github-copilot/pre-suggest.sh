#!/usr/bin/env bash
# Phoenix Security Blue Shield - Firewall — `gh copilot` CLI pre-suggestion wrapper.
#
# Source this from ~/.bashrc / ~/.zshrc. It wraps `gh copilot suggest` and
# `gh copilot explain` so the suggested shell command is evaluated against
# the Phoenix firewall before it is printed to the user.
#
# Exit codes mirror hooks/claude-code/pre-tool-use.sh:
#   0 — allow (suggestion printed)
#   2 — deny  (suggestion replaced with policy explanation)
#
# Bridge discovery (PRD R-FUNC-092): when /etc/phoenix-firewall/agent-bridge.json
# exists and PHOENIX_BRIDGE_AUTO != false, the wrapper calls the local v4 worker
# via `phoenix-firewall agent-bridge` instead of the backend. Otherwise falls
# back to direct backend evaluate.

_phoenix_evaluate_suggestion() {
    local suggestion="$1"
    # Reuse the shared evaluation logic from claude-code hook by setting
    # TOOL_INPUT and invoking it.
    TOOL_INPUT="$suggestion" \
        "$(dirname "${BASH_SOURCE[0]}")/../claude-code/pre-tool-use.sh"
}

gh-copilot() {
    if [ "$1" != "suggest" ] && [ "$1" != "explain" ]; then
        command gh copilot "$@"
        return $?
    fi
    local suggestion
    suggestion=$(command gh copilot "$@" 2>/dev/null)
    if [ -z "$suggestion" ]; then
        return 1
    fi
    if _phoenix_evaluate_suggestion "$suggestion"; then
        printf '%s\n' "$suggestion"
    else
        printf '[phoenix-firewall] suggestion BLOCKED by policy:\n%s\n' "$suggestion" >&2
        return 2
    fi
}

# Optional alias so `gh copilot ...` also resolves to the wrapper
alias gh='gh-copilot'
