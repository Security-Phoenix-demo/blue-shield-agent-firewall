/**
 * @phoenix-security/schema — Shared types for Phoenix Security Blue Shield - Firewall
 * Used by @phoenix-security/mcp-firewall, @phoenix-security/cli, and backend.
 */

export type ActionType = 'block' | 'warn' | 'audit' | 'allow' | 'require_approval';
export type TrackType = 'malware' | 'vulnerability' | 'hygiene';
export type MigrationComplexity = 'low' | 'medium' | 'high';
export type AgentAction = 'suggest_alternative' | 'show_context_and_ask' | 'abort' | 'proceed' | 'fail_pipeline' | 'annotate_pr';

export interface MatchingRule {
  rule_id: string;
  name: string;
  priority: number;
}

export interface Alternative {
  package: string;
  version: string;
  ps_oss_score?: number;
  vulnerability_count?: number;
  license?: string;
  migration_complexity?: MigrationComplexity;
  reason?: string;
}

export interface Remediation {
  action_required: string;
  safe_versions: string[];
  alternatives: Alternative[];
  version_command?: string;
  breaking_changes?: string;
}

export interface VerdictContext {
  track: TrackType;
  summary: string;
  evidence_summary?: string;
  for_llm_reasoning: string;
  remediation?: Remediation;
  mitre_techniques?: string[];
}

export interface FirewallVerdict {
  action: ActionType;
  package: string;
  version: string;
  ecosystem: string;
  matching_rules: MatchingRule[];
  context?: VerdictContext;
  mpi?: {
    signals: string[];
    confidence: number;
    threat_type?: string;
  };
  ps_oss_score?: number;
}

export interface LockfileEntry {
  path: string;
  ecosystem: string;
  content_base64: string;
}

export interface DependencyDiff {
  action: 'added' | 'upgraded' | 'removed';
  ecosystem: string;
  name: string;
  version: string;
  from?: string;
}

export interface ScanSummary {
  total_packages: number;
  blocked: number;
  warned: number;
  clean: number;
}

export interface BlockedPackage {
  package: string;
  version: string;
  reason: string;
  rule?: string;
}

export interface WarningPackage {
  package: string;
  version: string;
  reason: string;
  remediation?: string;
}

export interface WebhookScanRequest {
  source: string;
  event_type: string;
  repository: string;
  ref?: string;
  commit_sha?: string;
  lockfiles?: LockfileEntry[];
  dependency_diff?: DependencyDiff[];
  callback_url?: string;
  callback_auth?: string;
}

export interface WebhookScanResponse {
  scan_id: string;
  status: 'completed' | 'failed' | 'pending';
  summary: ScanSummary;
  blocked_packages: BlockedPackage[];
  warnings: WarningPackage[];
  exit_code: number;
  report_url?: string;
}

export interface AgentConfig {
  on_block?: AgentAction;
  on_warn?: AgentAction;
  auto_upgrade?: boolean;
}

export interface ConfigSettings {
  fail_mode?: 'open' | 'closed';
  strict_mode?: boolean;
  cache_ttl_seconds?: number;
  ecosystems?: string[];
}

export interface PhoenixFirewallConfig {
  version: string;
  api_key_env?: string;
  settings?: ConfigSettings;
  agents?: Record<string, AgentConfig>;
}

/** Parse a Package URL string into components */
export function parsePurl(purl: string): { ecosystem: string; name: string; version?: string } | null {
  const match = purl.match(/^pkg:([^/]+)\/(.+?)(?:@(.+))?$/);
  if (!match) return null;
  return { ecosystem: match[1], name: match[2], version: match[3] };
}
