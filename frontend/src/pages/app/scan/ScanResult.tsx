import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Info,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { getLatestScan, getScanById } from '../../../services/scanApi';
import type { ScanResult as ScanResultType, ScanObservation } from '../../../types/scan';
import SplashScreen from '../../../components/SplashScreen';

/* ─── Radar / Spider Chart (pure SVG) ────────────────── */
interface RadarProps {
  metrics: { label: string; value: number }[]; // values 0-100
  size?: number;
}

const RadarChart: React.FC<RadarProps> = ({ metrics, size = 200 }) => {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const n = metrics.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

  const pt = (i: number, radius: number) => ({
    x: cx + radius * Math.cos(angle(i)),
    y: cy + radius * Math.sin(angle(i)),
  });

  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
      {/* Grid rings */}
      {gridLevels.map((lvl) => {
        const pts = metrics.map((_, i) => pt(i, r * lvl));
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z';
        return (
          <path
            key={lvl}
            d={d}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
          />
        );
      })}

      {/* Axis lines */}
      {metrics.map((_, i) => {
        const end = pt(i, r);
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={end.x} y2={end.y}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
          />
        );
      })}

      {/* Data polygon */}
      {(() => {
        const pts = metrics.map((m, i) => pt(i, r * (m.value / 100)));
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z';
        return (
          <>
            <path d={d} fill="rgba(249,115,22,0.15)" stroke="#f97316" strokeWidth={1.5} />
            {pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3} fill="#f97316" />
            ))}
          </>
        );
      })()}

      {/* Labels */}
      {metrics.map((m, i) => {
        const labelPt = pt(i, r + 22);
        return (
          <text
            key={i}
            x={labelPt.x}
            y={labelPt.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9}
            fontWeight={700}
            fill="rgba(148,163,184,0.9)"
            letterSpacing="0.05em"
            className="uppercase"
          >
            {m.label}
          </text>
        );
      })}
    </svg>
  );
};

/* ─── Severity helpers ────────────────────────────────── */
const severityColor = (s: string) =>
  s === 'good' ? 'text-success' : s === 'attention' ? 'text-red-400' : 'text-warning';

const SeverityIcon: React.FC<{ severity: string }> = ({ severity }) => {
  if (severity === 'good') return <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />;
  if (severity === 'attention') return <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />;
  return <Info className="w-4 h-4 text-warning shrink-0 mt-0.5" />;
};

const ObsCard: React.FC<{ obs: ScanObservation }> = ({ obs }) => {
  const finding = obs.finding || (obs as any).text || '';
  const rec = obs.recommendation || '';
  return (
    <div className="bg-dark-surface border border-dark-border rounded-2xl p-4 flex items-start gap-3">
      <SeverityIcon severity={obs.severity} />
      <div>
        <p className={`text-xs font-black uppercase tracking-widest ${severityColor(obs.severity)}`}>
          {obs.category}
        </p>
        <p className="text-xs text-text-secondary mt-1 leading-relaxed">{finding}</p>
        {rec && <p className="text-xs text-brand-light mt-1.5 leading-relaxed">{rec}</p>}
      </div>
    </div>
  );
};

/* ─── Main Component ──────────────────────────────────── */
const ScanResult: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const scanId: number | undefined = (location.state as { scanId?: number })?.scanId;

  const [scan, setScan] = useState<ScanResultType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = scanId ? await getScanById(scanId) : await getLatestScan();
        setScan(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load scan result.');
      } finally {
        setLoading(false);
      }
    })();
  }, [scanId]);

  if (loading) {
    return <SplashScreen isLoader message="Loading your scan results…" />;
  }

  if (error || !scan) {
    return (
      <div className="max-w-lg mx-auto text-center py-20 space-y-4">
        <AlertTriangle className="w-12 h-12 text-warning mx-auto" />
        <p className="text-text-secondary text-sm">{error ?? 'No scan data found.'}</p>
        <button onClick={() => navigate('/scan')} className="fortis-btn-primary px-6 py-3">
          Start a New Scan
        </button>
      </div>
    );
  }

  const scanDate = new Date(scan.scan_date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  const radarData = [
    { label: 'MOBILITY',     value: Math.round(scan.mobility_score ?? (scan as any).mobility ?? 65) },
    { label: 'STABILITY',    value: Math.round(scan.stability_score ?? (scan as any).stability ?? 70) },
    { label: 'CONSISTENCY',  value: Math.round(scan.movement_consistency ?? 75) },
    { label: 'POSTURE',      value: Math.round(scan.posture_score ?? (scan as any).symmetry_indicator ?? 70) },
    { label: 'SQUAT',        value: Math.round(scan.squat_score ?? (scan as any).squat_movement_score ?? 65) },
  ];

  const mq = Math.round(scan.movement_quality || 75);
  const mqColor = mq >= 75 ? '#10b981' : mq >= 55 ? '#f97316' : '#ef4444';
  const scanConf = Math.round(scan.scan_confidence ?? (scan as any).confidence ?? 88);

  return (
    <div className="max-w-4xl mx-auto space-y-4">

      <motion.div
        role="status"
        aria-live="polite"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200"
      >
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
        <div>
          <p className="text-sm font-bold">Scan complete — your results are ready.</p>
          <p className="mt-0.5 text-xs text-emerald-100/75">Your movement profile has been updated.</p>
        </div>
      </motion.div>

      {/* ── HERO: Movement Quality ────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden bg-dark-card border border-dark-border rounded-3xl"
      >
        <div className="absolute inset-0 bg-radial-orange pointer-events-none" />

        {/* Big background number */}
        <div
          className="absolute bottom-0 right-0 font-black leading-none pointer-events-none select-none"
          style={{ fontSize: 'clamp(6rem,20vw,12rem)', color: mqColor, opacity: 0.07 }}
        >
          {mq}
        </div>

        <div className="relative z-10 p-7 sm:p-10">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
            <div>
              <p className="overline-brand mb-2">Fortis Scan · {scanDate}</p>
              <div className="brand-line mb-4" />
              <h1
                className="font-black text-white leading-none tracking-tighter"
                style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)' }}
              >
                MOVEMENT
                <br />
                PROFILE
              </h1>
            </div>

            {/* Confidence badge */}
            <div className="flex-shrink-0 bg-dark-surface/80 border border-dark-border rounded-2xl px-5 py-4 text-center">
              <p className="text-3xl font-black text-white">{scanConf}<span className="text-base text-text-muted">%</span></p>
              <p className="overline mt-1">Confidence</p>
            </div>
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'MOVEMENT QUALITY', value: scan.movement_quality || 75, color: mqColor, big: true },
              { label: 'MOBILITY',         value: scan.mobility_score ?? (scan as any).mobility ?? 65,   color: '#f97316' },
              { label: 'STABILITY',        value: scan.stability_score ?? (scan as any).stability ?? 70,  color: '#fb923c' },
              { label: 'CONSISTENCY',      value: scan.movement_consistency || 75, color: '#fdba74' },
            ].map((m, i) => (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
                className="bg-dark-surface/60 border border-dark-border/60 rounded-2xl p-4"
                style={m.big ? { borderColor: `${mqColor}30` } : {}}
              >
                <span
                  className="font-black leading-none tracking-tighter"
                  style={{ fontSize: m.big ? 'clamp(2.5rem,7vw,4rem)' : '1.75rem', color: m.color } as React.CSSProperties}
                >
                  {Math.round(m.value)}
                  <span className="text-base font-bold" style={{ color: m.color, opacity: 0.7 }}>%</span>
                </span>
                <p className="overline mt-2">{m.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── RADAR + OBSERVATIONS row ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* Radar Chart */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-5 bg-dark-card border border-dark-border rounded-3xl p-6 flex flex-col items-center"
        >
          <p className="overline-brand mb-5 self-start">Movement Map</p>
          <RadarChart metrics={radarData} size={220} />

          {/* Pattern label */}
          {scan.primary_movement_pattern && (
            <div className="mt-5 w-full bg-brand/10 border border-brand/20 rounded-xl px-4 py-3 text-center">
              <p className="overline mb-1">Primary Pattern</p>
              <p className="text-sm font-black text-brand-light uppercase tracking-wide">
                {scan.primary_movement_pattern.replace(/_/g, ' ')}
              </p>
            </div>
          )}
        </motion.div>

        {/* Observations */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="lg:col-span-7 space-y-3"
        >
          <p className="overline-brand">What Fortis Found</p>
          {scan.observations && scan.observations.length > 0 ? (
            scan.observations.map((obs, i) => <ObsCard key={i} obs={obs} />)
          ) : (
            <div className="bg-dark-card border border-dark-border rounded-2xl p-6 text-sm text-text-muted text-center">
              No observations recorded — run another scan for detailed findings.
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Update badges row ────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {scan.fortis_pulse_updated !== null && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-brand/10 border border-brand/25 rounded-2xl p-5 flex items-center gap-4"
          >
            <TrendingUp className="w-6 h-6 text-brand-light shrink-0" />
            <div>
              <p className="text-sm font-black text-white">
                Pulse → <span className="text-brand-light">{Math.round(scan.fortis_pulse_updated)}</span>
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                Movement now contributes 9% to your Fortis Pulse.
              </p>
            </div>
          </motion.div>
        )}
        {scan.decision_updated && (
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.33 }}
            className="bg-success/10 border border-success/20 rounded-2xl p-5 flex items-center gap-4"
          >
            <RefreshCw className="w-6 h-6 text-success shrink-0" />
            <div>
              <p className="text-sm font-black text-white">Decision Engine Refreshed</p>
              <p className="text-xs text-text-muted mt-0.5">
                Scan signals integrated into today's recommendations.
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* ── Metrics detail table ─────────────────────── */}
      {scan.metrics && scan.metrics.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-dark-card border border-dark-border rounded-3xl overflow-hidden"
        >
          <div className="px-4 sm:px-6 pt-5 pb-3">
            <p className="overline-brand">Detail Metrics</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2">
            {scan.metrics.map((m, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-dark-border/50 last:border-b-0"
              >
                <div>
                  <p className="text-xs font-semibold text-text-primary">
                    {m.metric_name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </p>
                  <p className="overline mt-0.5">{m.category}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-white">
                    {typeof m.value === 'number' ? m.value.toFixed(1) : m.value}
                    <span className="text-xs text-text-muted ml-0.5">{m.unit}</span>
                  </p>
                  <p className="overline mt-0.5">conf {Math.round(m.confidence * 100)}%</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Disclaimer ───────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="flex items-start gap-2 text-[11px] text-text-muted bg-dark-surface border border-dark-border/50 rounded-2xl p-4"
      >
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand" />
        {scan.disclaimer}
      </motion.div>

      {/* ── CTA row ──────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.42 }}
        className="flex flex-col sm:flex-row gap-3 pb-4"
      >
        <button
          onClick={() => navigate('/scan/blueprint')}
          className="fortis-btn-primary flex-1 py-4 text-sm font-black tracking-wide flex items-center justify-center gap-2"
        >
          VIEW YOUR BLUEPRINT
          <ArrowRight className="w-4 h-4" />
        </button>
        <button onClick={() => navigate('/scan/comparison')} className="fortis-btn-secondary py-4 px-5 text-sm font-semibold">
          Compare Scans
        </button>
        <button onClick={() => navigate('/scan/history')} className="fortis-btn-secondary py-4 px-5 text-sm font-semibold">
          History
        </button>
      </motion.div>

    </div>
  );
};

export default ScanResult;
