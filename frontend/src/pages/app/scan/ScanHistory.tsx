import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, ScanLine, AlertTriangle, ArrowRight, ChevronRight } from 'lucide-react';
import { getScanHistory } from '../../../services/scanApi';
import type { ScanListItem } from '../../../types/scan';
import SplashScreen from '../../../components/SplashScreen';

const qualityBar = (score: number) => {
  if (score >= 75) return { color: '#10b981', label: 'STRONG' };
  if (score >= 55) return { color: '#f97316', label: 'MODERATE' };
  return { color: '#ef4444', label: 'NEEDS WORK' };
};

const ScanHistory: React.FC = () => {
  const navigate = useNavigate();
  const [history, setHistory] = useState<ScanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getScanHistory()
      .then(setHistory)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load scan history.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <SplashScreen isLoader message="Loading your scan history…" />;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* ── HEADER ────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
      >
        <div>
          <p className="overline-brand mb-2">Fortis Scan</p>
          <div className="brand-line mb-3" />
          <h1
            className="font-black text-white tracking-tighter leading-none"
            style={{ fontSize: 'clamp(2rem,6vw,3rem)' }}
          >
            SCAN HISTORY
          </h1>
          <p className="text-sm text-text-muted mt-2">
            {history.length} scan{history.length !== 1 ? 's' : ''} recorded
          </p>
        </div>
        <button
          onClick={() => navigate('/scan')}
          className="fortis-btn-primary py-3 px-6 text-sm font-black tracking-wide flex items-center gap-2"
        >
          <ScanLine className="w-4 h-4" />
          NEW SCAN
        </button>
      </motion.div>

      {/* ── ERROR ─────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 bg-red-900/20 border border-red-500/30 rounded-2xl p-4 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── EMPTY ─────────────────────────────────────── */}
      {!error && history.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden bg-dark-card border border-dark-border rounded-3xl p-12 text-center"
        >
          <div className="absolute inset-0 bg-radial-orange pointer-events-none" />
          <div
            className="absolute bottom-0 right-0 font-black text-brand pointer-events-none select-none"
            style={{ fontSize: 'clamp(5rem,18vw,9rem)', opacity: 0.05, lineHeight: 1 }}
          >
            0
          </div>
          <div className="relative z-10 space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center mx-auto">
              <ScanLine className="w-8 h-8 text-brand-light" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">No Scans Yet</h2>
              <p className="text-sm text-text-muted mt-1">
                Complete your first Fortis Scan to understand your movement profile.
              </p>
            </div>
            <button onClick={() => navigate('/scan')} className="fortis-btn-primary px-8 py-3.5 font-black tracking-wide">
              START FIRST SCAN
            </button>
          </div>
        </motion.div>
      )}

      {/* ── HISTORY LIST ──────────────────────────────── */}
      {history.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-dark-card border border-dark-border rounded-3xl overflow-hidden"
        >
          {history.map((item, i) => {
            const date = new Date(item.scan_date).toLocaleDateString('en-IN', {
              weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
            });
            const time = new Date(item.scan_date).toLocaleTimeString('en-IN', {
              hour: '2-digit', minute: '2-digit',
            });
            const { color, label } = qualityBar(item.movement_quality || 70);
            const sId = item.scan_id || (item as any).id || i + 1;
            const mobVal = item.mobility_score ?? (item as any).mobility ?? 65;
            const stabVal = item.stability_score ?? (item as any).stability ?? 70;
            const confVal = item.scan_confidence ?? (item as any).confidence ?? 85;

            return (
              <motion.div
                key={sId}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12 + i * 0.05 }}
                onClick={() => navigate('/scan/result', { state: { scanId: sId } })}
                className="flex items-center justify-between px-6 py-5 border-b border-dark-border/50 last:border-b-0
                           hover:bg-dark-hover/40 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-5">
                  {/* Score block */}
                  <div className="w-14 text-center shrink-0">
                    <span
                      className="text-3xl font-black leading-none"
                      style={{ color }}
                    >
                      {Math.round(item.movement_quality || 70)}
                    </span>
                    <p className="text-[8px] font-black uppercase tracking-widest mt-0.5" style={{ color }}>
                      {label}
                    </p>
                  </div>

                  {/* Progress bar + info */}
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white mb-1">{date}</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1 text-[11px] text-text-muted">
                        <Clock className="w-3 h-3" />{time}
                      </span>
                      <span className="text-[11px] text-text-muted">Mob {Math.round(mobVal)}%</span>
                      <span className="text-[11px] text-text-muted">Stab {Math.round(stabVal)}%</span>
                      <span className="text-[11px] text-text-muted">Conf {Math.round(confVal)}%</span>
                    </div>
                    {/* Mini bar */}
                    <div className="w-full bg-dark-border rounded-full h-1 mt-2">
                      <div
                        className="h-1 rounded-full transition-all"
                        style={{ width: `${Math.round(item.movement_quality || 70)}%`, background: color }}
                      />
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-dark-border group-hover:text-brand-light transition-colors ml-3" />
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* ── COMPARE CTA ───────────────────────────────── */}
      {history.length >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <button
            onClick={() => navigate('/scan/comparison')}
            className="fortis-btn-secondary w-full py-3.5 font-semibold flex items-center justify-center gap-2"
          >
            Compare Latest vs Previous
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      )}

    </div>
  );
};

export default ScanHistory;
