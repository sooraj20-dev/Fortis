import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  ScanLine,
  Info,
  ArrowRight,
} from 'lucide-react';
import { getScanHistory, getScanComparison } from '../../../services/scanApi';
import type { ScanComparison as ScanComparisonType } from '../../../types/scan';
import SplashScreen from '../../../components/SplashScreen';

const DeltaCard: React.FC<{ label: string; delta: number }> = ({ label, delta }) => {
  const pos  = delta > 0.4;
  const neg  = delta < -0.4;
  const Icon = pos ? TrendingUp : neg ? TrendingDown : Minus;
  const color = pos ? '#10b981' : neg ? '#ef4444' : '#64748b';

  return (
    <div className="bg-dark-surface border border-dark-border rounded-2xl p-4 flex items-center justify-between">
      <div>
        <p className="text-xs font-semibold text-text-primary capitalize">
          {label.replace(/_/g, ' ')}
        </p>
      </div>
      <div className="flex items-center gap-1.5 font-black text-sm" style={{ color }}>
        <Icon className="w-4 h-4" />
        {pos ? '+' : ''}{delta.toFixed(1)}
      </div>
    </div>
  );
};

const ScanComparison: React.FC = () => {
  const navigate = useNavigate();
  const [comparison, setComparison] = useState<ScanComparisonType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsMore, setNeedsMore] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const history = await getScanHistory();
        if (history.length < 2) { setNeedsMore(true); return; }
        const latestId = history[0].scan_id || (history[0] as any).id || 1;
        const data = await getScanComparison(latestId);
        setComparison(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load comparison.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (needsMore) setLoading(false);
  }, [needsMore]);

  if (loading) {
    return <SplashScreen isLoader message="Loading your scan comparison…" />;
  }

  if (needsMore) {
    return (
      <div className="max-w-lg mx-auto text-center py-20 space-y-5">
        <div className="relative overflow-hidden bg-dark-card border border-dark-border rounded-3xl p-6 sm:p-12">
          <div
            className="absolute bottom-0 right-0 font-black text-brand pointer-events-none select-none"
            style={{ fontSize: 'clamp(5rem,18vw,9rem)', opacity: 0.05, lineHeight: 1 }}
          >
            2
          </div>
          <div className="relative z-10 space-y-4">
            <ScanLine className="w-12 h-12 text-brand-light mx-auto" />
            <h2 className="text-xl font-black text-white tracking-tight">Need 2 Scans to Compare</h2>
            <p className="text-sm text-text-muted">Complete at least two Fortis Scans to see your movement evolution.</p>
            <button onClick={() => navigate('/scan')} className="fortis-btn-primary px-8 py-3.5 font-black tracking-wide">
              START ANOTHER SCAN
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error || !comparison) {
    return (
      <div className="max-w-lg mx-auto text-center py-20 space-y-4">
        <AlertTriangle className="w-12 h-12 text-warning mx-auto" />
        <p className="text-text-secondary text-sm">{error ?? 'No comparison data available.'}</p>
        <button onClick={() => navigate('/scan')} className="fortis-btn-primary px-6 py-3">Back to Scan</button>
      </div>
    );
  }

  // Baseline scan — backend returned has_comparison: false
  if ((comparison as any).has_comparison === false) {
    return (
      <div className="max-w-lg mx-auto text-center py-20 space-y-5">
        <div className="relative overflow-hidden bg-dark-card border border-dark-border rounded-3xl p-6 sm:p-12">
          <div className="relative z-10 space-y-4">
            <ScanLine className="w-12 h-12 text-brand-light mx-auto" />
            <h2 className="text-xl font-black text-white tracking-tight">This Is Your Baseline</h2>
            <p className="text-sm text-text-muted">
              {(comparison as any).summary || 'Complete another scan to see your movement evolution.'}
            </p>
            <button onClick={() => navigate('/scan')} className="fortis-btn-primary px-8 py-3.5 font-black tracking-wide">
              START ANOTHER SCAN
            </button>
          </div>
        </div>
      </div>
    );
  }

  const c = comparison;
  const currentDate  = new Date(c.current_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const previousDate = new Date(c.previous_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <div className="max-w-3xl mx-auto space-y-4">

      {/* ── HERO ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden bg-dark-card border border-dark-border rounded-3xl"
      >
        <div className="absolute inset-0 bg-radial-orange pointer-events-none" />
        <div
          className="absolute bottom-0 right-4 font-black text-brand pointer-events-none select-none"
          style={{ fontSize: 'clamp(4rem,14vw,8rem)', opacity: 0.06, lineHeight: 1 }}
        >
          EVL
        </div>

        <div className="relative z-10 p-7 sm:p-10">
          <p className="overline-brand mb-3">Fortis Scan</p>
          <div className="brand-line mb-5" />
          <h1
            className="font-black text-white leading-none tracking-tighter mb-2"
            style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)' }}
          >
            FORTIS
            <br />
            <span className="text-brand">EVOLUTION</span>
          </h1>
          <p className="text-sm text-text-muted">
            {previousDate} → {currentDate} · Movement trajectory
          </p>
        </div>
      </motion.div>

      {/* ── SUMMARY ───────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-dark-card border border-dark-border rounded-3xl p-6"
      >
        <p className="overline-brand mb-3">What Changed?</p>
        <p className="text-sm text-text-primary leading-relaxed">{c.summary}</p>
      </motion.div>

      {/* ── DELTA GRID ────────────────────────────────── */}
      {c.deltas && Object.keys(c.deltas).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-dark-card border border-dark-border rounded-3xl p-6"
        >
          <p className="overline-brand mb-4">Metric Deltas</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(c.deltas).map(([key, val]) => (
              <DeltaCard key={key} label={key} delta={val} />
            ))}
          </div>
        </motion.div>
      )}

      {/* ── 3-COL: improved / stable / regressed ──────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {((c.improvements || []).length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-success/10 border border-success/20 rounded-2xl p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-success" />
              <p className="text-[10px] font-black uppercase tracking-widest text-success">Improved</p>
            </div>
            <ul className="space-y-2">
              {(c.improvements || []).map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-success/80">
                  <span className="w-1 h-1 rounded-full bg-success shrink-0 mt-1.5" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {((c.stable || []).length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
            className="bg-dark-card border border-dark-border rounded-2xl p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <Minus className="w-4 h-4 text-text-muted" />
              <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Stable</p>
            </div>
            <ul className="space-y-2">
              {(c.stable || []).map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-text-muted">
                  <span className="w-1 h-1 rounded-full bg-text-muted shrink-0 mt-1.5" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {((c.regressions || []).length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24 }}
            className="bg-red-900/20 border border-red-500/20 rounded-2xl p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-4 h-4 text-red-400" />
              <p className="text-[10px] font-black uppercase tracking-widest text-red-400">Needs Attention</p>
            </div>
            <ul className="space-y-2">
              {(c.regressions || []).map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-red-400/80">
                  <span className="w-1 h-1 rounded-full bg-red-400 shrink-0 mt-1.5" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </div>

      {/* ── Disclaimer ───────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex items-start gap-2 text-[11px] text-text-muted bg-dark-surface border border-dark-border/50 rounded-2xl p-4"
      >
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand" />
        {c.disclaimer}
      </motion.div>

      {/* ── CTA ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.33 }}
        className="flex flex-col sm:flex-row gap-3 pb-4"
      >
        <button
          onClick={() => navigate('/scan/blueprint')}
          className="fortis-btn-primary flex-1 py-4 text-sm font-black tracking-wide flex items-center justify-center gap-2"
        >
          VIEW BLUEPRINT <ArrowRight className="w-4 h-4" />
        </button>
        <button onClick={() => navigate('/scan/history')} className="fortis-btn-secondary py-4 px-6 text-sm font-semibold">
          All Scans
        </button>
      </motion.div>

    </div>
  );
};

export default ScanComparison;
