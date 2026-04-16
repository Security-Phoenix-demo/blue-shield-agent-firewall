---
name: phoenix-security:audit-lockfile
description: Scan an entire lockfile (package-lock.json, requirements.txt, etc.) for supply chain risks before committing or pushing.
---

# Audit Lockfile

Scan all dependencies in a lockfile for malware, vulnerabilities, and policy violations.

## Steps

1. Identify the lockfile to scan (e.g., `package-lock.json`, `requirements.txt`, `Cargo.lock`, `go.sum`)
2. Call the `phoenix_check_lockfile` MCP tool with all package URLs from the lockfile
3. Review the aggregate results:
   - If any packages are **blocked**: list them with reasons. Do NOT commit until resolved.
   - If packages are **warned**: list them with context. Recommend upgrades where safe versions exist.
   - Report the summary: total packages, blocked count, warned count, clean count.
4. If the MCP tool is unavailable, use the CLI:
   ```bash
   npx @phoenix-security/cli scan package-lock.json
   ```

## When to Use

- Before `git commit` when lockfile has changed
- Before opening a pull request
- When onboarding to a new project
- During periodic security audits
- After running `npm install` or equivalent that modified the lockfile
