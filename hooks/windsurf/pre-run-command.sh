#!/usr/bin/env bash
set -euo pipefail
# -----------------------------------------------------------------------
# Phoenix Security Blue Shield - Firewall — Windsurf pre_run_command Hook
#
# Intercepts package-install commands and evaluates them against the
# Phoenix firewall API before execution.
#
# Windsurf passes the command as the first argument ($1) or via
# PRE_RUN_COMMAND env var depending on version.
#
# Exit codes:
#   0 — allow
#   2 — deny (block the command)
#
# Environment variables:
#   PHOENIX_API_KEY   — (required) API key for the firewall endpoint
#   PHOENIX_API_URL   — (optional) default https://api.phxintel.security
#   PHOENIX_STRICT    — (optional) "true" = fail-closed when API unreachable
# -----------------------------------------------------------------------

COMMAND="${1:-${PRE_RUN_COMMAND:-}}"

INSTALL_RE='(npm install|npm add|pip install|yarn add|pnpm add|cargo add|gem install|uv pip install|poetry add)'

if ! echo "$COMMAND" | grep -qEi "$INSTALL_RE"; then
    exit 0
fi

# Extract packages (skip flags)
PACKAGES=""
CAPTURE=false
for token in $COMMAND; do
    if $CAPTURE; then
        case "$token" in
            -*) continue ;;
            *)  PACKAGES="${PACKAGES:+$PACKAGES }$token" ;;
        esac
    fi
    case "$token" in
        install|add) CAPTURE=true ;;
    esac
done

if [ -z "$PACKAGES" ]; then
    exit 0
fi

# Detect ecosystem
detect_ecosystem() {
    case "$COMMAND" in
        *npm*|*yarn*|*pnpm*) echo "npm" ;;
        *pip*|*uv*|*poetry*) echo "pypi" ;;
        *cargo*)             echo "crates.io" ;;
        *gem*)               echo "rubygems" ;;
        *)                   echo "unknown" ;;
    esac
}
ECOSYSTEM=$(detect_ecosystem)

# Build JSON payload
PKGS_JSON="["
FIRST=true
for pkg in $PACKAGES; do
    PKG_NAME="${pkg%%@*}"
    PKG_VERSION="${pkg#*@}"
    [ "$PKG_VERSION" = "$pkg" ] && PKG_VERSION="latest"

    if $FIRST; then FIRST=false; else PKGS_JSON="${PKGS_JSON},"; fi
    PKGS_JSON="${PKGS_JSON}{\"ecosystem\":\"${ECOSYSTEM}\",\"name\":\"${PKG_NAME}\",\"version\":\"${PKG_VERSION}\"}"
done
PKGS_JSON="${PKGS_JSON}]"

PAYLOAD="{\"packages\":${PKGS_JSON}}"

# Call firewall API
API_URL="${PHOENIX_API_URL:-https://api.phxintel.security}"
EVALUATE_URL="${API_URL}/api/v1/firewall/evaluate"

if [ -z "${PHOENIX_API_KEY:-}" ]; then
    >&2 echo "[phoenix-firewall] PHOENIX_API_KEY not set — skipping check"
    exit 0
fi

HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
    --max-time 10 \
    -X POST "$EVALUATE_URL" \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${PHOENIX_API_KEY}" \
    -d "$PAYLOAD" 2>/dev/null) || {
    if [ "${PHOENIX_STRICT:-false}" = "true" ]; then
        >&2 echo "[phoenix-firewall] API unreachable — blocking (strict mode)"
        exit 2
    fi
    exit 0
}

HTTP_BODY=$(echo "$HTTP_RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" -lt 200 ] || [ "$HTTP_CODE" -ge 300 ]; then
    if [ "${PHOENIX_STRICT:-false}" = "true" ]; then
        >&2 echo "[phoenix-firewall] API returned HTTP ${HTTP_CODE} — blocking (strict mode)"
        exit 2
    fi
    exit 0
fi

# Check for blocked packages
BLOCKED=""
if command -v jq >/dev/null 2>&1; then
    BLOCKED=$(echo "$HTTP_BODY" | jq -r '
        [.results[]? | select(.action == "block") |
         "Package \(.package): blocked by rule \(.matching_rules[0]?.name // "policy")"] | first // empty
    ' 2>/dev/null || true)
else
    if echo "$HTTP_BODY" | grep -q '"action"[[:space:]]*:[[:space:]]*"block"'; then
        BLOCKED="One or more packages blocked by Phoenix firewall policy"
    fi
fi

if [ -n "$BLOCKED" ]; then
    >&2 echo "[phoenix-firewall] BLOCKED: ${BLOCKED}"
    exit 2
fi

exit 0
