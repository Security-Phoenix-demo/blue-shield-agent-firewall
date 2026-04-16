---
name: phoenix-security:remediate-vuln
description: Get remediation guidance for a blocked or warned package — find safe versions, alternatives, and migration paths.
---

# Remediate Vulnerability

When a package is blocked or warned by the firewall, get detailed remediation guidance.

## Steps

1. Identify the blocked/warned package (from a `phoenix_check_package` result or CI scan output)
2. Call `phoenix_get_alternatives` MCP tool with the ecosystem and package name to get safe alternatives
3. If the issue is a known vulnerability (not malware):
   - Check if `remediation.safe_versions` exists in the verdict — upgrade to the safe version
   - Use `remediation.version_command` if provided (e.g., `npm install lodash@4.17.21`)
   - Check `remediation.breaking_changes` before upgrading
4. If the issue is confirmed malware:
   - NEVER install the package, even temporarily
   - Use the suggested alternative from `remediation.alternatives`
   - If alternatives exist, compare their PS-OSS scores and pick the one with lowest risk
5. If no alternative exists:
   - Check if the vulnerability has a patch in progress
   - Consider whether the vulnerable code path is actually reachable
   - Document the accepted risk if proceeding

## When to Use

- After `phoenix-security:vet-dependency` returns a block or warn
- After `phoenix-security:audit-lockfile` finds issues
- When a CI pipeline fails due to a firewall rule
- When investigating a security alert about a dependency
