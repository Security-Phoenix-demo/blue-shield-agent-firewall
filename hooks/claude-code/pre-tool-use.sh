#!/usr/bin/env bash
set -euo pipefail
# -----------------------------------------------------------------------
# Phoenix Security Blue Shield - Firewall — Claude Code PreToolUse Hook
#
# Intercepts package-install commands (npm, pip, yarn, pnpm, cargo, gem,
# uv, poetry) and evaluates them against the Phoenix firewall API before
# the tool executes.
#
# Exit codes:
#   0 — allow (pass-through)
#   2 — deny  (block the tool call)
#
# Wiring (add to ~/.claude/settings.json):
#   See settings-snippet.json in this directory.
#
# Environment variables:
#   PHOENIX_API_KEY   — (required) API key for the firewall endpoint
#   PHOENIX_API_URL   — (optional) base URL, default https://api.phxintel.security
#   PHOENIX_STRICT    — (optional) "true" = fail-closed when API unreachable
# -----------------------------------------------------------------------

# The hook receives the tool input via environment / stdin.
# Claude Code passes the Bash command as $TOOL_INPUT.
TOOL_INPUT="${TOOL_INPUT:-}"

# -----------------------------------------------------------------------
# 1. Pattern-match for install commands
# -----------------------------------------------------------------------
INSTALL_RE='(npm install|npm add|pip install|yarn add|pnpm add|cargo add|gem install|uv pip install|poetry add)'

if ! echo "$TOOL_INPUT" | grep -qEi "$INSTALL_RE"; then
    exit 0  # not an install command — allow
fi

# -----------------------------------------------------------------------
# 2. Extract package names (strip flags that start with -)
# -----------------------------------------------------------------------
# Remove the install command prefix, then split remaining tokens.
PACKAGES=""
CAPTURE=false
for token in $TOOL_INPUT; do
    if $CAPTURE; then
        # Skip flags
        case "$token" in
            -*) continue ;;
            *)  PACKAGES="${PACKAGES:+$PACKAGES }$token" ;;
        esac
    fi
    # Start capturing after the install verb
    case "$token" in
        install|add) CAPTURE=true ;;
    esac
done

if [ -z "$PACKAGES" ]; then
    exit 0  # no package names found — allow
fi

# -----------------------------------------------------------------------
# 3. Determine ecosystem from the command
# -----------------------------------------------------------------------
detect_ecosystem() {
    case "$TOOL_INPUT" in
        *npm*|*yarn*|*pnpm*) echo "npm" ;;
        *pip*|*uv*|*poetry*) echo "pypi" ;;
        *cargo*)             echo "crates.io" ;;
        *gem*)               echo "rubygems" ;;
        *)                   echo "unknown" ;;
    esac
}
ECOSYSTEM=$(detect_ecosystem)

# -----------------------------------------------------------------------
# 4. Build JSON payload
# -----------------------------------------------------------------------
# Build a JSON array of package objects.
PKGS_JSON="["
FIRST=true
for pkg in $PACKAGES; do
    # Split name@version if present
    PKG_NAME="${pkg%%@*}"
    PKG_VERSION="${pkg#*@}"
    [ "$PKG_VERSION" = "$pkg" ] && PKG_VERSION="latest"

    if $FIRST; then FIRST=false; else PKGS_JSON="${PKGS_JSON},"; fi
    PKGS_JSON="${PKGS_JSON}{\"ecosystem\":\"${ECOSYSTEM}\",\"name\":\"${PKG_NAME}\",\"version\":\"${PKG_VERSION}\"}"
done
PKGS_JSON="${PKGS_JSON}]"

PAYLOAD="{\"packages\":${PKGS_JSON}}"

# -----------------------------------------------------------------------
# 5. Call the Phoenix firewall evaluate endpoint
# -----------------------------------------------------------------------
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
    # API unreachable
    if [ "${PHOENIX_STRICT:-false}" = "true" ]; then
        >&2 echo "[phoenix-firewall] API unreachable and PHOENIX_STRICT=true — blocking"
        exit 2
    fi
    exit 0  # fail-open
}

HTTP_BODY=$(echo "$HTTP_RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n 1)

# -----------------------------------------------------------------------
# 6. Interpret the response
# -----------------------------------------------------------------------
if [ "$HTTP_CODE" -lt 200 ] || [ "$HTTP_CODE" -ge 300 ]; then
    if [ "${PHOENIX_STRICT:-false}" = "true" ]; then
        >&2 echo "[phoenix-firewall] API returned HTTP ${HTTP_CODE} — blocking (strict mode)"
        exit 2
    fi
    exit 0  # fail-open on non-2xx
fi

# Check for "block" action in any result
BLOCKED_PKG=""
BLOCK_REASON=""
if command -v jq >/dev/null 2>&1; then
    BLOCKED_PKG=$(echo "$HTTP_BODY" | jq -r '
        [.results[]? | select(.action == "block") | .package] | first // empty
    ' 2>/dev/null || true)
    BLOCK_REASON=$(echo "$HTTP_BODY" | jq -r '
        [.results[]? | select(.action == "block") |
         "Package \(.package): blocked by rule \(.matching_rules[0]?.name // "policy")"] | first // empty
    ' 2>/dev/null || true)
else
    # Fallback: simple grep for "block"
    if echo "$HTTP_BODY" | grep -q '"action"[[:space:]]*:[[:space:]]*"block"'; then
        BLOCKED_PKG="(unknown — install jq for details)"
        BLOCK_REASON="One or more packages blocked by Phoenix firewall policy"
    fi
fi

if [ -n "$BLOCKED_PKG" ]; then
    >&2 echo "[phoenix-firewall] BLOCKED: ${BLOCK_REASON}"
    exit 2
fi

# All packages allowed
exit 0
