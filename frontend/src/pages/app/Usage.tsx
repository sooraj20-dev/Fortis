import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw,
  Activity,
  AlertTriangle,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Clock,
  ExternalLink,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts';
import {
  fetchUsageSummary,
  fetchUsageHistory,
  fetchUsageStatus,
  UsageSummary,
  UsageHistoryResponse,
  UsageStatus,
  DailyStat,
} from '../../services/usageApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTokens(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diff < 1) return 'just now';
  if (diff === 1) return '1 minute ago';
  if (diff < 60) return `${diff} minutes ago`;
  const h = Math.floor(diff / 60);
  return h === 1 ? '1 hour ago' : `${h} hours ago`;
}

function featureLabel(f: string): string {
  if (f === 'ai_coach') return 'AI Coach';
  if (f === 'fortis_vision') return 'FORTIS Vision';
  return f;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString();
}

type Period = '24h' | '7d' | '30d';

// ─── Metric Card ─────────────────────────────────────────────────────────────

const MetricCard: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  warn?: boolean;
}> = ({ label, value, sub, warn }) => (
  <div className={`fortis-card p-4 flex flex-col gap-1 ${warn ? 'border-warning/30' : ''}`}>
    <span className="overline">{label}</span>
    <span className="text-2xl font-black text-text-primary tabular-nums">{value}</span>
    {sub && <span className="text-xs text-text-secondary">{sub}</span>}
  </div>
);

// ─── Status Badge ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const base = 'fortis-pill text-[11px] font-semibold';
  if (status === 'success') return <span className={`${base} bg-success/15 text-success border-success/30`}>success</span>;
  if (status === 'failed') return <span className={`${base} bg-danger/15 text-danger border-danger/30`}>failed</span>;
  if (status === 'rate_limited') return <span className={`${base} bg-warning/15 text-warning border-warning/30`}>rate limited</span>;
  return <span className={`${base} bg-dark-border text-text-muted border-dark-border`}>{status}</span>;
};

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

const SkeletonRow: React.FC = () => (
  <tr>
    {Array.from({ length: 8 }).map((_, i) => (
      <td key={i} className="px-3 py-3">
        <div className="h-3 bg-dark-border rounded animate-pulse w-16" />
      </td>
    ))}
  </tr>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

const UsagePage: React.FC = () => {
  const [period, setPeriod] = useState<Period>('7d');
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [status, setStatus] = useState<UsageStatus | null>(null);
  const [history, setHistory] = useState<UsageHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // History filters & pagination
  const [histFeature, setHistFeature] = useState('');
  const [histStatus, setHistStatus] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const [sum, stat] = await Promise.all([fetchUsageSummary(p), fetchUsageStatus()]);
      setSummary(sum);
      setStatus(stat);
    } catch {
      // keep old data on error
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (pg: number, feat: string, stat: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetchUsageHistory({
        page: pg,
        page_size: 20,
        feature: feat || undefined,
        status: stat || undefined,
        days: 30,
      });
      setHistory(res);
    } catch {
      // keep old data
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    load(period);
  }, [period, load]);

  useEffect(() => {
    setPage(1);
    loadHistory(1, histFeature, histStatus);
  }, [histFeature, histStatus, loadHistory]);

  useEffect(() => {
    loadHistory(page, histFeature, histStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const ws = status?.warning_state ?? 'tracking_unavailable';
  const tracking = status?.tracking_available ?? false;

  // ── Chart data ──────────────────────────────────────────────────────────
  const chartData = (summary?.daily_stats ?? []).map((d: DailyStat) => ({
    date: fmtDate(d.date),
    Successful: d.successful,
    Failed: d.failed,
    'Rate Limited': d.rate_limited,
    input_tokens: d.input_tokens,
    output_tokens: d.output_tokens,
  }));

  const hasTokenData = chartData.some(
    (d) => d.input_tokens != null || d.output_tokens != null,
  );

  const tokenData = chartData.map((d) => ({
    date: d.date,
    'Input Tokens': d.input_tokens,
    'Output Tokens': d.output_tokens,
  }));

  const hasInput = tokenData.some((d) => d['Input Tokens'] != null);
  const hasOutput = tokenData.some((d) => d['Output Tokens'] != null);

  // ── Budget & Quota Comparison ──────────────────────────────────────────
  const budget = summary?.warning_budget;
  const hasBudget = budget?.daily_request_budget != null;
  const quota = summary?.quota_comparison || status?.quota_comparison;

  // ── Rate limit ──────────────────────────────────────────────────────────
  const rateLimitMinsAgo = status?.latest_rate_limit_at
    ? Math.floor((Date.now() - new Date(status.latest_rate_limit_at).getTime()) / 60_000)
    : null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── Page Header ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-primary">AI Usage</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Monitor your AI activity, token consumption, and API limits.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Status dot */}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                ws === 'rate_limited'
                  ? 'bg-danger animate-pulse'
                  : ws === 'quota_unknown' || ws === 'approaching_threshold'
                    ? 'bg-warning'
                    : tracking
                      ? 'bg-success'
                      : 'bg-text-muted'
              }`}
            />
            <span className="text-xs text-text-muted">
              {tracking ? 'Tracking active' : 'Unavailable'}
            </span>
          </div>

          {/* Period selector */}
          <div className="flex bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
            {(['24h', '7d', '30d'] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => { setPeriod(p); setPage(1); }}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  period === p
                    ? 'bg-brand text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            type="button"
            onClick={() => load(period)}
            disabled={loading}
            aria-label="Refresh"
            className="p-2 rounded-xl border border-dark-border bg-dark-surface hover:bg-dark-hover transition-colors text-text-secondary hover:text-text-primary cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Last updated */}
      {summary?.last_updated && (
        <p className="text-xs text-text-muted -mt-3">
          Updated {timeAgo(summary.last_updated)}
        </p>
      )}

      {/* ── 6 Metric Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* 1. Today's Requests */}
        <MetricCard
          label="Today's Requests"
          value={status?.today_total ?? '—'}
          sub={
            status
              ? `${status.today_successful} successful · ${status.today_failed} failed`
              : undefined
          }
        />

        {/* 2. Input Tokens */}
        <MetricCard
          label="Input Tokens"
          value={
            summary?.input_tokens_total != null
              ? fmtTokens(summary.input_tokens_total)
              : 'unavailable'
          }
          sub={`${period} period`}
        />

        {/* 3. Output Tokens */}
        <MetricCard
          label="Output Tokens"
          value={
            summary?.output_tokens_total != null
              ? fmtTokens(summary.output_tokens_total)
              : 'unavailable'
          }
          sub={`${period} period`}
        />

        {/* 4. Total Tokens */}
        <MetricCard
          label="Total Tokens"
          value={
            summary?.total_tokens != null
              ? fmtTokens(summary.total_tokens)
              : 'unavailable'
          }
          sub={summary?.tokens_partial ? '⚠ partial data' : `${period} period`}
        />

        {/* 5. Rate-Limit Errors */}
        <MetricCard
          label="Rate-Limit Errors"
          value={
            <span className="flex items-center gap-1.5">
              {summary?.rate_limited ?? 0}
              {(summary?.rate_limited ?? 0) > 0 && (
                <AlertTriangle className="w-4 h-4 text-warning" />
              )}
            </span>
          }
          warn={(summary?.rate_limited ?? 0) > 0}
          sub={
            rateLimitMinsAgo != null
              ? `Most recent: ${rateLimitMinsAgo < 1 ? 'just now' : `${rateLimitMinsAgo} min${rateLimitMinsAgo === 1 ? '' : 's'} ago`}`
              : undefined
          }
        />

        {/* 6. Remaining Balance */}
        <MetricCard
          label="Remaining Balance"
          value={
            quota ? (
              <span
                className={`tabular-nums ${
                  quota.daily_requests_percent_used >= 90
                    ? 'text-danger'
                    : quota.daily_requests_percent_used >= 70
                      ? 'text-warning'
                      : 'text-success'
                }`}
              >
                {quota.daily_requests_remaining.toLocaleString()}
              </span>
            ) : hasBudget ? (
              `${budget!.daily_request_budget}`
            ) : (
              '—'
            )
          }
          warn={quota ? quota.daily_requests_percent_used >= 70 : false}
          sub={
            quota
              ? `${quota.daily_requests_used} used of ${quota.daily_request_limit} limit (${quota.daily_requests_percent_used}%)`
              : hasBudget
                ? `Limit: ${budget!.daily_request_budget}/day`
                : 'No budget configured'
          }
        />
      </div>

      {/* ── Quota & Balance Comparison Panel ───────────────────────────── */}
      {quota && (
        <div className="fortis-card p-5 space-y-4 border-brand/20 bg-gradient-to-br from-dark-card via-dark-card to-dark-surface/90">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dark-border/80 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-brand/10 text-brand-light">
                <Gauge className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-text-primary">
                    Gemini Quota & Balance Analysis
                  </h2>
                  <span className="fortis-pill text-[10px] py-0.5 px-2 bg-brand/10 text-brand-light border-brand/20">
                    {quota.model}
                  </span>
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                  Direct comparison of current actual usage against total limit with remaining balance
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs flex-wrap">
              <span className="px-2.5 py-1 rounded-full bg-dark-surface border border-dark-border text-text-secondary flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-brand-light" />
                Resets in <span className="font-bold text-text-primary">{quota.resets_in}</span> (00:00 UTC)
              </span>
              <a
                href="https://ai.google.dev/pricing"
                target="_blank"
                rel="noreferrer"
                className="text-brand-light hover:text-brand transition-colors flex items-center gap-1 font-semibold"
              >
                Official Limits <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Daily Requests Comparison */}
            <div className="p-4 rounded-xl bg-dark-surface/80 border border-dark-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="overline">Daily Requests</span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    quota.daily_requests_percent_used >= 90
                      ? 'bg-danger/15 text-danger border border-danger/30'
                      : quota.daily_requests_percent_used >= 70
                        ? 'bg-warning/15 text-warning border border-warning/30'
                        : 'bg-success/15 text-success border border-success/30'
                  }`}
                >
                  {quota.daily_requests_percent_used >= 90
                    ? 'Critical'
                    : quota.daily_requests_percent_used >= 70
                      ? 'Approaching Limit'
                      : 'Healthy Balance'}
                </span>
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-2xl font-black text-text-primary tabular-nums">
                    {quota.daily_requests_remaining.toLocaleString()}
                  </span>
                  <span className="text-xs text-text-muted">
                    balance remaining
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 w-full bg-dark-border rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      quota.daily_requests_percent_used >= 90
                        ? 'bg-danger'
                        : quota.daily_requests_percent_used >= 70
                          ? 'bg-warning'
                          : 'bg-success'
                    }`}
                    style={{ width: `${Math.min(100, quota.daily_requests_percent_used)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-xs border-t border-dark-border/60">
                <div>
                  <span className="text-[10px] uppercase text-text-muted block">Current Usage</span>
                  <span className="font-bold text-text-primary tabular-nums">
                    {quota.daily_requests_used.toLocaleString()}
                  </span>
                  <span className="text-text-muted text-[11px]"> ({quota.daily_requests_percent_used}%)</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-text-muted block">Total Actual Limit</span>
                  <span className="font-bold text-text-secondary tabular-nums">
                    {quota.daily_request_limit.toLocaleString()} / day
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Token Capacity Comparison */}
            <div className="p-4 rounded-xl bg-dark-surface/80 border border-dark-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="overline">Daily Token Capacity</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand/10 text-brand-light border border-brand/20">
                  {fmtTokens(quota.daily_tokens_remaining)} balance
                </span>
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-2xl font-black text-text-primary tabular-nums">
                    {fmtTokens(quota.daily_tokens_remaining)}
                  </span>
                  <span className="text-xs text-text-muted">
                    tokens remaining
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 w-full bg-dark-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand transition-all duration-500"
                    style={{ width: `${Math.min(100, quota.daily_tokens_percent_used)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-xs border-t border-dark-border/60">
                <div>
                  <span className="text-[10px] uppercase text-text-muted block">Used Today</span>
                  <span className="font-bold text-text-primary tabular-nums">
                    {fmtTokens(quota.daily_tokens_used)}
                  </span>
                  <span className="text-text-muted text-[11px]"> ({quota.daily_tokens_percent_used}%)</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-text-muted block">Total Limit</span>
                  <span className="font-bold text-text-secondary tabular-nums">
                    {fmtTokens(quota.daily_token_limit)} / day
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Rate Window & Tier Specs */}
            <div className="p-4 rounded-xl bg-dark-surface/80 border border-dark-border space-y-3 md:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between">
                <span className="overline">Rate Windows</span>
                <span className="text-[11px] text-text-muted capitalize">
                  {quota.limit_label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 py-1">
                <div className="p-2.5 rounded-lg bg-dark-card border border-dark-border/60">
                  <span className="text-[10px] uppercase text-text-muted block">Requests / Min</span>
                  <span className="text-lg font-black text-text-primary tabular-nums">{quota.rpm_limit}</span>
                  <span className="text-[10px] text-text-muted block">RPM max burst</span>
                </div>
                <div className="p-2.5 rounded-lg bg-dark-card border border-dark-border/60">
                  <span className="text-[10px] uppercase text-text-muted block">Tokens / Min</span>
                  <span className="text-lg font-black text-text-primary tabular-nums">{fmtTokens(quota.tpm_limit)}</span>
                  <span className="text-[10px] text-text-muted block">TPM bandwidth</span>
                </div>
              </div>

              <p className="text-[11px] text-text-muted leading-tight">
                {quota.limit_type === 'custom_budget'
                  ? 'Custom threshold configured via AI_DAILY_REQUEST_BUDGET in backend.'
                  : 'Official Google Gemini free-tier standard limit. Automatic exponential backoff enabled.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Charts ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Request Chart */}
        <div className="fortis-card p-4">
          <h2 className="text-sm font-bold text-text-primary mb-4">Daily Requests</h2>
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-60 text-text-muted text-sm">
              No request data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 0, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={{ stroke: '#1e1e2e' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#16161f',
                    border: '1px solid #1e1e2e',
                    borderRadius: 12,
                    fontSize: 12,
                    color: '#f1f5f9',
                  }}
                  cursor={{ fill: '#1a1a27' }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}
                />
                <Bar dataKey="Successful" stackId="a" fill="#f97316" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Failed" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Rate Limited" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Token Chart */}
        <div className="fortis-card p-4">
          <h2 className="text-sm font-bold text-text-primary mb-1">Token Consumption</h2>
          {summary?.tokens_partial && (
            <p className="text-[11px] text-warning mb-3">⚠ Partial token data — some requests had no token info</p>
          )}
          {!hasTokenData ? (
            <div className="flex items-center justify-center h-60 text-text-muted text-sm">
              No token data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={tokenData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="inputGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outputGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={{ stroke: '#1e1e2e' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => fmtTokens(v)}
                />
                <Tooltip
                  contentStyle={{
                    background: '#16161f',
                    border: '1px solid #1e1e2e',
                    borderRadius: 12,
                    fontSize: 12,
                    color: '#f1f5f9',
                  }}
                  formatter={(v: number) => fmtTokens(v)}
                  cursor={{ stroke: '#1a1a27' }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                {hasInput && (
                  <Area
                    type="monotone"
                    dataKey="Input Tokens"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#inputGrad)"
                    dot={false}
                    connectNulls
                  />
                )}
                {hasOutput && (
                  <Area
                    type="monotone"
                    dataKey="Output Tokens"
                    stroke="#f97316"
                    strokeWidth={2}
                    fill="url(#outputGrad)"
                    dot={false}
                    connectNulls
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Feature Breakdown ───────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-bold text-text-primary mb-3">Feature Breakdown</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(['ai_coach', 'fortis_vision'] as const).map((feat) => {
            const d = summary?.feature_breakdown?.[feat];
            if (!d) {
              return (
                <div key={feat} className="fortis-card p-4">
                  <p className="overline mb-1">{featureLabel(feat)}</p>
                  <p className="text-sm text-text-muted">No data</p>
                </div>
              );
            }
            const pct = Math.min(100, Math.round(d.pct_of_total ?? 0));
            return (
              <div key={feat} className="fortis-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="overline">{featureLabel(feat)}</p>
                  <span className="text-xs text-text-muted">{pct}% of total</span>
                </div>
                {/* Progress bar */}
                <div className="w-full h-1.5 bg-dark-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-black text-text-primary tabular-nums">{d.total}</p>
                    <p className="text-[11px] text-text-muted">Total</p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-success tabular-nums">{d.successful}</p>
                    <p className="text-[11px] text-text-muted">Success</p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-danger tabular-nums">{d.failed + d.rate_limited}</p>
                    <p className="text-[11px] text-text-muted">Errors</p>
                  </div>
                </div>
                {(d.input_tokens != null || d.output_tokens != null) && (
                  <div className="flex gap-4 text-xs text-text-secondary">
                    <span>In: {fmtTokens(d.input_tokens)}</span>
                    <span>Out: {fmtTokens(d.output_tokens)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Request History Table ───────────────────────────────────────── */}
      <div className="fortis-card overflow-hidden">
        <div className="p-4 border-b border-dark-border flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-text-primary">Request History</h2>
          <div className="flex items-center gap-2">
            {/* Feature filter */}
            <select
              value={histFeature}
              onChange={(e) => { setHistFeature(e.target.value); setPage(1); }}
              className="fortis-input text-xs py-1.5 px-2.5 pr-7"
            >
              <option value="">All Features</option>
              <option value="ai_coach">AI Coach</option>
              <option value="fortis_vision">FORTIS Vision</option>
            </select>
            {/* Status filter */}
            <select
              value={histStatus}
              onChange={(e) => { setHistStatus(e.target.value); setPage(1); }}
              className="fortis-input text-xs py-1.5 px-2.5 pr-7"
            >
              <option value="">All Statuses</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="rate_limited">Rate Limited</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-text-secondary">
            <thead>
              <tr className="border-b border-dark-border">
                {['Time', 'Feature', 'Model', 'Status', 'Input', 'Output', 'Duration', 'Error'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-3 py-2.5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {historyLoading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : !history?.items?.length ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-text-muted">
                    No requests recorded yet
                  </td>
                </tr>
              ) : (
                history.items.map((item) => (
                  <tr key={item.request_id} className="hover:bg-dark-hover transition-colors">
                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtTime(item.started_at)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{featureLabel(item.feature)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-text-muted max-w-[120px] truncate">{item.model}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                      {item.input_tokens != null ? item.input_tokens : '—'}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                      {item.output_tokens != null ? item.output_tokens : '—'}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                      {fmtDuration(item.duration_ms)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-text-muted">
                      {item.error_category ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {history && history.total_pages > 0 && (
          <div className="p-3 border-t border-dark-border flex items-center justify-between">
            <span className="text-xs text-text-muted">
              Page {history.page} of {history.total_pages} · {history.total} result{history.total !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={history.page <= 1}
                className="p-1.5 rounded-lg border border-dark-border hover:bg-dark-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(history.total_pages, p + 1))}
                disabled={history.page >= history.total_pages}
                className="p-1.5 rounded-lg border border-dark-border hover:bg-dark-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Daily Summary ───────────────────────────────────────────────── */}
      <div className="fortis-card p-4 space-y-3">
        <h2 className="text-sm font-bold text-text-primary">Daily Summary</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Today vs yesterday */}
          {(() => {
            const stats = summary?.daily_stats ?? [];
            const today = stats[stats.length - 1];
            const yesterday = stats[stats.length - 2];
            if (!today) return null;
            const diff = yesterday && yesterday.total > 0
              ? Math.round(((today.total - yesterday.total) / yesterday.total) * 100)
              : null;
            return (
              <div className="fortis-card bg-dark-surface p-3 space-y-1">
                <p className="overline">Today vs Yesterday</p>
                <p className="text-lg font-black text-text-primary tabular-nums">
                  {today.total} requests
                </p>
                {diff != null && (
                  <p className={`flex items-center gap-1 ${diff >= 0 ? 'text-success' : 'text-danger'}`}>
                    <TrendingUp className="w-3 h-3" />
                    {diff >= 0 ? '+' : ''}{diff}% vs yesterday
                  </p>
                )}
                {diff == null && yesterday && (
                  <p className="text-text-muted">Yesterday: 0 requests</p>
                )}
              </div>
            );
          })()}

          {/* Most used feature */}
          {(() => {
            const breakdown = summary?.feature_breakdown ?? {};
            const topFeature = Object.entries(breakdown).sort(([, a], [, b]) => b.total - a.total)[0];
            if (!topFeature) return null;
            return (
              <div className="fortis-card bg-dark-surface p-3 space-y-1">
                <p className="overline">Most Used Feature</p>
                <p className="text-base font-black text-text-primary">{featureLabel(topFeature[0])}</p>
                <p className="text-text-muted">{topFeature[1].total} requests</p>
              </div>
            );
          })()}

          {/* Latest rate limit event */}
          <div className="fortis-card bg-dark-surface p-3 space-y-1">
            <p className="overline">Latest Rate Limit</p>
            {status?.latest_rate_limit_at ? (
              <>
                <p className="text-base font-black text-warning">Rate limited</p>
                <p className="text-text-muted">{timeAgo(status.latest_rate_limit_at)}</p>
              </>
            ) : (
              <p className="text-text-muted mt-1">None recorded</p>
            )}
          </div>

          {/* Tracking status */}
          <div className="fortis-card bg-dark-surface p-3 space-y-1">
            <p className="overline">Tracking Status</p>
            <p className={`text-base font-black ${tracking ? 'text-success' : 'text-text-muted'}`}>
              {tracking ? 'Active' : 'Unavailable'}
            </p>
            {summary?.tracking_status && (
              <p className="text-text-muted capitalize">{summary.tracking_status}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UsagePage;
