# Phoenix Security Blue Shield - Firewall — Cline Integration

Cline supports MCP natively. No custom hook script is needed.

## Setup

1. Configure the Phoenix MCP server in your Cline MCP settings:

```json
{
  "mcpServers": {
    "phoenix-firewall": {
      "command": "npx",
      "args": ["-y", "@phoenix-security/mcp-firewall"],
      "env": {
        "PHOENIX_API_KEY": "${PHOENIX_API_KEY}",
        "PHOENIX_API_URL": "https://phxintel.security"
      }
    }
  }
}
```

2. Cline will automatically discover the `phoenix_check_package` and
   `phoenix_check_lockfile` tools from the MCP server.

3. When Cline proposes installing a dependency, it will call
   `phoenix_check_package` first and respect block/warn verdicts.

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `phoenix_check_package` | Check a single package against firewall rules |
| `phoenix_check_lockfile` | Batch-check an array of package URLs |
| `phoenix_get_package_intel` | Get PS-OSS score, vuln count, malware status |
| `phoenix_get_alternatives` | Get safe alternative packages |
| `phoenix_firewall_rules` | List your active firewall rules |

See `examples/claude-code-mcp-config.json` for the full MCP config reference.
