#!/usr/bin/env bash
set -euo pipefail
# -----------------------------------------------------------------------------
# Phoenix Security Blue Shield - Firewall — Windsurf pre_run_command Hook
#
# Intercepts package-install commands and evaluates them against the Phoenix
# firewall API before execution. Windsurf passes the command as the first
# argument ($1) or via PRE_RUN_COMMAND depending on version.
#
# Exit codes:  0 — allow   2 — deny (block the command)
#
# Detection / payload / fail-mode logic lives in the shared library (fail-CLOSED
# by default). See the library header and README for the override env vars.
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHOENIX_FW_LIB="${PHOENIX_FW_LIB:-$SCRIPT_DIR/../lib/phoenix-firewall.sh}"
if [ ! -r "$PHOENIX_FW_LIB" ]; then
    >&2 echo "[phoenix-firewall] FATAL: evaluation library not found at $PHOENIX_FW_LIB"
    exit 2
fi
# shellcheck source=/dev/null
. "$PHOENIX_FW_LIB"

phoenix_fw_evaluate "${1:-${PRE_RUN_COMMAND:-}}"
exit $?
