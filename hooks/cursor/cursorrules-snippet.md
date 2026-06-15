# Phoenix Security Blue Shield - Firewall — Cursor Rules Fragment

Add the following to your project's `.cursorrules` file to instruct Cursor
to check packages against the Phoenix firewall before installing them.

---

```
## Supply Chain Security (Phoenix Security Blue Shield - Firewall)

Before adding any dependency via `npm install`, `pip install`, `yarn add`,
`pnpm add`, `cargo add`, `gem install`, `uv pip install`, or `poetry add`:

1. Call the Phoenix Security firewall API to check the package:

   POST ${PHOENIX_API_URL:-https://phxintel.security}/api/v1/firewall/evaluate
   Headers: x-api-key: <from PHOENIX_API_KEY env var>
   Body: {"packages": [{"ecosystem": "<npm|pypi|crates.io|rubygems>", "name": "<pkg>", "version": "<ver>"}]}

2. If the response contains "action": "block" for any package:
   - Do NOT install the package.
   - Report the block reason to the user.
   - Suggest alternatives from the response if available.

3. If the response contains "action": "warn":
   - Show the warning and ask the user before proceeding.

4. If the API is unreachable:
   - Proceed with the install (fail-open) unless the project has
     PHOENIX_STRICT=true, in which case abort.

5. Never log or display the PHOENIX_API_KEY value.

If the Phoenix MCP server is configured, prefer using the `phoenix_check_package`
MCP tool instead of calling the REST API directly.
```
