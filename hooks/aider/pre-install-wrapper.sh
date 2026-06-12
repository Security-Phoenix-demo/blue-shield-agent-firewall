#!/usr/bin/env bash
set -euo pipefail
# -----------------------------------------------------------------------------
# Phoenix Security Blue Shield - Firewall — Aider Pre-Install Wrapper
#
# Wraps pip/npm/yarn/pnpm/etc. so every install is checked against the Phoenix
# firewall before the real package manager runs.
#
# Usage:
#   1. Place this script on your PATH (or alias the package manager to it).
#   2. Set PHOENIX_API_KEY in your environment.
#   3. Run: ./pre-install-wrapper.sh npm install lodash
#           ./pre-install-wrapper.sh pip install requests
#
# If a package is blocked (or the firewall fails closed) the wrapper exits
# non-zero WITHOUT running the install. Otherwise it execs the original command.
# Detection / fail-mode logic lives in the shared library (fail-CLOSED default).
# -----------------------------------------------------------------------------

if [ "$#" -lt 1 ]; then
    >&2 echo "Usage: $0 <package-manager> <install|add> [packages...]"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHOENIX_FW_LIB="${PHOENIX_FW_LIB:-$SCRIPT_DIR/../lib/phoenix-firewall.sh}"
if [ ! -r "$PHOENIX_FW_LIB" ]; then
    >&2 echo "[phoenix-firewall] FATAL: evaluation library not found at $PHOENIX_FW_LIB"
    exit 2   # fail closed: never run the install if enforcement is unavailable
fi
# shellcheck source=/dev/null
. "$PHOENIX_FW_LIB"

# Evaluate the reconstructed command line, but EXEC the original argv verbatim
# (preserving quoting/spacing) so we never re-split or glob the user's command.
if phoenix_fw_evaluate "$*"; then
    exec "$@"
fi

>&2 echo "[phoenix-firewall] Install aborted — review firewall rules or use an approved alternative."
exit 2
