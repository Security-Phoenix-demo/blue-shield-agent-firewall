#!/usr/bin/env bash
# Phoenix Security Blue Shield - Firewall — `gh copilot` CLI pre-suggestion wrapper.
#
# Source this from ~/.bashrc / ~/.zshrc. It wraps ONLY `gh copilot suggest` and
# `gh copilot explain` so the suggested shell command is evaluated against the
# Phoenix firewall before it is printed. Every other `gh` invocation is passed
# straight through to the real binary unchanged.
#
# Exit codes (for the wrapped copilot calls):
#   0 — allow (suggestion printed)
#   2 — deny  (suggestion withheld with a policy explanation)

_phoenix_evaluate_suggestion() {
    # Reuse the shared evaluation logic from the claude-code hook.
    TOOL_INPUT="$1" \
        "$(dirname "${BASH_SOURCE[0]}")/../claude-code/pre-tool-use.sh"
}

# Wrap gh narrowly: only intercept the copilot subcommand; pass everything else
# (gh repo, gh pr, gh auth, ...) through to the real binary so we never break
# unrelated tooling or scripts that depend on `gh`.
gh() {
    if [ "$1" != "copilot" ]; then
        command gh "$@"
        return $?
    fi
    # $1 == copilot
    if [ "$2" != "suggest" ] && [ "$2" != "explain" ]; then
        command gh "$@"
        return $?
    fi
    local suggestion status
    suggestion="$(command gh "$@" 2>/dev/null)"; status=$?
    if [ "$status" -ne 0 ] || [ -z "$suggestion" ]; then
        return "$status"
    fi
    if _phoenix_evaluate_suggestion "$suggestion"; then
        printf '%s\n' "$suggestion"
    else
        printf '[phoenix-firewall] copilot suggestion withheld by policy.\n' >&2
        return 2
    fi
}
