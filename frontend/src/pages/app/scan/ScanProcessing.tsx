import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { getLatestScan } from '../../../services/scanApi';

interface Step {
  label: string;
  detail: string;
  duration: number;
}

const STEPS: Step[] = [
  { label: 'Camera quality verified',      detail: 'Brightness · landmark coverage · confidence gate', duration: 800 },
  { label: 'Pose landmarks extracted',     detail: 'MediaPipe skeleton — 33 keypoints tracked',         duration: 1000 },
  { label: 'Joint angles computed',        detail: 'Hip, knee, ankle ROM across squat reps',            duration: 1000 },
  { label: 'Movement quality scored',      detail: 'Mobility · Stability · Consistency',               duration: 1200 },
  { label: 'Fitness state updated',        detail: 'Fortis Pulse recalculated with movement weight',    duration: 1000 },
  { label: 'Decision engine refreshed',    detail: 'Scan signals → training & nutrition recs',          duration: 900 },
];

const ScanProcessing: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const scanId: number = (location.state as { scanId?: number })?.scanId ?? 0;

  const [completedSteps, setCompletedSteps] = useState(-1);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!scanId) { navigate('/scan'); return; }

    let total = 0;
    STEPS.forEach((step, i) => {
      total += step.duration;
      setTimeout(() => setCompletedSteps(i), total);
    });
    total += 600;
    setTimeout(async () => {
      try { await getLatestScan(); } catch { /* ignore */ }
      setDone(true);
    }, total);
  }, [scanId, navigate]);

  useEffect(() => {
    if (done) setTimeout(() => navigate('/scan/result', { state: { scanId } }), 700);
  }, [done, scanId, navigate]);

  const pct = done ? 100 : Math.round(((completedSteps + 1) / STEPS.length) * 100);

  return (
    <div className="max-w-lg mx-auto space-y-6">

      {/* ── HERO ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden bg-dark-card border border-dark-border rounded-3xl p-8 text-center"
      >
        <div className="absolute inset-0 bg-radial-orange pointer-events-none" />

        {/* Big ghost number */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 font-black text-brand pointer-events-none select-none"
          style={{ fontSize: 'clamp(5rem,20vw,9rem)', opacity: 0.06, lineHeight: 1 }}
        >
          {pct}
        </div>

        <div className="relative z-10">
          <p className="overline-brand mb-3">FORTIS SCAN</p>
          <div className="brand-line mx-auto mb-5" />

          {/* Progress ring */}
          <div className="flex justify-center mb-6">
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#1e1e2e" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="40" fill="none"
                  stroke="#f97316" strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - pct / 100)}`}
                  style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                {done ? (
                  <CheckCircle2 className="w-8 h-8 text-success" />
                ) : (
                  <span className="text-2xl font-black text-white">{pct}<span className="text-sm text-text-muted">%</span></span>
                )}
              </div>
            </div>
          </div>

          <h1 className="text-2xl font-black tracking-tight text-white">
            {done ? 'Analysis Complete' : 'Analysing Movement'}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {done ? 'Loading your results…' : 'The Fortis Vision Engine is processing your scan.'}
          </p>
        </div>
      </motion.div>

      {/* ── PIPELINE STEPS ────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-dark-card border border-dark-border rounded-3xl overflow-hidden"
      >
        <div className="px-6 pt-5 pb-3">
          <p className="overline-brand">Vision Pipeline</p>
        </div>
        {STEPS.map((step, i) => {
          const isComplete = completedSteps >= i;
          const isActive   = completedSteps === i - 1 && !isComplete;
          return (
            <motion.div
              key={step.label}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + i * 0.06 }}
              className={`flex items-start gap-4 px-6 py-4 border-b border-dark-border/50 last:border-b-0
                transition-opacity ${completedSteps < i - 1 ? 'opacity-25' : 'opacity-100'}`}
            >
              {/* Icon */}
              <div className="mt-0.5 flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {isComplete ? (
                  <CheckCircle2 className="w-5 h-5 text-success" />
                ) : isActive ? (
                  <Loader2 className="w-5 h-5 text-brand-light animate-spin" />
                ) : (
                  <Circle className="w-5 h-5 text-dark-border" />
                )}
              </div>
              {/* Text */}
              <div className="flex-1">
                <p className={`text-sm font-bold ${isComplete ? 'text-white' : 'text-text-muted'}`}>
                  {step.label}
                </p>
                <p className="text-xs text-text-muted mt-0.5">{step.detail}</p>
              </div>
              {/* Step number */}
              <span className={`text-[10px] font-black ${isComplete ? 'text-success' : 'text-dark-border'}`}>
                {String(i + 1).padStart(2, '0')}
              </span>
            </motion.div>
          );
        })}
      </motion.div>

      {done && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-sm text-success font-black tracking-wide"
        >
          COMPLETE — REDIRECTING…
        </motion.div>
      )}
    </div>
  );
};

export default ScanProcessing;
