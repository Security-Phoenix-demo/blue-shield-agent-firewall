#!/usr/bin/env bash
set -euo pipefail
# -----------------------------------------------------------------------
# Phoenix Supply Chain Firewall — Aider Pre-Install Wrapper
#
# Wraps pip/npm/yarn/pnpm so that every install is checked against the
# Phoenix firewall API before the real package manager runs.
#
# Usage:
#   1. Place this script on your PATH (or alias the package manager).
#   2. Set PHOENIX_API_KEY in your environment.
#   3. Run: ./pre-install-wrapper.sh npm install lodash
#      or:  ./pre-install-wrapper.sh pip install requests
#
# The wrapper calls the firewall evaluate endpoint. If any package is
# blocked, it prints the reason to stderr and exits non-zero.
# Otherwise it runs the original command.
#
# Environment variables:
#   PHOENIX_API_KEY   — (required) API key for the firewall endpoint
#   PHOENIX_API_URL   — (optional) default https://api.phxintel.security
#   PHOENIX_STRICT    — (optional) "true" = fail-closed when API unreachable
# -----------------------------------------------------------------------

if [ $# -lt 2 ]; then
    >&2 echo "Usage: $0 <package-manager> <install|add> [packages...]"
    exit 1
fi

ORIGINAL_CMD="$*"
PM="$1"
shift

# Detect ecosystem
detect_ecosystem() {
    case "$PM" in
        npm|yarn|pnpm) echo "npm" ;;
        pip|uv|poetry) echo "pypi" ;;
        cargo)         echo "crates.io" ;;
        gem)           echo "rubygems" ;;
        *)             echo "unknown" ;;
    esac
}
ECOSYSTEM=$(detect_ecosystem)

# Extract packages (skip the verb and flags)
PACKAGES=""
VERB_SEEN=false
for token in "$@"; do
    if ! $VERB_SEEN; then
        case "$token" in
            install|add|pip) VERB_SEEN=true ;;
        esac
        continue
    fi
    case "$token" in
        -*) continue ;;
        *)  PACKAGES="${PACKAGES:+$PACKAGES }$token" ;;
    esac
done

# If no packages found, just run the original command
if [ -z "$PACKAGES" ]; then
    exec $ORIGINAL_CMD
fi

# Skip check if no API key
if [ -z "${PHOENIX_API_KEY:-}" ]; then
    >&2 echo "[phoenix-firewall] PHOENIX_API_KEY not set — running without check"
    exec $ORIGINAL_CMD
fi

# Build JSON payload
PKGS_JSON="["
FIRST=true
for pkg in $PACKAGES; do
    PKG_NAME="${pkg%%@*}"
    PKG_NAME="${PKG_NAME%%==*}"
    PKG_NAME="${PKG_NAME%%>=*}"
    PKG_NAME="${PKG_NAME%%<=*}"
    PKG_VERSION="${pkg#*@}"
    [ "$PKG_VERSION" = "$pkg" ] && PKG_VERSION="latest"
    # Handle pip version specifiers
    if echo "$pkg" | grep -q '=='; then
        PKG_VERSION="${pkg#*==}"
    fi

    if $FIRST; then FIRST=false; else PKGS_JSON="${PKGS_JSON},"; fi
    PKGS_JSON="${PKGS_JSON}{\"ecosystem\":\"${ECOSYSTEM}\",\"name\":\"${PKG_NAME}\",\"version\":\"${PKG_VERSION}\"}"
done
PKGS_JSON="${PKGS_JSON}]"

PAYLOAD="{\"packages\":${PKGS_JSON}}"

# Call firewall API
API_URL="${PHOENIX_API_URL:-https://api.phxintel.security}"
EVALUATE_URL="${API_URL}/api/v1/firewall/evaluate"

HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
    --max-time 10 \
    -X POST "$EVALUATE_URL" \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${PHOENIX_API_KEY}" \
    -d "$PAYLOAD" 2>/dev/null) || {
    if [ "${PHOENIX_STRICT:-false}" = "true" ]; then
        >&2 echo "[phoenix-firewall] API unreachable — aborting (strict mode)"
        exit 1
    fi
    >&2 echo "[phoenix-firewall] API unreachable — proceeding (fail-open)"
    exec $ORIGINAL_CMD
}

HTTP_BODY=$(echo "$HTTP_RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" -lt 200 ] || [ "$HTTP_CODE" -ge 300 ]; then
    if [ "${PHOENIX_STRICT:-false}" = "true" ]; then
        >&2 echo "[phoenix-firewall] API returned HTTP ${HTTP_CODE} — aborting (strict mode)"
        exit 1
    fi
    >&2 echo "[phoenix-firewall] API returned HTTP ${HTTP_CODE} — proceeding (fail-open)"
    exec $ORIGINAL_CMD
fi

# Check for blocked packages
BLOCKED=""
if command -v jq >/dev/null 2>&1; then
    BLOCKED=$(echo "$HTTP_BODY" | jq -r '
        [.results[]? | select(.action == "block") |
         "  - \(.package): \(.matching_rules[0]?.name // "policy")"] | join("\n")
    ' 2>/dev/null || true)
else
    if echo "$HTTP_BODY" | grep -q '"action"[[:space:]]*:[[:space:]]*"block"'; then
        BLOCKED="One or more packages blocked by Phoenix firewall policy"
    fi
fi

if [ -n "$BLOCKED" ]; then
    >&2 echo "[phoenix-firewall] BLOCKED packages:"
    >&2 echo "$BLOCKED"
    >&2 echo ""
    >&2 echo "Install aborted. Review firewall rules or use approved alternatives."
    exit 1
fi

>&2 echo "[phoenix-firewall] All packages approved"
exec $ORIGINAL_CMD
