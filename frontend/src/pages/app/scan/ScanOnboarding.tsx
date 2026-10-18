import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  ArrowRight, Camera, BarChart3, ShieldCheck, Activity, ChevronRight, Clock, Check,
  Sun, Ruler, Shirt, Maximize, Lock, History, Pause, Play,
} from 'lucide-react';
import { startScan } from '../../../services/scanApi';

const SCAN_IMAGE = '/landing_imgs/hero.png';
const HERO_IMAGE = '/landing_imgs/hero.png';

// ─── Joint hotspots over the scan image (x / y are % of the frame) ───
// Positions are measured on hero.png (frame is 4:5 to match the image, so percentages map directly).
const JOINTS = [
  { id: 'neck', label: 'Neck & head', note: 'Head position and neck alignment', x: 49.5, y: 33.9 },
  { id: 'shoulder-l', label: 'Left shoulder', note: 'Shoulder mobility and symmetry', x: 18.7, y: 42.4 },
  { id: 'shoulder-r', label: 'Right shoulder', note: 'Shoulder mobility and symmetry', x: 79.8, y: 42.1 },
  { id: 'spine', label: 'Spine', note: 'Neutral posture through the squat', x: 49.5, y: 61.3 },
  { id: 'elbow-l', label: 'Left arm', note: 'Arm position and balance', x: 6.2, y: 74.9 },
  { id: 'elbow-r', label: 'Right arm', note: 'Arm position and balance', x: 93.1, y: 75.6 },
  { id: 'hip', label: 'Hips', note: 'Hip depth and symmetry', x: 49.5, y: 83 },
];

const METRICS = [
  { id: 'mobility', label: 'Mobility', joints: ['shoulder-l', 'shoulder-r', 'hip'] },
  { id: 'stability', label: 'Stability', joints: ['spine', 'hip', 'elbow-l', 'elbow-r'] },
  { id: 'quality', label: 'Movement quality', joints: ['neck', 'spine', 'hip'] },
  { id: 'pulse', label: 'Pulse sync', joints: ['neck', 'spine'] },
  { id: 'blueprint', label: 'Blueprint', joints: ['neck', 'shoulder-l', 'shoulder-r', 'spine', 'elbow-l', 'elbow-r', 'hip'] },
];

const STEPS = [
  { icon: Camera, label: 'Camera setup', detail: 'Prop your phone or laptop so your full body is in frame.', tips: ['Stand 2–3 m from the camera', 'Keep head to feet visible', 'Use a stable surface'] },
  { icon: Activity, label: 'Movement capture', detail: 'Do 3 slow, controlled bodyweight squats when prompted.', tips: ['Feet shoulder-width apart', 'Squat to a comfortable depth', 'Pause briefly at the bottom'] },
  { icon: BarChart3, label: 'AI analysis', detail: 'Joint angles, range of motion and stability are tracked.', tips: ['Takes a few seconds', 'Confidence scores reflect video quality', 'You can retake any time'] },
  { icon: ShieldCheck, label: 'Blueprint ready', detail: 'Your pulse is recalculated and an adaptive plan is built.', tips: ['Plan tuned to your movement', 'Re-scan to track progress', 'Results saved to your history'] },
];

const CHECKS = [
  { id: 'dist', icon: Ruler, title: 'Distance', text: 'Stand 2–3 m from the camera, full body visible' },
  { id: 'light', icon: Sun, title: 'Lighting', text: 'Light in front of you, no bright window behind' },
  { id: 'clothes', icon: Shirt, title: 'Clothing', text: 'Form-fitting clothes so joints are easy to see' },
  { id: 'space', icon: Maximize, title: 'Space', text: 'Clear area to squat with arms forward' },
];

const ScanOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [starting, setStarting] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const [heroOk, setHeroOk] = useState(true);

  const [metric, setMetric] = useState<string | null>(null);
  const [joint, setJoint] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [checked, setChecked] = useState<string[]>([]);
  const hold = useRef(false);

  // Joint alignment: open /scan?calibrate=1, drag each dot onto the right joint, press "Copy positions".
  const calibrate = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('calibrate');
  const frameRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  const [copied, setCopied] = useState(false);
  const joints = JOINTS.map((j) => ({ ...j, ...(pos[j.id] || {}) }));
  const dragTo = (id: string, e: React.PointerEvent) => {
    const r = frameRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
    setPos((o) => ({ ...o, [id]: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 } }));
  };
  const copyPositions = async () => {
    const out = joints.map((j) => `  { id: '${j.id}', label: '${j.label}', note: '${j.note}', x: ${j.x}, y: ${j.y} },`).join('\n');
    try { await navigator.clipboard.writeText(`const JOINTS = [\n${out}\n];`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };

  const activeJoints = metric ? METRICS.find((m) => m.id === metric)?.joints ?? [] : [];
  const readyPct = (checked.length / CHECKS.length) * 100;
  const ready = checked.length === CHECKS.length;
  const focusJoint = JOINTS.find((j) => j.id === joint);

  // Auto-play the step walkthrough until the user takes control
  useEffect(() => {
    if (!playing || reduce) return;
    const t = setInterval(() => { if (!hold.current) setStep((s) => (s + 1) % STEPS.length); }, 4200);
    return () => clearInterval(t);
  }, [playing, reduce]);

  const handleStart = async () => {
    setStarting(true);
    try {
      const res = await startScan();
      const sId = res.scan_id || (res as any).user_id || 1;
      navigate('/scan/camera', { state: { scanId: sId } });
    } catch {
      // Fall back to a default session so the user can still reach the camera/upload step
      navigate('/scan/camera', { state: { scanId: 1 } });
    }
  };

  const toggle = (id: string) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const S = STEPS[step];
  const StepIcon = S.icon;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* ───────── HERO ───────── */}
      <motion.section
        initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-3xl bg-dark-card border border-dark-border"
      >
        {/* Hero backdrop photo */}
        {heroOk && (
          <>
            <motion.img
              src={HERO_IMAGE} alt="" aria-hidden onError={() => setHeroOk(false)}
              initial={{ scale: 1.08, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.4, ease: 'easeOut' }}
              className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-dark-card via-dark-card/85 to-dark-card/40 pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-t from-dark-card via-transparent to-dark-card/50 pointer-events-none" />
          </>
        )}
        <div className="absolute inset-0 bg-radial-orange pointer-events-none" />
        <div className="absolute -bottom-24 -left-16 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.16) 0%, transparent 70%)' }} />

        <div className="relative z-10 grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] gap-6 p-6 sm:p-10 items-center">
          {/* Copy */}
          <div className="space-y-6 order-2 md:order-1">
            <div>
              <div className="brand-line mb-4" />
              <p className="overline-brand mb-3">Fortis flagship</p>
              <h1 className="font-black text-white tracking-tighter" style={{ fontSize: 'clamp(3rem, 8vw, 5.25rem)', lineHeight: 0.95 }}>
                FORTIS<br /><span className="text-brand">SCAN</span>
              </h1>
              <p className="mt-4 text-base sm:text-lg text-text-secondary max-w-sm leading-relaxed font-medium">
                Understand your movement. <span className="text-white">Build your adaptive plan.</span>
              </p>
            </div>

            {/* Interactive metric chips */}
            <div>
              <p className="text-xs text-text-muted mb-2">Tap what we measure to see it on the figure</p>
              <div className="flex flex-wrap gap-2">
                {METRICS.map((m) => (
                  <button key={m.id} onClick={() => { setMetric(metric === m.id ? null : m.id); setJoint(null); }} aria-pressed={metric === m.id}
                    className={`text-xs font-bold px-3.5 py-1.5 rounded-full border transition active:scale-95 ${metric === m.id ? 'bg-brand text-white border-brand shadow-glow' : 'fortis-pill hover:border-brand/50'}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={handleStart} disabled={starting}
                className="fortis-btn-primary flex-1 sm:flex-none sm:px-8 py-3.5 text-sm font-black tracking-wide flex items-center justify-center gap-2.5 disabled:opacity-60">
                {starting ? (<><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Initialising…</>)
                  : (<>Start scan<ArrowRight className="w-4 h-4" /></>)}
              </button>
              <button onClick={() => navigate('/scan/history')} className="fortis-btn-secondary py-3.5 px-6 text-sm font-semibold flex items-center justify-center gap-2">
                <History className="w-4 h-4" />View history
              </button>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-text-muted"><Clock className="w-3.5 h-3.5 text-brand-light" />About 60 seconds</p>
          </div>

          {/* Scan viewport */}
          <div className="order-1 md:order-2 relative mx-auto w-full max-w-[320px]">
            <div ref={frameRef} className="relative aspect-[4/5] rounded-2xl overflow-hidden border border-brand/30 bg-dark-surface shadow-glow">
              {imgOk ? (
                <img src={SCAN_IMAGE} alt="Body scan with tracked joints" onError={() => setImgOk(false)} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-dark-surface to-dark-bg">
                  <Activity className="w-16 h-16 text-brand/40" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-dark-bg/70 via-transparent to-dark-bg/30 pointer-events-none" />

              {/* Grid + sweep */}
              <div className="absolute inset-0 pointer-events-none opacity-[0.12]"
                style={{ backgroundImage: 'linear-gradient(#f97316 1px,transparent 1px),linear-gradient(90deg,#f97316 1px,transparent 1px)', backgroundSize: '32px 32px' }} />
              {!reduce && (
                <motion.div className="absolute inset-x-0 h-20 pointer-events-none bg-gradient-to-b from-transparent via-brand/35 to-transparent"
                  initial={{ top: '-20%' }} animate={{ top: '100%' }} transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }} />
              )}

              {/* Corner brackets */}
              {['top-2 left-2 border-t-2 border-l-2 rounded-tl-lg', 'top-2 right-2 border-t-2 border-r-2 rounded-tr-lg',
                'bottom-2 left-2 border-b-2 border-l-2 rounded-bl-lg', 'bottom-2 right-2 border-b-2 border-r-2 rounded-br-lg'].map((c) => (
                <span key={c} className={`absolute w-6 h-6 border-brand ${c}`} />
              ))}

              {/* Hotspots */}
              {joints.map((j) => {
                const lit = activeJoints.includes(j.id) || joint === j.id || calibrate;
                return (
                  <button key={j.id} onClick={() => !calibrate && setJoint(joint === j.id ? null : j.id)}
                    onMouseEnter={() => !calibrate && setJoint(j.id)} onMouseLeave={() => !calibrate && setJoint(null)}
                    onFocus={() => !calibrate && setJoint(j.id)} onBlur={() => !calibrate && setJoint(null)}
                    onPointerDown={(e) => { if (calibrate) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
                    onPointerMove={(e) => { if (calibrate && e.buttons === 1) dragTo(j.id, e); }}
                    aria-label={`${j.label}: ${j.note}`}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center focus:outline-none ${calibrate ? 'cursor-grab active:cursor-grabbing z-20' : ''}`}
                    style={{ left: `${j.x}%`, top: `${j.y}%`, touchAction: calibrate ? 'none' : undefined }}>
                    {lit && !reduce && !calibrate && <span className="absolute inset-0 rounded-full bg-brand/40 animate-ping" />}
                    <span className={`relative rounded-full border-2 transition-all duration-300 ${lit ? 'w-4 h-4 bg-brand border-white shadow-glow' : 'w-2.5 h-2.5 bg-white/70 border-brand/60'}`} />
                    {calibrate && <span className="absolute left-full ml-1 text-[10px] font-bold text-white bg-dark-bg/80 px-1.5 py-0.5 rounded whitespace-nowrap">{j.label}</span>}
                  </button>
                );
              })}

              {/* Readout */}
              <div className="absolute bottom-3 left-3 right-3 min-h-[44px] pointer-events-none">
                <AnimatePresence mode="wait">
                  <motion.div key={focusJoint?.id || metric || 'idle'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                    className="px-3 py-2 rounded-xl bg-dark-bg/80 backdrop-blur border border-brand/25">
                    {focusJoint ? (
                      <><p className="text-xs font-black text-brand-light">{focusJoint.label}</p><p className="text-[11px] text-text-secondary">{focusJoint.note}</p></>
                    ) : metric ? (
                      <p className="text-xs text-text-secondary"><span className="font-black text-brand-light">{METRICS.find((m) => m.id === metric)?.label}</span> uses {activeJoints.length} tracked joints</p>
                    ) : (
                      <p className="text-xs text-text-secondary">Live pose tracking. Tap a joint to explore.</p>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {calibrate && (
              <div className="mt-3 p-3 rounded-xl bg-dark-surface border border-brand/30 space-y-2">
                <p className="text-xs font-bold text-brand-light">Align mode: drag each dot onto its joint</p>
                <ul className="text-[11px] text-text-secondary grid grid-cols-2 gap-x-3 tabular-nums">
                  {joints.map((j) => <li key={j.id}>{j.label}: {j.x}, {j.y}</li>)}
                </ul>
                <div className="flex gap-2">
                  <button onClick={copyPositions} className="fortis-btn-primary text-xs py-1.5 px-3">{copied ? 'Copied' : 'Copy positions'}</button>
                  <button onClick={() => setPos({})} className="fortis-btn-secondary text-xs py-1.5 px-3">Reset</button>
                </div>
                <p className="text-[10px] text-text-muted">Paste the copied block over JOINTS at the top of this file.</p>
              </div>
            )}
          </div>
        </div>
      </motion.section>

      {/* ───────── STEPS ───────── */}
      <motion.section initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}
        className="bg-dark-card border border-dark-border rounded-3xl p-5 sm:p-7 space-y-5"
        onMouseEnter={() => { hold.current = true; }} onMouseLeave={() => { hold.current = false; }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="overline-brand mb-1">How it works</p>
            <h2 className="text-xl font-black text-white">Four steps, one minute</h2>
          </div>
          <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause walkthrough' : 'Play walkthrough'}
            className="w-9 h-9 rounded-full border border-dark-border text-text-secondary hover:text-white hover:border-brand/40 transition flex items-center justify-center">
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
        </div>

        {/* Timeline */}
        <div className="relative grid grid-cols-4 gap-2" role="tablist">
          <div className="absolute top-5 left-[12.5%] right-[12.5%] h-0.5 bg-dark-border" />
          <motion.div className="absolute top-5 left-[12.5%] h-0.5 bg-brand origin-left" style={{ width: '75%' }}
            animate={{ scaleX: step / (STEPS.length - 1) }} transition={{ duration: 0.5 }} />
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step, on = i === step;
            return (
              <button key={s.label} role="tab" aria-selected={on} onClick={() => { setStep(i); setPlaying(false); }}
                className="relative flex flex-col items-center gap-2 group focus:outline-none">
                <span className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-300 group-focus-visible:ring-2 group-focus-visible:ring-brand
                  ${on ? 'bg-brand border-brand shadow-glow scale-110' : done ? 'bg-brand/20 border-brand text-brand-light' : 'bg-dark-surface border-dark-border text-text-muted group-hover:border-brand/40'}`}>
                  {done ? <Check className="w-4 h-4 text-brand-light" /> : <Icon className={`w-4 h-4 ${on ? 'text-white' : ''}`} />}
                </span>
                <span className={`text-[11px] sm:text-xs font-bold text-center leading-tight transition-colors ${on ? 'text-white' : 'text-text-muted'}`}>{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Detail */}
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
            className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 p-4 sm:p-5 rounded-2xl bg-dark-surface border border-dark-border">
            <div className="flex gap-4">
              <span className="w-11 h-11 shrink-0 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center"><StepIcon className="w-5 h-5 text-brand-light" /></span>
              <div>
                <p className="text-xs text-brand-light font-bold mb-0.5">Step {step + 1} of {STEPS.length}</p>
                <p className="text-base font-black text-white">{S.label}</p>
                <p className="text-sm text-text-secondary mt-1 max-w-md leading-relaxed">{S.detail}</p>
              </div>
            </div>
            <ul className="space-y-1.5 sm:min-w-[230px]">
              {S.tips.map((t) => (
                <li key={t} className="flex items-start gap-2 text-xs text-text-secondary"><ChevronRight className="w-3.5 h-3.5 text-brand shrink-0 mt-0.5" />{t}</li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>
      </motion.section>

      {/* ───────── READINESS + PRIVACY ───────── */}
      <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-5">
        <motion.section initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="bg-dark-card border border-dark-border rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="overline-brand mb-1">Before you start</p>
              <h2 className="text-lg font-black text-white">Ready check</h2>
            </div>
            <div className="relative w-14 h-14 shrink-0">
              <svg viewBox="0 0 44 44" className="w-full h-full -rotate-90">
                <circle cx="22" cy="22" r="18" fill="none" stroke="#1e1e2e" strokeWidth="4" />
                <circle cx="22" cy="22" r="18" fill="none" stroke={ready ? '#10b981' : '#f97316'} strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 18} strokeDashoffset={2 * Math.PI * 18 * (1 - readyPct / 100)} style={{ transition: 'stroke-dashoffset .5s, stroke .3s' }} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-white">{checked.length}/{CHECKS.length}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {CHECKS.map((c) => {
              const on = checked.includes(c.id);
              const Icon = c.icon;
              return (
                <button key={c.id} onClick={() => toggle(c.id)} role="checkbox" aria-checked={on}
                  className={`text-left p-3.5 rounded-xl border flex gap-3 transition active:scale-[0.98] ${on ? 'bg-success/10 border-success/40' : 'bg-dark-surface border-dark-border hover:border-brand/30'}`}>
                  <span className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center transition ${on ? 'bg-success/20 text-success' : 'bg-brand/10 text-brand-light'}`}>
                    {on ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-white">{c.title}</span>
                    <span className="block text-xs text-text-muted leading-snug">{c.text}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <button onClick={handleStart} disabled={starting}
            className={`w-full py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition disabled:opacity-60 ${ready ? 'fortis-btn-primary shadow-glow' : 'fortis-btn-secondary'}`}>
            {ready ? <>You're set. Start scan<ArrowRight className="w-4 h-4" /></> : <>Start scan anyway<ArrowRight className="w-4 h-4" /></>}
          </button>
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.08 }}
          className="bg-dark-card border border-dark-border rounded-3xl p-5 sm:p-6 flex flex-col gap-4">
          <div className="w-11 h-11 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center"><Lock className="w-5 h-5 text-brand-light" /></div>
          <div>
            <p className="overline-brand mb-1">Privacy &amp; responsible AI</p>
            <p className="text-sm text-text-muted leading-relaxed">
              Video is processed in memory. No frames are stored or sent externally.
            </p>
          </div>
          <p className="text-xs text-text-muted leading-relaxed border-t border-dark-border pt-4">
            Fortis Scan gives <strong className="text-text-secondary">fitness guidance only</strong>, not a medical diagnosis. Confidence scores reflect data quality, not clinical accuracy.
          </p>
        </motion.section>
      </div>
    </div>
  );
};

export default ScanOnboarding;