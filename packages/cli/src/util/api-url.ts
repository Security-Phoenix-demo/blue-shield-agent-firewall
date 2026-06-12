/**
 * Resolve and validate the Phoenix API base URL.
 *
 * `PHOENIX_API_URL` is operator-controlled, but it can arrive from project-level
 * config (`.mcp.json`, `.phoenix-firewall.yaml`) that may be committed to a repo
 * or written by an agent. To prevent the `x-api-key` from being sent to an
 * attacker-controlled host, the host is checked against an allowlist and the
 * scheme must be HTTPS (localhost/127.0.0.1 over HTTP allowed for development).
 *
 * Extend the allowlist via PHOENIX_API_ALLOWED_HOSTS (comma-separated).
 */
const DEFAULT_ALLOWED_HOSTS = [
  // Phoenix Security API is served from the apex host under /api/v1 — the `api.`
  // subdomain does not exist (NXDOMAIN). Apex hosts MUST be allowlisted, otherwise
  // setting PHOENIX_API_URL=https://phxintel.security is rejected as "not allowlisted".
  'phxintel.security',
  'phxintel.appsecphoenix.io',
  'cvedetails.io',
  // Reserved for a future dedicated API subdomain; harmless to keep allowlisted.
  'api.phxintel.security',
  'api.phxintel.appsecphoenix.io',
  'api.cvedetails.io',
];

function allowedHosts(): string[] {
  const extra = (process.env.PHOENIX_API_ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED_HOSTS, ...extra];
}

function isLocalhost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export const DEFAULT_API_URL = 'https://phxintel.security';

/** Returns a normalized URL string, or throws Error with a safe message. */
export function resolveApiUrl(raw: string | undefined): string {
  const value = raw && raw.trim() ? raw.trim() : DEFAULT_API_URL;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`PHOENIX_API_URL is not a valid URL`);
  }
  const host = parsed.hostname.toLowerCase();
  const local = isLocalhost(host);

  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) {
    throw new Error(`PHOENIX_API_URL must use HTTPS (got ${parsed.protocol}//${host})`);
  }
  if (!local && !allowedHosts().includes(host)) {
    throw new Error(
      `PHOENIX_API_URL host '${host}' is not allowlisted. ` +
        `Set PHOENIX_API_ALLOWED_HOSTS to permit it intentionally.`,
    );
  }
  // Strip any embedded credentials.
  parsed.username = '';
  parsed.password = '';
  // Drop trailing slash on the origin path for clean concatenation.
  return parsed.toString().replace(/\/$/, '');
}
