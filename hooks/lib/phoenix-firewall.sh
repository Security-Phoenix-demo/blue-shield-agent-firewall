#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Phoenix Security Blue Shield - Firewall — shared evaluation library
#
# Single source of truth for every per-agent hook (Claude Code, Codex, Windsurf,
# Aider, GitHub Copilot, Gemini Antigravity). Hooks source this file and call
# `phoenix_fw_evaluate "<command-line>"`.
#
# Return contract for phoenix_fw_evaluate:
#   0 — allow  (not an install command, or every package was allowed)
#   2 — deny   (a package was blocked, OR a fail-closed decision was taken)
#
# SECURITY POSTURE (see README "Fail mode"):
#   This is a *blocking* control. On any inability to obtain a verdict it FAILS
#   CLOSED by default — an attacker who degrades the policy API must NOT be able
#   to wave installs through. Override only deliberately:
#
#   PHOENIX_FAIL_OPEN=true   allow installs when the API is unreachable / errors
#                            (default: false → block)
#   PHOENIX_REQUIRE_KEY=true block installs when no API key is configured
#                            (default: false → loud warning + allow, since a
#                            missing key is a setup state, not a remote attack)
#   PHOENIX_STRICT=true      legacy switch: forces fail-closed AND require-key
#
# Env:
#   PHOENIX_API_KEY  (required for enforcement)
#   PHOENIX_API_URL  (default https://phxintel.security)
# -----------------------------------------------------------------------------

# Do not inherit a fragile shell state from the caller; be defensive instead.
set -o pipefail 2>/dev/null || true

PHOENIX_FW_DEFAULT_API_URL="https://phxintel.security"
PHOENIX_FW_TAG="[phoenix-firewall]"

# --- fail-mode resolution -----------------------------------------------------
_phoenix_fw_truthy() { case "${1:-}" in true|TRUE|1|yes|YES|on|ON) return 0 ;; *) return 1 ;; esac; }

# returns 0 when we should ALLOW on infrastructure error (fail-open)
_phoenix_fw_fail_open() {
    _phoenix_fw_truthy "${PHOENIX_STRICT:-}" && return 1   # strict forces closed
    _phoenix_fw_truthy "${PHOENIX_FAIL_OPEN:-}" && return 0
    return 1                                               # default: fail closed
}
# returns 0 when a missing API key should BLOCK
_phoenix_fw_require_key() {
    _phoenix_fw_truthy "${PHOENIX_STRICT:-}" && return 0
    _phoenix_fw_truthy "${PHOENIX_REQUIRE_KEY:-}" && return 0
    return 1
}

# Decide the exit code for an infrastructure error (no verdict obtainable).
# $1 = human-readable reason
_phoenix_fw_on_infra_error() {
    local reason="$1"
    if _phoenix_fw_fail_open; then
        >&2 echo "${PHOENIX_FW_TAG} WARNING: ${reason} — allowing (PHOENIX_FAIL_OPEN). Firewall did NOT verify this install."
        return 0
    fi
    >&2 echo "${PHOENIX_FW_TAG} BLOCKED (fail-closed): ${reason}. Set PHOENIX_FAIL_OPEN=true to allow installs when the firewall cannot verify."
    return 2
}

# --- command parsing ----------------------------------------------------------
# Normalise: collapse all whitespace runs to single spaces.
_phoenix_fw_norm() {
    # shellcheck disable=SC2001
    printf '%s' "$1" | tr '\t\r\n' '   ' | sed -e 's/  */ /g' -e 's/^ //' -e 's/ $//'
}

# Parse a normalised command. Sets globals:
#   FW_ECOSYSTEM   npm|pypi|crates.io|rubygems  ("" if not an install)
#   FW_PACKAGES    space-separated raw package tokens ("" if none)
# Detection requires the install verb to immediately follow a known package
# manager (modulo flags), which prevents false positives like `npm run i`.
_phoenix_fw_parse() {
    FW_ECOSYSTEM=""; FW_PACKAGES=""
    local cmd; cmd="$(_phoenix_fw_norm "$1")"
    [ -z "$cmd" ] && return 0

    local state=0 mgr="" eco=""
    set -f                       # CRITICAL: no glob expansion of untrusted tokens
    # shellcheck disable=SC2086
    set -- $cmd
    local tok
    while [ "$#" -gt 0 ]; do
        tok="$1"; shift
        if [ "$state" = "2" ]; then
            case "$tok" in
                '&&'|'||'|';'|'|'|'&') state=0; mgr=""; eco="" ;;   # next command
                -*) : ;;                                            # skip flags
                *)  FW_PACKAGES="${FW_PACKAGES:+$FW_PACKAGES }$tok" ;;
            esac
            continue
        fi
        if [ "$state" = "1" ]; then
            case "$tok" in
                -*) continue ;;                                     # global flag before verb
                install|i|in|add|isntall)                           # verb (+ common typo)
                    state=2; eco="$mgr_eco"; FW_ECOSYSTEM="$eco"; continue ;;
                *) state=0; mgr=""; eco="" ;;                       # not a verb → fall through
            esac
        fi
        # state 0: look for a package manager
        case "$tok" in
            npm|pnpm|bun|yarn|deno) mgr="$tok"; mgr_eco="npm"; state=1 ;;
            pip|pip3|pipx|uv|poetry) mgr="$tok"; mgr_eco="pypi"; state=1 ;;
            cargo) mgr="$tok"; mgr_eco="crates.io"; state=1 ;;
            gem) mgr="$tok"; mgr_eco="rubygems"; state=1 ;;
        esac
    done
    set +f
    return 0
}

# Split a raw package token into FW_NAME / FW_VER for the current FW_ECOSYSTEM.
_phoenix_fw_split_pkg() {
    local raw="$1"; FW_NAME="$raw"; FW_VER="latest"
    case "$FW_ECOSYSTEM" in
        pypi)
            # strip extras and PEP440 version specifiers: name[extra]==1,>=,<=,~=,!=,>,<
            FW_NAME="${raw%%[*}"
            case "$FW_NAME" in
                *"=="*) FW_VER="${FW_NAME#*==}"; FW_NAME="${FW_NAME%%==*}" ;;
                *">="*) FW_NAME="${FW_NAME%%>=*}" ;;
                *"<="*) FW_NAME="${FW_NAME%%<=*}" ;;
                *"~="*) FW_NAME="${FW_NAME%%~=*}" ;;
                *"!="*) FW_NAME="${FW_NAME%%!=*}" ;;
                *">"*)  FW_NAME="${FW_NAME%%>*}" ;;
                *"<"*)  FW_NAME="${FW_NAME%%<*}" ;;
            esac
            ;;
        npm)
            case "$raw" in
                @*/*@*) FW_NAME="@${raw#@}"; FW_NAME="${FW_NAME%@*}"; FW_VER="${raw##*@}" ;;
                @*/*)   FW_NAME="$raw" ;;
                *@*)    FW_NAME="${raw%@*}"; FW_VER="${raw##*@}" ;;
            esac
            ;;
        *)
            case "$raw" in *@*) FW_NAME="${raw%@*}"; FW_VER="${raw##*@}" ;; esac
            ;;
    esac
    [ -n "$FW_VER" ] || FW_VER="latest"
}

# Strict allowlist used only for the no-jq JSON fallback.
_phoenix_fw_safe_token() {
    case "$1" in
        *[!A-Za-z0-9._/@+~^*-]*) return 1 ;;   # anything outside the safe set
        '') return 1 ;;
        *) return 0 ;;
    esac
}

# Build the JSON payload from FW_PACKAGES. Prints payload on stdout.
# Returns non-zero if a token cannot be encoded safely (→ caller fails closed).
_phoenix_fw_build_payload() {
    local pkg first=1 items=""
    if command -v jq >/dev/null 2>&1; then
        for pkg in $FW_PACKAGES; do
            _phoenix_fw_split_pkg "$pkg"
            local obj
            obj="$(jq -cn --arg e "$FW_ECOSYSTEM" --arg n "$FW_NAME" --arg v "$FW_VER" \
                '{ecosystem:$e,name:$n,version:$v}')" || return 1
            items="${items:+$items,}$obj"
        done
        printf '{"packages":[%s]}' "$items"
        return 0
    fi
    # Fallback without jq: only emit tokens that pass the strict allowlist,
    # otherwise fail closed rather than build malformed/injectable JSON.
    for pkg in $FW_PACKAGES; do
        _phoenix_fw_split_pkg "$pkg"
        _phoenix_fw_safe_token "$FW_NAME" || return 1
        _phoenix_fw_safe_token "$FW_VER"  || return 1
        items="${items:+$items,}{\"ecosystem\":\"${FW_ECOSYSTEM}\",\"name\":\"${FW_NAME}\",\"version\":\"${FW_VER}\"}"
        first=0
    done
    printf '{"packages":[%s]}' "$items"
    return 0
}

# --- API call -----------------------------------------------------------------
# Calls the evaluate endpoint. Echoes "HTTP_CODE\nBODY" semantics via globals:
#   FW_HTTP_CODE, FW_HTTP_BODY. Returns non-zero only on transport failure.
_phoenix_fw_call_api() {
    local payload="$1"
    local api_url="${PHOENIX_API_URL:-$PHOENIX_FW_DEFAULT_API_URL}"
    local url="${api_url%/}/api/v1/firewall/evaluate"
    local resp
    # Pass the secret header via stdin config (-K -) so the API key never lands
    # in the process argument list (visible to `ps`).
    resp="$(printf 'header = "x-api-key: %s"\n' "${PHOENIX_API_KEY}" | curl -s \
        -w '\n%{http_code}' --max-time 10 -K - \
        -H 'Content-Type: application/json' \
        -X POST "$url" \
        -d "$payload" 2>/dev/null)" || return 1
    FW_HTTP_CODE="${resp##*$'\n'}"
    FW_HTTP_BODY="${resp%$'\n'*}"
    return 0
}

# Inspect a response body for a blocked package. Echoes a reason if blocked.
_phoenix_fw_blocked_reason() {
    local body="$1"
    if command -v jq >/dev/null 2>&1; then
        printf '%s' "$body" | jq -r '
            [.results[]? | select(.action=="block")
             | "\(.package // "package"): \(.matching_rules[0]?.name // .context.for_llm_reasoning // "policy violation")"]
            | first // empty' 2>/dev/null || true
    else
        if printf '%s' "$body" | grep -q '"action"[[:space:]]*:[[:space:]]*"block"'; then
            printf 'one or more packages blocked by policy (install jq for detail)'
        fi
    fi
}

# --- public entry point -------------------------------------------------------
# phoenix_fw_evaluate "<command line>"  → returns 0 (allow) or 2 (deny)
phoenix_fw_evaluate() {
    _phoenix_fw_parse "$1"
    [ -z "$FW_ECOSYSTEM" ] && return 0          # not an install command
    [ -z "$FW_PACKAGES" ] && return 0           # install verb but no named packages

    if [ -z "${PHOENIX_API_KEY:-}" ]; then
        if _phoenix_fw_require_key; then
            >&2 echo "${PHOENIX_FW_TAG} BLOCKED: PHOENIX_API_KEY not set and PHOENIX_REQUIRE_KEY/STRICT enabled."
            return 2
        fi
        >&2 echo "${PHOENIX_FW_TAG} WARNING: PHOENIX_API_KEY not set — firewall is INACTIVE, install NOT verified."
        return 0
    fi

    local payload
    if ! payload="$(_phoenix_fw_build_payload)"; then
        _phoenix_fw_on_infra_error "could not safely encode package names"; return $?
    fi

    if ! _phoenix_fw_call_api "$payload"; then
        _phoenix_fw_on_infra_error "policy API unreachable"; return $?
    fi
    case "$FW_HTTP_CODE" in
        2[0-9][0-9]) : ;;
        *) _phoenix_fw_on_infra_error "policy API returned HTTP ${FW_HTTP_CODE:-?}"; return $? ;;
    esac

    local reason; reason="$(_phoenix_fw_blocked_reason "$FW_HTTP_BODY")"
    if [ -n "$reason" ]; then
        >&2 echo "${PHOENIX_FW_TAG} BLOCKED: ${reason}"
        return 2
    fi
    return 0
}
