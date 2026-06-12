#!/usr/bin/env bash
set -euo pipefail
# -----------------------------------------------------------------------------
# Phoenix Security Blue Shield - Firewall — Claude Code PreToolUse Hook
#
# Intercepts package-install commands (npm/pnpm/yarn/bun/deno, pip/uv/poetry,
# cargo, gem — including short forms like `npm i` and `pip3 install`) and
# evaluates them against the Phoenix firewall API before the tool executes.
#
# Exit codes:  0 — allow (pass-through)   2 — deny (block the tool call)
#
# Wiring (add to ~/.claude/settings.json): see settings-snippet.json here.
#
# All detection / payload / fail-mode logic lives in the shared library so every
# agent hook behaves identically. Fail mode is CLOSED by default — see the
# library header and README for PHOENIX_FAIL_OPEN / PHOENIX_REQUIRE_KEY / STRICT.
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Allow an override so a flattened install (CLI install-hooks) can point at a
# co-located copy of the library.
PHOENIX_FW_LIB="${PHOENIX_FW_LIB:-$SCRIPT_DIR/../lib/phoenix-firewall.sh}"
if [ ! -r "$PHOENIX_FW_LIB" ]; then
    >&2 echo "[phoenix-firewall] FATAL: evaluation library not found at $PHOENIX_FW_LIB"
    # Fail closed: a missing enforcement library must not silently allow installs.
    exit 2
fi
# shellcheck source=/dev/null
. "$PHOENIX_FW_LIB"

# Claude Code passes the Bash command as $TOOL_INPUT.
phoenix_fw_evaluate "${TOOL_INPUT:-}"
exit $?
