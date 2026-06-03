---
name: phoenix-security:vet-dependency
description: Check a package against Phoenix Security Blue Shield - Firewall before adding it as a dependency. Call this before any npm install, pip install, or similar command.
---

# Vet Dependency

Before adding any package dependency, check it against the Phoenix Security Blue Shield - Firewall.

## Steps

1. Identify the package being added (ecosystem, name, version)
2. Call the `phoenix_check_package` MCP tool with the package URL:
   - Format: `pkg:<ecosystem>/<name>@<version>` (e.g., `pkg:npm/axios@1.7.0`)
3. Read the response:
   - If `action` is **block**: DO NOT install. Read `for_llm_reasoning` for why. Use the suggested alternative from `remediation.alternatives`.
   - If `action` is **warn**: Show the warning context to the developer. Suggest the safe version from `remediation.safe_versions` if available.
   - If `action` is **allow**: Proceed with installation.
4. If the MCP tool is unavailable, fall back to `curl`:
   ```bash
   curl -s -X POST "${PHOENIX_API_URL:-https://api.phxintel.security}/api/v1/firewall/evaluate" \
     -H "Content-Type: application/json" \
     -H "x-api-key: ${PHOENIX_API_KEY}" \
     -d '{"packages":[{"ecosystem":"npm","name":"<pkg>","version":"<ver>"}]}'
   ```

## When to Use

- Before running `npm install`, `pip install`, `yarn add`, `pnpm add`, `cargo add`, `gem install`, `poetry add`, `uv pip install`
- When a user asks you to add a dependency
- When you discover a package you want to use during implementation
