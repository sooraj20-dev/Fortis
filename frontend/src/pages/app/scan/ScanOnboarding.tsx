import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Camera, BarChart3, ShieldCheck, Activity, ChevronRight, Clock } from 'lucide-react';
import { startScan } from '../../../services/scanApi';

const steps = [
  { icon: Camera,     num: '01', label: 'Camera Setup',        detail: 'Full body visible, 2–3 m distance, good lighting.' },
  { icon: Activity,   num: '02', label: 'Movement Capture',    detail: '3 controlled bodyweight squats on cue.' },
  { icon: BarChart3,  num: '03', label: 'AI Analysis',         detail: 'Joint angles, mobility ROM, stability tracked.' },
  { icon: ShieldCheck,num: '04', label: 'Blueprint Generated', detail: 'Pulse recalculated. Adaptive plan delivered.' },
];

const tags = ['Mobility', 'Stability', 'Movement Quality', 'Pulse Sync', 'Blueprint'];

const ScanOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await startScan();
      const sId = res.scan_id || (res as any).user_id || 1;
      navigate('/scan/camera', { state: { scanId: sId } });
    } catch {
      // Fallback to default session so the user can still proceed to camera/upload
      navigate('/scan/camera', { state: { scanId: 1 } });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-0">

      {/* ── HERO ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-3xl bg-dark-card border border-dark-border mb-5"
        style={{ minHeight: 340 }}
      >
        {/* Orange radial glow */}
        <div className="absolute inset-0 bg-radial-orange pointer-events-none" />
        <div
          className="absolute bottom-0 right-0 w-72 h-72 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.18) 0%, transparent 70%)' }}
        />

        {/* Corner label */}
        <div className="absolute top-6 right-6 overline-brand">
          Fortis Flagship
        </div>

        <div className="relative z-10 p-8 sm:p-10 flex flex-col justify-between h-full" style={{ minHeight: 340 }}>
          <div>
            <div className="brand-line mb-5" />
            {/* Massive editorial heading */}
            <h1
              className="font-black text-white leading-none tracking-tighter mb-4"
              style={{ fontSize: 'clamp(3rem, 8vw, 5.5rem)', lineHeight: 1.0 }}
            >
              FORTIS
              <br />
              <span className="text-brand">SCAN</span>
            </h1>
            <p className="text-base sm:text-lg text-text-secondary max-w-sm leading-relaxed font-medium">
              Understand your movement.<br />
              <span className="text-white">Build your adaptive plan.</span>
            </p>
          </div>

          {/* Tags row */}
          <div className="flex flex-wrap gap-2 mt-8">
            {tags.map((t) => (
              <span key={t} className="fortis-pill">{t}</span>
            ))}
          </div>
        </div>

        {/* Big background number — design element */}
        <div
          className="absolute bottom-4 right-6 font-black text-white pointer-events-none select-none"
          style={{ fontSize: 'clamp(5rem,18vw,10rem)', opacity: 0.04, lineHeight: 1 }}
        >
          4.0
        </div>
      </motion.div>

      {/* ── STEPS ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5"
      >
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.num}
              className="bg-dark-card border border-dark-border rounded-2xl p-5 flex flex-col gap-4
                         hover:border-brand/30 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <span className="overline-brand">{s.num}</span>
                <div className="w-8 h-8 rounded-xl bg-brand/10 flex items-center justify-center
                                group-hover:bg-brand/20 transition-colors">
                  <Icon className="w-4 h-4 text-brand-light" />
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-white mb-1">{s.label}</p>
                <p className="text-xs text-text-muted leading-relaxed">{s.detail}</p>
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* ── REQUIREMENTS + PRIVACY row ────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        {/* Requirements */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-dark-card border border-dark-border rounded-2xl p-5"
        >
          <p className="overline-brand mb-4">For Best Results</p>
          <ul className="space-y-2.5">
            {[
              'Stand 2–3 m from camera — full body visible',
              'Good frontal lighting (avoid backlit windows)',
              'Form-fitting clothes for landmark accuracy',
              'Perform 3 slow, controlled bodyweight squats',
            ].map((r) => (
              <li key={r} className="flex items-start gap-2.5 text-xs text-text-secondary">
                <ChevronRight className="w-3.5 h-3.5 text-brand shrink-0 mt-0.5" />
                {r}
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Privacy */}
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-dark-card border border-dark-border rounded-2xl p-5 flex flex-col justify-between"
        >
          <div>
            <p className="overline-brand mb-4">Privacy & Responsible AI</p>
            <p className="text-xs text-text-muted leading-relaxed">
              Video is processed locally in-memory. No frames are stored or sent externally.
              Fortis Scan provides <strong className="text-text-secondary">fitness guidance only</strong> — not medical
              diagnosis. Confidence scores reflect data quality, not clinical accuracy.
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-brand-light" />
            <span className="text-xs text-text-muted">~60 seconds total</span>
          </div>
        </motion.div>
      </div>

      {/* ── CTA ────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="flex flex-col sm:flex-row gap-3"
      >
        {error && (
          <p className="text-xs text-red-400 mb-1 w-full text-center">{error}</p>
        )}
        <button
          onClick={handleStart}
          disabled={starting}
          className="fortis-btn-primary flex-1 py-4 text-base font-black tracking-wide
                     flex items-center justify-center gap-3 disabled:opacity-60"
        >
          {starting ? (
            <>
              <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Initialising…
            </>
          ) : (
            <>
              START SCAN
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>

        <button
          onClick={() => navigate('/scan/history')}
          className="fortis-btn-secondary py-4 px-8 text-sm font-semibold"
        >
          View History
        </button>
      </motion.div>

    </div>
  );
};

export default ScanOnboarding;
