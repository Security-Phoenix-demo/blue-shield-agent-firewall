/** Phoenix API client — calls api.phxintel.security endpoints */
export class PhoenixApiClient {
  constructor(private baseUrl: string, private apiKey: string) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const resp = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) throw new Error(`Phoenix API ${resp.status}: ${await resp.text()}`);
    return resp.json() as Promise<T>;
  }

  async evaluate(packages: Array<{ ecosystem: string; name: string; version: string }>) {
    return this.request<{ results: unknown[] }>('/api/v1/firewall/evaluate', {
      method: 'POST',
      body: JSON.stringify({ packages }),
    });
  }

  async evaluateEnriched(packages: Array<{ ecosystem: string; name: string; version: string }>) {
    return this.request<{ results: unknown[]; enriched: boolean }>('/api/v1/firewall/evaluate/enriched', {
      method: 'POST',
      body: JSON.stringify({ packages }),
    });
  }

  async getAlternatives(ecosystem: string, name: string) {
    return this.request<{ alternatives: unknown[] }>(`/api/v1/firewall/alternatives/${ecosystem}/${encodeURIComponent(name)}`);
  }

  async getRules() {
    return this.request<{ rules: unknown[] }>('/api/v1/firewall/rules');
  }

  async getLibraryIntel(ecosystem: string, name: string) {
    return this.request<unknown>(`/api/v1/library/${ecosystem}/${encodeURIComponent(name)}`);
  }

  async webhookScan(body: unknown) {
    return this.request<unknown>('/api/v1/firewall/webhook/scan', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}
