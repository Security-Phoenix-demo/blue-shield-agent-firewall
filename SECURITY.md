# Security Policy — Phoenix Security Blue Shield - Firewall

## Reporting Vulnerabilities

If you discover a security vulnerability in any `@phoenix-security/*` package, hook script, or related component, please report it responsibly:

- **Email**: security@phoenix.security
- **Subject**: `[firewall-agents] Security vulnerability report`
- **Do NOT** open a public GitHub issue for security vulnerabilities

We will acknowledge receipt within 48 hours and provide a timeline for a fix within 5 business days.

## Scope

This policy covers:
- `@phoenix-security/mcp-firewall` (NPM package)
- `@phoenix-security/cli` (NPM package)
- `@phoenix-security/schema` (NPM package)
- Hook scripts in `hooks/` directory
- Example configurations in `examples/`

## Supply Chain Security

All NPM packages are published with `npm publish --provenance` using GitHub Actions OIDC (sigstore attestation). You can verify provenance:

```bash
npm audit signatures @phoenix-security/mcp-firewall
```

## Key Handling

- `PHOENIX_API_KEY` is NEVER written to files, logged to stdout/stderr, or included in error messages
- The key is only transmitted via `x-api-key` HTTP header over HTTPS
- `.phoenix-firewall.yaml` config files MUST NOT contain API keys — the parser rejects key-shaped strings

## Supported Versions

| Package | Supported |
|---------|-----------|
| @phoenix-security/mcp-firewall >= 0.1.0 | Yes |
| @phoenix-security/cli >= 0.1.0 | Yes |
| @phoenix-security/schema >= 0.1.0 | Yes |
