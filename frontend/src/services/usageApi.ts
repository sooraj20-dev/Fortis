import api from './api';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface FeatureUsage {
  total: number;
  successful: number;
  failed: number;
  rate_limited: number;
  input_tokens: number | null;
  output_tokens: number | null;
}

export interface DailyStat {
  date: string;
  total: number;
  successful: number;
  failed: number;
  rate_limited: number;
  input_tokens: number | null;
  output_tokens: number | null;
}

export interface QuotaComparison {
  model: string;
  daily_request_limit: number;
  daily_requests_used: number;
  daily_requests_remaining: number;
  daily_requests_percent_used: number;
  daily_token_limit: number;
  daily_tokens_used: number;
  daily_tokens_remaining: number;
  daily_tokens_percent_used: number;
  rpm_limit: number;
  tpm_limit: number;
  limit_type: 'custom_budget' | 'gemini_standard_tier';
  limit_label: string;
  resets_at: string;
  resets_in: string;
}

export interface UsageStatus {
  today_total: number;
  today_successful: number;
  today_failed: number;
  today_rate_limited: number;
  feature_today: {
    ai_coach: FeatureUsage;
    fortis_vision: FeatureUsage;
  };
  input_tokens_today: number | null;
  output_tokens_today: number | null;
  warning_state:
    | 'normal'
    | 'approaching_threshold'
    | 'threshold_reached'
    | 'rate_limited'
    | 'quota_unknown'
    | 'tracking_unavailable';
  latest_rate_limit_at: string | null;
  retry_after_seconds: number | null;
  last_updated: string;
  tracking_available: boolean;
  quota_comparison?: QuotaComparison;
}

export interface UsageSummary {
  period_start: string;
  period_end: string;
  total_attempts: number;
  successful: number;
  failed: number;
  rate_limited: number;
  input_tokens_total: number | null;
  output_tokens_total: number | null;
  total_tokens: number | null;
  tokens_partial: boolean;
  feature_breakdown: {
    [feature: string]: FeatureUsage & { pct_of_total: number };
  };
  daily_stats: DailyStat[];
  tracking_status: string;
  warning_state: string;
  warning_budget: {
    daily_request_budget: number | null;
    warning_percent: number;
  };
  quota_comparison?: QuotaComparison;
  last_updated: string;
}

export interface UsageHistoryItem {
  request_id: string;
  feature: string;
  model: string;
  status: string;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number;
  started_at: string;
  error_category: string | null;
}

export interface UsageHistoryResponse {
  items: UsageHistoryItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface UsageHistoryParams {
  page?: number;
  page_size?: number;
  feature?: string;
  status?: string;
  days?: number;
}

// ─── API Functions ────────────────────────────────────────────────────────────

export async function fetchUsageStatus(): Promise<UsageStatus> {
  const res = await api.get<UsageStatus>('/api/usage/status');
  return res.data;
}

export async function fetchUsageSummary(
  period: '24h' | '7d' | '30d' = '7d',
): Promise<UsageSummary> {
  const res = await api.get<UsageSummary>('/api/usage/summary', {
    params: { period },
  });
  return res.data;
}

export async function fetchUsageHistory(
  params: UsageHistoryParams = {},
): Promise<UsageHistoryResponse> {
  const res = await api.get<UsageHistoryResponse>('/api/usage/history', {
    params,
  });
  return res.data;
}
