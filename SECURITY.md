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

- `PHOENIX_API_KEY` is read from the environment and transmitted only via the `x-api-key` HTTP header over HTTPS.
- Hooks pass the header to `curl` via a stdin config (`-K -`), so the key does not appear in the process argument list (`ps`).
- `PHOENIX_API_URL` is validated against an allowlist of Phoenix hosts (HTTPS required; localhost permitted for development) before the key is sent, so a poisoned project config cannot redirect the key to an attacker host. Extend with `PHOENIX_API_ALLOWED_HOSTS`.
- `.phoenix-firewall.yaml` is committed to source control and MUST NOT contain the key itself — store only the env var *name* in `api_key_env`.

## Fail Mode

This is a *blocking* control and **fails closed by default**: if it cannot obtain a verdict (no API key with `PHOENIX_REQUIRE_KEY`/`PHOENIX_STRICT`, API unreachable, non-2xx, or unencodable input), the install is blocked.

- `PHOENIX_FAIL_OPEN=true` — allow installs when the API cannot verify them (records a loud warning). Use only deliberately.
- `PHOENIX_REQUIRE_KEY=true` — block installs when no API key is configured (default: warn loudly and allow, since a missing key is a setup state).
- `PHOENIX_STRICT=true` — legacy switch forcing both fail-closed and require-key.

## Supported Versions

| Package | Supported |
|---------|-----------|
| @phoenix-security/mcp-firewall >= 0.1.0 | Yes |
| @phoenix-security/cli >= 0.1.0 | Yes |
| @phoenix-security/schema >= 0.1.0 | Yes |
