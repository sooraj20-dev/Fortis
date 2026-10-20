import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchUsageStatus, UsageStatus } from '../services/usageApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTokens(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function minutesAgo(iso: string | null): string | null {
  if (!iso) return null;
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diff < 1) return 'just now';
  if (diff === 1) return '1 min ago';
  return `${diff} mins ago`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AIUsageIndicatorProps {
  feature: 'ai_coach' | 'fortis_vision';
}

// ─── Component ────────────────────────────────────────────────────────────────

export const AIUsageIndicator: React.FC<AIUsageIndicatorProps> = ({ feature }) => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<UsageStatus | null>(null);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // ── Poll every 60 s ──────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const data = await fetchUsageStatus();
      setStatus(data);
    } catch {
      // keep old status on error
    }
  }, []);

  useEffect(() => {
    poll();
    const id = window.setInterval(poll, 60_000);
    return () => window.clearInterval(id);
  }, [poll]);

  // ── Close on outside click / Escape ─────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKeydown);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  // ── Derived display values ───────────────────────────────────────────────
  const ws = status?.warning_state ?? 'tracking_unavailable';
  const tracking = status?.tracking_available ?? false;

  const iconColor =
    ws === 'rate_limited'
      ? 'text-danger'
      : ws === 'approaching_threshold' || ws === 'threshold_reached'
        ? 'text-warning'
        : tracking
          ? 'text-text-muted hover:text-text-secondary'
          : 'text-text-muted/60';

  const badge =
    ws === 'rate_limited' ? (
      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-danger animate-pulse" />
    ) : ws === 'threshold_reached' ? (
      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-brand" />
    ) : ws === 'approaching_threshold' ? (
      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-warning" />
    ) : null;

  const featureData = status?.feature_today?.[feature];
  const featureLabel = feature === 'ai_coach' ? 'AI Coach' : 'FORTIS Vision';

  const warningMsg =
    ws === 'rate_limited'
      ? status?.retry_after_seconds != null
        ? `Rate limited · retry in ${status.retry_after_seconds}s`
        : 'Rate limited'
      : ws === 'threshold_reached'
        ? 'Daily request threshold reached'
        : ws === 'approaching_threshold'
          ? 'Approaching daily request limit'
          : ws === 'quota_unknown'
            ? 'Quota status unknown'
            : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="AI usage status"
        aria-expanded={open}
        className={`relative p-1.5 rounded-lg transition-colors ${iconColor}`}
      >
        <Activity className="w-4 h-4" />
        {badge}
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="AI Usage popover"
          className="absolute top-full right-0 mt-2 w-64 z-50 bg-dark-card border border-dark-border rounded-2xl shadow-xl p-4 flex flex-col gap-3"
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-dark-border pb-2.5">
            <span
              className={`w-2 h-2 rounded-full ${
                ws === 'rate_limited'
                  ? 'bg-danger'
                  : ws === 'approaching_threshold' || ws === 'threshold_reached'
                    ? 'bg-warning'
                    : tracking
                      ? 'bg-success'
                      : 'bg-text-muted'
              }`}
            />
            <span className="text-sm font-bold text-text-primary">AI Usage</span>
          </div>

          {!tracking ? (
            <p className="text-xs text-text-muted text-center py-2">Tracking unavailable</p>
          ) : (
            <>
              {/* Feature-specific today */}
              <div>
                <p className="overline mb-1">{featureLabel} Today</p>
                {featureData ? (
                  <>
                    <p className="text-xs text-text-secondary">
                      {featureData.total} request{featureData.total !== 1 ? 's' : ''}
                      {(featureData.input_tokens != null || featureData.output_tokens != null) && (
                        <> · {formatTokens((featureData.input_tokens ?? 0) + (featureData.output_tokens ?? 0))} tokens</>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-text-muted">No data yet</p>
                )}
              </div>

              {/* App-wide today */}
              <div>
                <p className="overline mb-1">App-wide Today</p>
                <p className="text-xs text-text-secondary">
                  {status?.today_total ?? 0} total
                  {(status?.today_rate_limited ?? 0) > 0 && (
                    <> · <span className="text-warning">{status!.today_rate_limited} rate limited</span></>
                  )}
                </p>
                {(status?.input_tokens_today != null || status?.output_tokens_today != null) && (
                  <p className="text-xs text-text-muted mt-0.5">
                    Input: {formatTokens(status?.input_tokens_today)} · Output:{' '}
                    {formatTokens(status?.output_tokens_today)}
                  </p>
                )}
              </div>

              {/* Limit & Balance comparison */}
              {status?.quota_comparison && (
                <div className="p-2.5 rounded-xl bg-dark-surface/90 border border-dark-border space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="overline">Daily Balance</span>
                    <span className="font-bold text-success tabular-nums">
                      {status.quota_comparison.daily_requests_remaining.toLocaleString()} left
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-dark-border rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        status.quota_comparison.daily_requests_percent_used >= 90
                          ? 'bg-danger'
                          : status.quota_comparison.daily_requests_percent_used >= 70
                            ? 'bg-warning'
                            : 'bg-success'
                      }`}
                      style={{ width: `${Math.min(100, status.quota_comparison.daily_requests_percent_used)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-text-muted">
                    <span>Used: {status.quota_comparison.daily_requests_used}</span>
                    <span>Limit: {status.quota_comparison.daily_request_limit}</span>
                  </div>
                </div>
              )}

              {/* Warning message */}
              {warningMsg && (
                <p
                  className={`text-xs px-2.5 py-1.5 rounded-lg ${
                    ws === 'rate_limited'
                      ? 'bg-danger/10 text-danger border border-danger/20'
                      : 'bg-warning/10 text-warning border border-warning/20'
                  }`}
                >
                  {warningMsg}
                  {ws === 'rate_limited' && status?.latest_rate_limit_at && (
                    <span className="block text-[11px] opacity-70 mt-0.5">
                      Last: {minutesAgo(status.latest_rate_limit_at)}
                    </span>
                  )}
                </p>
              )}
            </>
          )}

          {/* Navigate CTA */}
          <button
            type="button"
            onClick={() => { setOpen(false); navigate('/usage'); }}
            className="w-full text-xs font-semibold text-brand-light hover:text-brand transition-colors text-right"
          >
            View AI Usage →
          </button>
        </div>
      )}
    </div>
  );
};

export default AIUsageIndicator;
