import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dumbbell, CheckCircle, Play, Sparkles, AlertCircle, ChevronDown, Plus, Minus,
  Target, TrendingUp, SkipForward, Timer, Award, Flame, Battery, Activity,
  Zap, Clock, Layers, RotateCcw, Wind, Youtube,
} from 'lucide-react';
import api, { getCached } from '../../services/api';
import SplashScreen from '../../components/SplashScreen';
import { DecisionExplanationCard } from '../../components/fortis/DecisionExplanationCard';

// ─── Types ────────────────────────────────────────────────────
type Phase = 'overview' | 'exercise' | 'rest' | 'feedback' | 'complete';
type Tone = 'hype' | 'calm' | 'support';
type Checkin = 'high' | 'ok' | 'low' | null;

interface ExerciseItem {
  id: number;
  exercise: {
    id: number; name: string; muscle_groups: string[]; equipment_required: string[];
    difficulty: string; instructions: string; category: string; image_url?: string;
    demo_url?: string;
  };
  planned_sets: number;
  planned_reps: number;
  planned_weight_kg?: number;
  order_index: number;
  adaptation_note?: string;
}

// ─── Images ───────────────────────────────────────────────────
// RepDB serves exercise-specific illustrations directly from its public dataset.
const REPDB_DATASET_URL = 'https://exercise-dataset.com/exercises.json';
const REPDB_IMAGE_BASE = 'https://exercise-dataset.com/';
const REPDB_IMAGE_ALIASES: Record<string, string> = {
  'Knee Push-up': 'Knee Push Ups',
  'Pike Push-up': 'Pike Push Ups',
  'Diamond Push-up': 'Diamond Push Ups',
  'Lateral Raise': 'Dumbbell Lateral Raise',
  'Front Raise': 'Dumbbell Front Raise',
  'Tricep Dip': 'Bench Dip',
  'Dumbbell Row': 'One Arm Dumbbell Row',
  'Hammer Curl': 'Dumbbell Hammer Curl',
  'Face Pull (Band)': 'Band Face Pull',
  'Resistance Band Row': 'Band Seated Row',
  'Jump Rope (Simulated)': 'Jump Rope',
  'Hip Thrust (Dumbbell)': 'Dumbbell Hip Thrust',
  'Thruster (Dumbbell)': 'Dumbbell Thruster',
  'Romanian Deadlift': 'Dumbbell Romanian Deadlift',
  'Reverse Lunge': 'Bodyweight Reverse Lunge',
  'Calf Raise': 'Standing Calf Raise',
};
const normalizeExerciseName = (name: string) => {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized.endsWith('s') ? normalized.slice(0, -1) : normalized;
};

const LEGACY_IMAGE_FALLBACKS: Record<string, string> = {
  'Push-up': 'https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=800&q=80',
  'Bodyweight Squat': 'https://images.unsplash.com/photo-1566241142559-40e1dab266c6?w=800&q=80',
  'Plank': 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=80',
};

const getExerciseDemoUrl = (exercise?: ExerciseItem['exercise']) => {
  if (exercise?.demo_url) return exercise.demo_url;
  if (!exercise?.name) return undefined;
  const query = `${exercise.name} exercise proper form demonstration`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
};

const hash = (s: string) => Array.from(s).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function resolveExerciseImage(name: string, imageIndex: Record<string, string>) {
  const key = normalizeExerciseName(name);
  const aliasKey = normalizeExerciseName(REPDB_IMAGE_ALIASES[name] || '');
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return imageIndex[key] || imageIndex[aliasKey] || `${REPDB_IMAGE_BASE}images/flat/${slug}-peak.webp`;
}

function handleImageFallback(event: React.SyntheticEvent<HTMLImageElement>, name: string) {
  event.currentTarget.onerror = null;
  event.currentTarget.src = LEGACY_IMAGE_FALLBACKS[name] || '/landing_imgs/hero.png';
}

const MUSCLE_GAIN: Record<string, string> = {
  chest: 'Upper body mass & pressing strength',
  back: 'Posture & pulling power',
  legs: 'Biggest muscle group — max calorie burn',
  shoulders: 'Wider frame & overhead strength',
  biceps: 'Curl strength & arm size',
  triceps: 'Push power & arm mass',
  core: 'Stability, balance & rotation',
  abs: 'Core definition & spinal stability',
  glutes: 'Hip power & shape',
  hamstrings: 'Posterior chain & injury prevention',
  quadriceps: 'Knee power & leg mass',
  calves: 'Lower leg endurance & spring',
  obliques: 'Rotational power',
  'full body': 'Total conditioning & calorie burn',
  cardio: 'Endurance & fat burning',
  default: 'Full body strength & engagement',
};
const getGain = (m?: string[]) => MUSCLE_GAIN[m?.[0]?.toLowerCase() || ''] || MUSCLE_GAIN.default;

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ─── Coach voice engine ───────────────────────────────────────
// The coach reacts to what the user is doing (moment) and how they feel (tone).
//   hype    → short, energetic
//   calm    → low-pressure, slower, breath-first (used when energy is low)
//   support → warm comeback after a missed session
type Moment = 'pre' | 'exerciseStart' | 'setFirst' | 'set' | 'setHeavier' | 'exerciseDone' | 'feedback' | 'finish';

const LINES: Record<Moment, Partial<Record<Tone, string[]>> & { calm: string[] }> = {
  pre: {
    hype: [
      "Lights up. {n} exercises between you and a win. Let's go.",
      'Warm body, sharp mind. Today we build something.',
      "You showed up — that's half the fight. Now let's finish it.",
    ],
    calm: [
      'No pressure today. Move well, breathe, and we call it a win.',
      "Energy's low, so we go smooth and steady. I've got you.",
      'Easy start. Find your rhythm and let the work come to you.',
    ],
    support: [
      "Good to see you back. No guilt — we pick up right here.",
      "Missed days happen. You're here now, and that's what counts. One set at a time.",
      "Fresh start. I've eased today in — you just have to begin.",
    ],
  },
  exerciseStart: {
    hype: ['{name}. Control the rep, own the range.', '{name} up. Brace, breathe, drive.', 'Eyes forward. {name} — make it clean.'],
    calm: ['{name}. Slow and smooth, no rush.', 'Settle in. Quality over speed on {name}.', 'Breathe first. Then {name}, nice and easy.'],
  },
  setFirst: {
    hype: ["First one down. That's how it starts.", 'Clean opener. Now stack another.', "Rep one in the bank. Don't let up."],
    calm: ['Nicely done. Just like that.', 'Good start. Steady breathing.', "That's it — smooth and controlled."],
  },
  set: {
    hype: ['Set {done} done — {left} to go. Stay sharp.', "That's the work. Reset, go again.", 'Strong. Hold that quality on the next one.'],
    calm: ["Good. Take your time — {left} left.", 'Well done. Shake it out, breathe.', 'Steady. No need to rush the next one.'],
  },
  setHeavier: {
    hype: ["You added weight and still hit it. That's progress."],
    calm: ["Heavier than planned, and you handled it. Lovely."],
  },
  exerciseDone: {
    hype: ['{name} — crushed. Shake it out, we move.', "That's {name} done. Momentum is yours.", 'Locked in and finished. Next up.'],
    calm: ['{name} done. Take a slow breath.', "Well done. That one's finished — easy does it.", 'Good work. Rest properly before the next.'],
  },
  feedback: {
    hype: ["Be honest with me — I'll tune tomorrow around it."],
    calm: ["Take a breath. There's no wrong answer — I just want to know how you feel."],
  },
  finish: {
    hype: [
      "That's a wrap. {sets} sets in {time}. You earned the credits.",
      "Session closed. {sets} sets, {time}, zero excuses. Proud of that one.",
      'Roll the credits — you did the work today.',
    ],
    calm: [
      "You finished, and that's what matters. Rest well — today was enough.",
      "Gentle work, done well. Recovery is part of the plan. I've got tomorrow.",
      "Good session. Hydrate, breathe, sleep. I'll take it from here.",
    ],
  },
};

function buildLine(moment: Moment, tone: Tone, vars: Record<string, string | number> = {}, salt = 0): string {
  const pool = LINES[moment][tone] ?? LINES[moment].calm;
  const raw = pool[(salt + (typeof vars.name === 'string' ? hash(vars.name) : 0)) % pool.length];
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

const TONE_STYLE: Record<Tone, { color: string; label: string }> = {
  hype: { color: '#f97316', label: 'Locked in' },
  calm: { color: '#38bdf8', label: 'Easy does it' },
  support: { color: '#f59e0b', label: 'Welcome back' },
};

// ─── Motion helpers ───────────────────────────────────────────
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function useTypewriter(text: string, speed = 24) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reducedMotion()) { setN(text.length); return; }
    setN(0);
    const id = setInterval(() => setN((v) => {
      if (v >= text.length) { clearInterval(id); return v; }
      return v + 1;
    }), speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return text.slice(0, n);
}

function useCountUp(target: number, active: boolean, ms = 1200) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (reducedMotion()) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, active, ms]);
  return v;
}

function CinematicStyles() {
  return (
    <style>{`
      @keyframes fx-kenburns { from { transform: scale(1) translate3d(0,0,0); } to { transform: scale(1.08) translate3d(-1.5%, -1%, 0); } }
      @keyframes fx-caret { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
      @keyframes fx-bar { from { height: 0; } to { height: 9vh; } }
      @keyframes fx-title { from { opacity: 0; transform: scale(1.18); letter-spacing: 0.5em; } to { opacity: 1; transform: scale(1); letter-spacing: 0.04em; } }
      @keyframes fx-fade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes fx-rise { 0% { transform: translateY(0) scale(1); opacity: 0; } 15% { opacity: 0.9; } 100% { transform: translateY(-105vh) scale(0.3); opacity: 0; } }
      @keyframes fx-breathe { 0%,100% { transform: scale(0.92); opacity: 0.5; } 50% { transform: scale(1.08); opacity: 1; } }
      .fx-kenburns { animation: fx-kenburns 18s ease-in-out infinite alternate; }
      .fx-caret { animation: fx-caret 0.9s steps(1) infinite; }
      .fx-bar { animation: fx-bar 1s cubic-bezier(.2,.8,.2,1) forwards; }
      .fx-title { animation: fx-title 1.1s cubic-bezier(.2,.8,.2,1) both; }
      .fx-fade { animation: fx-fade 0.7s ease-out both; }
      .fx-ember { animation: fx-rise linear infinite; }
      .fx-breathe { animation: fx-breathe 5s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .fx-kenburns, .fx-ember, .fx-breathe, .fx-caret { animation: none; }
        .fx-bar { animation: none; height: 9vh; }
        .fx-title, .fx-fade { animation: none; }
      }
    `}</style>
  );
}

// ─── Coach: cinematic stage + subtitle ────────────────────────
function Subtitle({ text, color }: { text: string; color: string }) {
  const typed = useTypewriter(text);
  return (
    <p className="text-base sm:text-lg font-semibold text-white leading-snug" aria-live="polite">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{typed}<span className="fx-caret ml-0.5 inline-block w-[2px] h-[1em] align-[-0.12em]" style={{ background: color }} /></span>
    </p>
  );
}

/** Full-bleed coach scene. Used on the overview and the rest screen. */
function CoachStage({ text, tone, caption, height = 'h-64 sm:h-72' }: { text: string; tone: Tone; caption?: string; height?: string }) {
  const { color, label } = TONE_STYLE[tone];
  return (
    <div className={`relative ${height} rounded-3xl overflow-hidden border border-dark-border bg-black`} style={{ boxShadow: `0 0 40px -12px ${color}66` }}>
      <img src="/landing_imgs/coach2.png" alt="Coach Fortis" className="fx-kenburns absolute inset-0 w-full h-full object-cover object-top sm:object-[50%_18%] opacity-90" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-transparent" />
      <div className="absolute inset-0 hidden sm:block bg-gradient-to-r from-black/85 via-black/30 to-transparent" />
      <div className="absolute top-0 inset-x-0 h-3 bg-black" />
      <div className="absolute bottom-0 inset-x-0 h-3 bg-black" />
      <div className="absolute inset-x-0 bottom-3 p-4 sm:p-6 sm:max-w-[62%] space-y-2">
        <div className="flex items-center gap-2 text-[11px] font-black">
          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
          <span style={{ color }}>Coach Fortis</span>
          <span className="px-1.5 py-0.5 rounded border text-[10px]" style={{ color, borderColor: `${color}55`, background: `${color}1f` }}>{label}</span>
          {caption && <span className="text-text-muted font-bold">{caption}</span>}
        </div>
        <Subtitle key={text} text={text} color={color} />
      </div>
    </div>
  );
}

/** Compact coach strip for in-set screens. */
function Coach({ quote, tone = 'hype' }: { quote: string; tone?: Tone }) {
  const { color } = TONE_STYLE[tone];
  return (
    <div className="flex items-center gap-3 bg-dark-card border rounded-2xl p-3" style={{ borderColor: `${color}40` }}>
      <div className="relative shrink-0">
        <div className="w-11 h-11 rounded-full overflow-hidden border-2" style={{ borderColor: color }}>
          <img src="/landing_imgs/hero.png" alt="Coach" className="w-full h-full object-cover object-top" />
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-dark-card" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-black" style={{ color }}>Coach Fortis</p>
        <Subtitle key={quote} text={quote} color={color} />
      </div>
    </div>
  );
}

// ─── Set Ring ─────────────────────────────────────────────────
function SetRing({
  total, done, label, sub, onLog, disabled, color,
}: { total: number; done: number; label: string; sub: string; onLog: () => void; disabled?: boolean; color: string }) {
  const r = 78;
  const circ = 2 * Math.PI * r;
  const gap = total > 1 ? 10 : 0;
  const arc = circ / total - gap;
  const [pulse, setPulse] = useState(false);

  const tap = () => {
    if (disabled) return;
    setPulse(true);
    setTimeout(() => setPulse(false), 350);
    onLog();
  };

  return (
    <button
      onClick={tap}
      disabled={disabled}
      aria-label={label}
      className={`relative w-56 h-56 mx-auto block rounded-full select-none transition-transform duration-200 active:scale-95 ${pulse ? 'scale-105' : ''} focus:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
    >
      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full -rotate-90">
        {Array.from({ length: total }).map((_, i) => {
          const filled = i < done;
          const active = i === done;
          return (
            <circle
              key={i} cx="100" cy="100" r={r} fill="none" strokeWidth={active ? 14 : 12} strokeLinecap="round"
              stroke={filled ? color : active ? `${color}59` : '#1e1e2e'}
              strokeDasharray={`${arc} ${circ - arc}`}
              strokeDashoffset={-i * (circ / total)}
              style={{ transition: 'stroke 0.4s, stroke-width 0.2s' }}
            />
          );
        })}
      </svg>
      <div className="absolute inset-6 rounded-full bg-dark-card border border-dark-border flex flex-col items-center justify-center shadow-glow">
        {done >= total ? (
          <>
            <CheckCircle className="w-10 h-10 text-success mb-1" />
            <span className="text-sm font-bold text-success">All sets done</span>
          </>
        ) : (
          <>
            <span className="text-[11px] text-text-muted font-bold">Tap to log</span>
            <span className="text-4xl font-black text-white leading-none my-1">
              {done + 1}<span className="text-lg text-text-muted">/{total}</span>
            </span>
            <span className="text-xs font-bold" style={{ color }}>{sub}</span>
          </>
        )}
      </div>
    </button>
  );
}

// ─── Stepper ──────────────────────────────────────────────────
function Stepper({ label, value, unit, step, min = 0, onChange }: {
  label: string; value: number; unit?: string; step: number; min?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-3 text-center">
      <p className="text-[11px] text-text-muted font-bold mb-1.5">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))} aria-label={`Decrease ${label}`}
          className="w-9 h-9 rounded-lg bg-dark-card border border-dark-border text-text-secondary hover:border-brand/50 hover:text-white active:scale-90 transition flex items-center justify-center">
          <Minus className="w-4 h-4" />
        </button>
        <span className="text-xl font-black text-white tabular-nums">{value}<span className="text-xs text-text-muted font-normal"> {unit}</span></span>
        <button onClick={() => onChange(+(value + step).toFixed(2))} aria-label={`Increase ${label}`}
          className="w-9 h-9 rounded-lg bg-dark-card border border-dark-border text-text-secondary hover:border-brand/50 hover:text-white active:scale-90 transition flex items-center justify-center">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Rest timer ───────────────────────────────────────────────
function RestTimer({ onDone, seconds: start = 30, color }: { onDone: () => void; seconds?: number; color: string }) {
  const [left, setLeft] = useState(start);
  const [total, setTotal] = useState(start);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (left === 0) { const t = setTimeout(() => doneRef.current(), 400); return () => clearTimeout(t); }
  }, [left]);

  const add = (n: number) => { setLeft((s) => s + n); setTotal((t) => t + n); };
  const r = 64, circ = 2 * Math.PI * r;
  const offset = circ - (total ? (total - left) / total : 1) * circ;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative w-44 h-44">
        <svg viewBox="0 0 150 150" className="w-full h-full -rotate-90">
          <circle cx="75" cy="75" r={r} fill="none" stroke="#1e1e2e" strokeWidth="9" />
          <circle cx="75" cy="75" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.95s linear' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-black text-white tabular-nums">{left}</span>
          <span className="text-xs text-text-muted font-bold flex items-center gap-1"><Timer className="w-3 h-3" />resting</span>
        </div>
      </div>
      <div className="flex gap-2">
        {[15, 30, 60].map((n) => (
          <button key={n} onClick={() => add(n)} className="fortis-btn-secondary text-xs py-2 px-3.5 flex items-center gap-1">
            <Plus className="w-3 h-3" />{n < 60 ? `${n}s` : '1m'}
          </button>
        ))}
      </div>
      <button onClick={onDone} className="fortis-btn-primary flex items-center gap-2 py-2.5 px-6 text-sm">
        <SkipForward className="w-4 h-4" />Skip rest
      </button>
    </div>
  );
}

// ─── Tap scale ────────────────────────────────────────────────
function Scale({ label, value, onChange, icon, low, high, color }: {
  label: string; value: number; onChange: (v: number) => void; icon: React.ReactNode; low: string; high: string; color: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-semibold text-text-primary flex items-center gap-1.5">{icon}{label}</span>
        <span className="text-lg font-black text-white">{value}<span className="text-xs text-text-muted font-normal">/10</span></span>
      </div>
      <div className="grid grid-cols-10 gap-1" role="radiogroup" aria-label={label}>
        {Array.from({ length: 10 }).map((_, i) => {
          const n = i + 1;
          const on = n <= value;
          return (
            <button key={n} role="radio" aria-checked={n === value} onClick={() => onChange(n)}
              className="h-9 rounded-md transition-all duration-150 hover:-translate-y-0.5 active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              style={{ background: on ? color : '#1e1e2e', opacity: on ? 0.35 + 0.65 * (n / 10) : 1 }}
              aria-label={`${n}`} />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-text-muted"><span>{low}</span><span>{high}</span></div>
    </div>
  );
}

// ─── Cinematic finale ─────────────────────────────────────────
// Beats: 1 title → 2 stats → 3 coach speaks → 4 exit. Tap anywhere to skip ahead.
function Finale({ time, sets, totalSets, volume, rpe, line, tone, onBack }: {
  time: number; sets: number; totalSets: number; volume: number; rpe: number; line: string; tone: Tone; onBack: () => void;
}) {
  const [beat, setBeat] = useState(0);
  const { color } = TONE_STYLE[tone];

  useEffect(() => {
    const timers = [500, 1900, 3500, 5200].map((d, i) => setTimeout(() => setBeat(i + 1), d));
    return () => timers.forEach(clearTimeout);
  }, []);

  const typed = useTypewriter(beat >= 3 ? line : '', 24);
  const setCount = useCountUp(sets, beat >= 2);
  const volCount = useCountUp(Math.round(volume), beat >= 2);

  const stats = [
    { l: 'Time', v: fmtTime(time) },
    { l: 'Sets', v: `${setCount}/${totalSets}` },
    { l: 'Volume', v: `${volCount}` },
    { l: 'Effort', v: `${rpe}/10` },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-y-auto" onClick={() => beat < 4 && setBeat(4)} role="dialog" aria-label="Workout complete">
      <img src="/landing_imgs/coach.png" alt="" className="fx-kenburns absolute inset-0 w-full h-full object-cover object-top opacity-35" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/40" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 40%, ${color}2e, transparent 60%)` }} />

      {tone === 'calm' ? (
        <div className="absolute left-1/2 top-[34%] -translate-x-1/2 w-64 h-64 rounded-full fx-breathe pointer-events-none" style={{ background: `radial-gradient(circle, ${color}33, transparent 70%)` }} />
      ) : (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          {Array.from({ length: 16 }).map((_, i) => (
            <span key={i} className="fx-ember absolute bottom-0 rounded-full" style={{
              left: `${(i * 61) % 100}%`, width: 3 + (i % 3), height: 3 + (i % 3), background: color,
              boxShadow: `0 0 8px ${color}`, animationDuration: `${4 + (i % 4)}s`, animationDelay: `${(i * 0.37) % 3}s`,
            }} />
          ))}
        </div>
      )}

      <div className="fx-bar fixed top-0 inset-x-0 bg-black z-10" style={{ height: 0 }} />
      <div className="fx-bar fixed bottom-0 inset-x-0 bg-black z-10" style={{ height: 0 }} />

      <div className="relative min-h-full flex flex-col items-center justify-center px-5 py-[12vh] gap-8 text-center">
        {beat >= 1 && (
          <div className="fx-title">
            <p className="text-sm font-bold text-text-secondary">{tone === 'calm' ? 'Well done' : 'Session'}</p>
            <h2 className="text-5xl sm:text-7xl font-black text-white leading-none">{tone === 'calm' ? 'Finished.' : 'Complete.'}</h2>
          </div>
        )}

        {beat >= 2 && (
          <div className="fx-fade grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-xl">
            {stats.map(({ l, v }) => (
              <div key={l} className="rounded-xl p-3 bg-black/50 backdrop-blur border" style={{ borderColor: `${color}40` }}>
                <p className="text-[11px] text-text-muted">{l}</p>
                <p className="text-2xl font-black text-white tabular-nums">{v}</p>
              </div>
            ))}
          </div>
        )}

        {beat >= 3 && (
          <div className="fx-fade w-full max-w-xl text-left rounded-2xl bg-black/60 backdrop-blur border p-4 flex gap-3" style={{ borderColor: `${color}55` }}>
            <div className="w-12 h-12 shrink-0 rounded-full overflow-hidden border-2" style={{ borderColor: color }}>
              <img src="/landing_imgs/scan.png" alt="" className="w-full h-full object-cover object-top" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black mb-1" style={{ color }}>Coach Fortis</p>
              <p className="text-base sm:text-lg font-semibold text-white leading-snug" aria-live="polite">
                <span className="sr-only">{line}</span>
                <span aria-hidden="true">{typed}<span className="fx-caret ml-0.5 inline-block w-[2px] h-[1em] align-[-0.12em]" style={{ background: color }} /></span>
              </p>
            </div>
          </div>
        )}

        {beat >= 4 ? (
          <div className="fx-fade flex flex-col items-center gap-2 max-w-sm">
            <p className="text-xs text-text-secondary">Your fitness state is updated. Tomorrow adapts to how you felt.</p>
            <button onClick={(e) => { e.stopPropagation(); onBack(); }} className="fortis-btn-primary py-3 px-8 text-sm font-bold flex items-center gap-2">
              <Award className="w-4 h-4" />View Progress &amp; XP
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-text-muted absolute bottom-[10vh]">Tap to skip</p>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────
const WorkoutInner: React.FC = () => {
  const navigate = useNavigate();
  const [workout, setWorkout] = useState<any>(null);
  const [repDbImages, setRepDbImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [adaptOpen, setAdaptOpen] = useState(false);
  const [adaptMinutes, setAdaptMinutes] = useState(20);
  const [adaptEquipment, setAdaptEquipment] = useState<string[]>(['bodyweight']);
  const [adaptDraft, setAdaptDraft] = useState<any>(null);
  const [comebackOpen, setComebackOpen] = useState(false);

  const [phase, setPhase] = useState<Phase>('overview');
  const [idx, setIdx] = useState(0);

  const [setsDone, setSetsDone] = useState<number[]>([]);
  const [repsAdj, setRepsAdj] = useState<number[]>([]);
  const [weightAdj, setWeightAdj] = useState<number[]>([]);
  const [loggedVolume, setLoggedVolume] = useState(0);

  const [filter, setFilter] = useState('All');
  const [openId, setOpenId] = useState<number | null>(null);

  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finalTime, setFinalTime] = useState(0);

  const [rpe, setRpe] = useState(7);
  const [energy, setEnergy] = useState(7);
  const [soreness, setSoreness] = useState(4);
  const [mood, setMood] = useState(7);
  const [pain, setPain] = useState(false);

  // coach state
  const [checkin, setCheckin] = useState<Checkin>(null);
  const [tiredNow, setTiredNow] = useState(false);
  const [coach, setCoach] = useState<string | null>(null);
  const [finaleLine, setFinaleLine] = useState('');
  const [finaleTone, setFinaleTone] = useState<Tone>('hype');
  const salt = useRef(0);

  const exercises: ExerciseItem[] = workout?.exercises || [];
  const current = exercises[idx];
  useEffect(() => {
    const controller = new AbortController();
    fetch(REPDB_DATASET_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Could not load the exercise image catalog');
        return response.json();
      })
      .then((catalog: { exercises?: Array<{ name_en?: string; images?: { flat?: Record<string, string> } }> }) => {
        const imageIndex: Record<string, string> = {};
        catalog.exercises?.forEach((exercise) => {
          const path = exercise.images?.flat?.peak || exercise.images?.flat?.main || exercise.images?.flat?.start;
          if (exercise.name_en && path) imageIndex[normalizeExerciseName(exercise.name_en)] = new URL(path, REPDB_IMAGE_BASE).toString();
        });
        setRepDbImages(imageIndex);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const images = useMemo(
    () => exercises.map((item) => item.exercise?.image_url || resolveExerciseImage(item.exercise?.name || '', repDbImages)),
    [exercises, repDbImages],
  );
  const imgFor = (it?: ExerciseItem) => (it ? images[exercises.indexOf(it)] : undefined);

  // ── coach context ──
  // Reads optional fields from the API; all are safe to be absent.
  // A missing workout record is not evidence of a missed scheduled session.
  const missed = false;
  const lowEnergy = checkin === 'low' || tiredNow
    || (typeof workout?.energy_level === 'number' && workout.energy_level <= 4)
    || (typeof workout?.recovery_score === 'number' && workout.recovery_score < 40);
  const tone: Tone = lowEnergy ? 'calm' : 'hype';
  const preTone: Tone = missed ? 'support' : tone;
  const activeColor = TONE_STYLE[tone].color;

  const preLine = useMemo(
    () => buildLine('pre', checkin === 'ok' || checkin === 'high' ? (missed ? 'support' : 'hype') : preTone, { n: exercises.length }, workout?.id ?? 0),
    [preTone, checkin, missed, exercises.length, workout?.id], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const say = (moment: Moment, vars: Record<string, string | number> = {}, t: Tone = tone) => {
    salt.current += 1;
    setCoach(buildLine(moment, t, vars, salt.current));
  };

  const fetchWorkout = (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    getCached('/api/workouts/today')
      .then((res) => setWorkout(res.data))
      .catch(() => { if (!silent) { setLoadError('Unable to load scheduled workout. Please try again.'); setWorkout(null); } })
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchWorkout(); }, []);

  useEffect(() => {
    setSetsDone(exercises.map(() => 0));
    setRepsAdj(exercises.map((e) => e.planned_reps));
    setWeightAdj(exercises.map((e) => e.planned_weight_kg || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout?.id, exercises.length]);

  useEffect(() => {
    if (!startedAt || phase === 'overview' || phase === 'complete') return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt, phase]);

  const muscleFilters = useMemo(() => {
    const set = new Set<string>();
    exercises.forEach((e) => e.exercise?.muscle_groups?.forEach((m) => set.add(m)));
    return ['All', ...Array.from(set)];
  }, [exercises]);

  const totalSets = exercises.reduce((a, e) => a + e.planned_sets, 0);
  const doneSets = setsDone.reduce((a, b) => a + b, 0);
  const plannedMin = workout?.estimated_duration_min;

  // ── actions ──
  const start = async (from = 0) => {
    if (!workout?.id) return;
    setSaving(true); setActionError(null);
    try {
      if (workout.status !== 'IN_PROGRESS') await api.post(`/api/workouts/${workout.id}/start`);
      setIdx(from);
      setStartedAt(Date.now()); setElapsed(0); setLoggedVolume(0);
      setSetsDone(exercises.map(() => 0));
      setTiredNow(false);
      say('exerciseStart', { name: exercises[from]?.exercise?.name || 'Exercise' });
      setPhase('exercise');
    } catch {
      setActionError('Could not start workout. Check your connection and retry.');
    } finally { setSaving(false); }
  };

  const generateAdaptation = async () => {
    if (!workout?.id) return;
    setSaving(true); setActionError(null);
    try { const res = await api.post(`/api/workouts/${workout.id}/adaptation-draft`, { available_minutes: adaptMinutes, equipment_ids: adaptEquipment }); setAdaptDraft(res.data); }
    catch (e: any) { setActionError(e?.response?.data?.detail || 'Could not prepare an adaptation. Please retry.'); }
    finally { setSaving(false); }
  };

  const acceptAdaptation = async () => {
    if (!workout?.id) return;
    setSaving(true); setActionError(null);
    try { const res = await api.post(`/api/workouts/${workout.id}/adapted-session`, { adaptation_id: Number(adaptDraft?.recommendation_id) }); setWorkout(res.data); setAdaptDraft(null); setAdaptOpen(false); }
    catch (e: any) { setActionError(e?.response?.data?.detail || 'Could not save this session. Your original plan is unchanged.'); }
    finally { setSaving(false); }
  };

  const logSet = () => {
    if (!current || setsDone[idx] >= current.planned_sets) return;
    const done = setsDone[idx] + 1;
    const left = current.planned_sets - done;
    const name = current.exercise.name;
    const heavier = (weightAdj[idx] || 0) > (current.planned_weight_kg || 0) && (current.planned_weight_kg || 0) > 0;

    if (left === 0) say('exerciseDone', { name });
    else if (heavier) say('setHeavier', { name });
    else if (done === 1) say('setFirst', { name });
    else say('set', { name, done, left });

    setSetsDone((a) => a.map((v, i) => (i === idx ? v + 1 : v)));
    setLoggedVolume((v) => v + repsAdj[idx] * (weightAdj[idx] || 1));
    setPhase('rest');
  };

  const goNext = useCallback(() => {
    if (idx < exercises.length - 1) {
      setIdx(idx + 1);
      setPhase('exercise');
      salt.current += 1;
      setCoach(buildLine('exerciseStart', lowEnergy ? 'calm' : 'hype', { name: exercises[idx + 1]?.exercise?.name || 'Next up' }, salt.current));
    } else {
      setFinalTime(elapsed);
      salt.current += 1;
      setCoach(buildLine('feedback', lowEnergy ? 'calm' : 'hype', {}, salt.current));
      setPhase('feedback');
    }
  }, [idx, exercises, elapsed, lowEnergy]);

  const handleRestDone = useCallback(() => {
    if (current && setsDone[idx] >= current.planned_sets) goNext();
    else setPhase('exercise');
  }, [current, setsDone, idx, goNext]);

  const undoSet = () => setSetsDone((a) => a.map((v, i) => (i === idx ? Math.max(0, v - 1) : v)));

  const complete = async () => {
    if (!workout?.id) return;
    setSaving(true); setActionError(null);
    try {
      await api.post(`/api/workouts/${workout.id}/complete`, {
        overall_rpe: rpe, energy_level: energy, soreness_level: soreness, pain_flag: pain,
        difficulty_notes: `Mood: ${mood}/10. Logged ${doneSets}/${totalSets} sets across ${exercises.length} exercises.`,
      });
      // Finale tone follows how the session actually felt.
      const t: Tone = energy <= 4 || pain || rpe >= 9 ? 'calm' : 'hype';
      setFinaleTone(t);
      setFinaleLine(
        pain
          ? "You flagged pain, and I'm taking it seriously. Rest up — I'll protect you in the next session."
          : buildLine('finish', t, { sets: doneSets, time: fmtTime(finalTime) }, doneSets + rpe),
      );
      setPhase('complete');
      fetchWorkout(true); // silent: don't unmount the finale behind a splash screen
    } catch {
      setActionError('Feedback could not be saved. Check your connection and retry.');
    } finally { setSaving(false); }
  };

  // ── Loading / error ──
  if (loading) {
    return <SplashScreen isLoader message="Loading your personalised session…" />;
  }
  if (loadError) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8 text-center space-y-3 bg-dark-card border border-dark-border rounded-2xl">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
        <p className="text-sm text-text-secondary">{loadError}</p>
        <button onClick={() => fetchWorkout()} className="fortis-btn-primary py-2 px-5 text-xs">Try again</button>
      </div>
    );
  }

  // ── Complete: cinematic finale ──
  if (phase === 'complete') {
    return (
      <Finale time={finalTime} sets={doneSets} totalSets={totalSets} volume={loggedVolume} rpe={rpe}
        line={finaleLine} tone={finaleTone}
        onBack={() => navigate('/progress', { state: { workoutCompleted: true } })} />
    );
  }

  // ── Feedback ──
  if (phase === 'feedback') {
    const fbTone: Tone = energy <= 4 ? 'calm' : 'hype';
    return (
      <div className="max-w-lg mx-auto space-y-5 animate-slide-up">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-black text-white">How did that feel?</h2>
          <p className="text-sm text-text-secondary">{doneSets} sets in {fmtTime(finalTime)}. Tap a level to tune your next session.</p>
        </div>
        <Coach tone={fbTone} quote={coach ?? buildLine('feedback', fbTone)} />
        {actionError && <div role="alert" className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-300">{actionError}</div>}
        <div className="bg-dark-card border border-dark-border rounded-2xl p-5 space-y-5 shadow-card">
          <Scale label="Difficulty (RPE)" value={rpe} onChange={setRpe} low="Easy" high="Max effort" color="#f97316" icon={<Flame className="w-4 h-4 text-brand" />} />
          <Scale label="Energy left" value={energy} onChange={setEnergy} low="Drained" high="Energised" color="#10b981" icon={<Battery className="w-4 h-4 text-success" />} />
          <Scale label="Expected soreness" value={soreness} onChange={setSoreness} low="None" high="Very sore" color="#f59e0b" icon={<Activity className="w-4 h-4 text-warning" />} />
          <Scale label="Mood" value={mood} onChange={setMood} low="Low" high="Great" color="#facc15" icon={<Zap className="w-4 h-4 text-yellow-400" />} />
          <button onClick={() => setPain((p) => !p)} aria-pressed={pain}
            className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition ${pain ? 'bg-danger/10 border-danger/40' : 'bg-dark-surface border-dark-border hover:border-brand/30'}`}>
            <span>
              <span className="block text-sm font-semibold text-text-primary">Any sharp pain or injury?</span>
              <span className="block text-xs text-text-muted">Sharp pain, not normal soreness</span>
            </span>
            <span className={`relative w-12 h-6 rounded-full transition-colors ${pain ? 'bg-danger' : 'bg-dark-border'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${pain ? 'translate-x-6' : ''}`} />
            </span>
          </button>
        </div>
        <button onClick={complete} disabled={saving} className="fortis-btn-primary w-full py-3.5 font-bold text-sm flex items-center justify-center gap-2">
          {saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</> : <><CheckCircle className="w-4 h-4" />Save &amp; adapt my plan</>}
        </button>
      </div>
    );
  }

  // ── Rest: coach reacts to the set you just logged ──
  if (phase === 'rest' && current) {
    const moreSets = setsDone[idx] < current.planned_sets;
    const next = moreSets ? current : exercises[idx + 1];
    return (
      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        <CoachStage
          tone={tone}
          text={coach ?? buildLine('set', tone, { done: setsDone[idx], left: current.planned_sets - setsDone[idx] })}
          caption={moreSets ? `Set ${setsDone[idx]} of ${current.planned_sets}` : `${current.exercise.name} complete`}
          height="h-56"
        />
        <div className="bg-dark-card border rounded-2xl p-6" style={{ borderColor: `${activeColor}40` }}>
          {lowEnergy && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-sky-300 font-bold mb-4"><Wind className="w-3.5 h-3.5" />In through the nose, slow out through the mouth.</p>
          )}
          <RestTimer onDone={handleRestDone} seconds={(moreSets ? 30 : 45) + (lowEnergy ? 15 : 0)} color={activeColor} />
        </div>
        {next ? (
          <div className="relative h-24 rounded-xl overflow-hidden border border-dark-border">
            <img src={imgFor(next)} alt="" onError={(event) => handleImageFallback(event, next.exercise?.name || '')} className="w-full h-full object-cover opacity-50" />
            <div className="absolute inset-0 bg-gradient-to-r from-dark-card via-dark-card/60 to-transparent" />
            <div className="absolute inset-0 flex flex-col justify-center px-4">
              <p className="text-xs text-text-muted font-bold">{moreSets ? `Next: set ${setsDone[idx] + 1}` : 'Up next'}</p>
              <p className="font-black text-white">{next.exercise?.name}</p>
              <p className="text-xs text-text-secondary">{next.planned_sets} × {next.planned_reps}{next.planned_weight_kg ? ` · ${next.planned_weight_kg} kg` : ''}</p>
            </div>
          </div>
        ) : (
          <div className="bg-dark-card border border-dark-border rounded-xl p-4 text-sm text-text-secondary text-center">Last exercise done. Feedback is next.</div>
        )}
      </div>
    );
  }

  // ── Exercise ──
  if (phase === 'exercise' && current) {
    const ex = current.exercise;
    const done = setsDone[idx] || 0;
    const allDone = done >= current.planned_sets;
    const weight = weightAdj[idx] ?? 0;
    const reps = repsAdj[idx] ?? current.planned_reps;

    return (
      <div className="max-w-lg mx-auto space-y-4 animate-slide-up">
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs text-text-muted font-bold">
            <span>Exercise {idx + 1} of {exercises.length}</span>
            <span className="flex items-center gap-1 tabular-nums"><Clock className="w-3 h-3" />{fmtTime(elapsed)}</span>
          </div>
          <div className="flex gap-1">
            {exercises.map((e, i) => {
              const full = (setsDone[i] || 0) >= e.planned_sets;
              return (
                <button key={e.id ?? i} onClick={() => setIdx(i)} title={e.exercise?.name} aria-label={`Go to ${e.exercise?.name}`}
                  className={`h-2 flex-1 rounded-full transition-all hover:h-3 ${i === idx ? 'bg-brand' : full ? 'bg-success' : (setsDone[i] || 0) > 0 ? 'bg-brand/40' : 'bg-dark-border'}`} />
              );
            })}
          </div>
        </div>

        <Coach tone={tone} quote={coach ?? buildLine('exerciseStart', tone, { name: ex.name })} />

        <div className="relative h-44 rounded-2xl overflow-hidden border border-dark-border bg-dark-surface">
          <img key={ex.id} src={imgFor(current)} alt={ex.name} onError={(event) => handleImageFallback(event, ex.name)} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-dark-bg via-dark-bg/40 to-transparent" />
          <span className={`absolute top-3 left-3 text-[10px] font-black px-2.5 py-1 rounded-full border ${
            ex.difficulty === 'BEGINNER' ? 'bg-success/20 text-success border-success/30'
            : ex.difficulty === 'INTERMEDIATE' ? 'bg-warning/20 text-warning border-warning/30'
            : 'bg-danger/20 text-danger border-danger/30'}`}>{ex.difficulty}</span>
          <div className="absolute bottom-3 left-4 right-4">
            <h2 className="text-2xl font-black text-white leading-tight">{ex.name}</h2>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {ex.muscle_groups?.map((m) => (
                <span key={m} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand/15 text-brand-light border border-brand/25">{m}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-dark-card border border-dark-border rounded-2xl p-5 space-y-5 shadow-card">
          <SetRing total={current.planned_sets} done={done} disabled={allDone} color={activeColor}
            label={`Log set ${done + 1} of ${current.planned_sets}`}
            sub={`${reps} reps${weight ? ` · ${weight}kg` : ''}`} onLog={logSet} />
          <div className="grid grid-cols-2 gap-2.5">
            <Stepper label="Reps" value={reps} step={1} min={1} onChange={(v) => setRepsAdj((a) => a.map((x, i) => (i === idx ? v : x)))} />
            <Stepper label="Weight" value={weight} unit="kg" step={2.5} onChange={(v) => setWeightAdj((a) => a.map((x, i) => (i === idx ? v : x)))} />
          </div>
          <div className="flex items-center justify-center gap-4">
            {done > 0 && !allDone && (
              <button onClick={undoSet} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-white transition">
                <RotateCcw className="w-3 h-3" />Undo last set
              </button>
            )}
            <button
              onClick={() => { const next = !tiredNow; setTiredNow(next); say('exerciseStart', { name: ex.name }, next ? 'calm' : 'hype'); }}
              aria-pressed={tiredNow}
              className={`flex items-center gap-1.5 text-xs transition ${tiredNow ? 'text-sky-300' : 'text-text-muted hover:text-white'}`}>
              <Battery className="w-3 h-3" />{tiredNow ? 'Easy mode on' : 'Running low?'}
            </button>
          </div>
        </div>

        <div className="bg-dark-card border border-dark-border rounded-2xl p-4 space-y-3">
          <p className="text-xs text-brand-light font-semibold">{current.adaptation_note || 'Full range of motion. Quality over speed.'}</p>
          <div className="flex items-start gap-3">
            <TrendingUp className="w-4 h-4 text-brand mt-0.5 shrink-0" />
            <p className="text-sm text-text-secondary">{getGain(ex.muscle_groups)}</p>
          </div>
          {ex.instructions && (
            <div className="flex items-start gap-3">
              <Target className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
              <p className="text-sm text-text-secondary leading-relaxed">{ex.instructions}</p>
            </div>
          )}
          {getExerciseDemoUrl(ex) && (
            <a href={getExerciseDemoUrl(ex)} target="_blank" rel="noopener noreferrer"
              aria-label={`Find a ${ex.name} demo video on YouTube`}
              className="fortis-btn-secondary w-full py-2.5 text-sm flex items-center justify-center gap-2">
              <Youtube className="w-4 h-4 text-red-400" />Find demo video on YouTube
            </a>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={goNext} className="fortis-btn-secondary flex-1 py-3 text-sm flex items-center justify-center gap-1.5">
            <SkipForward className="w-4 h-4" />{idx === exercises.length - 1 ? 'Finish early' : 'Skip exercise'}
          </button>
          {allDone && (
            <button onClick={goNext} className="fortis-btn-primary flex-[2] py-3 font-bold text-sm flex items-center justify-center gap-2 shadow-glow">
              <CheckCircle className="w-4 h-4" />{idx === exercises.length - 1 ? 'Finish workout' : 'Next exercise'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Overview ──
  const visible = exercises
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => filter === 'All' || item.exercise?.muscle_groups?.some((m) => m === filter));

  const CHECKINS: { id: Exclude<Checkin, null>; label: string }[] = [
    { id: 'high', label: 'Fired up' }, { id: 'ok', label: 'Okay' }, { id: 'low', label: 'Running low' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-brand/20 text-brand-light border border-brand/30">{workout?.decision_type || 'ADAPTED'} training</span>
            {workout?.adjustment_factor && workout.adjustment_factor !== 1.0 && (
              <span className="text-xs text-warning flex items-center gap-1 font-semibold"><Sparkles className="w-3.5 h-3.5" />Adaptive factor {workout.adjustment_factor}x</span>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white">{workout?.workout_type || "Today's session"}</h1>
        </div>
        {workout?.status !== 'COMPLETED' ? (
          <button onClick={() => start(0)} disabled={saving || exercises.length === 0}
            className="fortis-btn-primary flex items-center justify-center gap-2 shadow-glow py-3 px-7">
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
            Start session
          </button>
        ) : (
          <span className="flex items-center gap-2 text-success text-sm font-bold bg-success/10 border border-success/20 px-4 py-2 rounded-xl"><CheckCircle className="w-4 h-4" />Completed</span>
        )}
      </div>

      {actionError && <div role="alert" className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-300">{actionError}</div>}

      {/* Cinematic coach opening: adapts to energy and missed sessions */}
      <CoachStage tone={preTone} text={preLine} caption={missed ? 'Comeback session' : undefined} />

      {workout?.status !== 'COMPLETED' && exercises.length > 0 && (
        <section className="rounded-2xl border border-dark-border bg-dark-card p-4">
          {!comebackOpen ? <button onClick={() => setComebackOpen(true)} className="text-sm font-bold text-brand-light">Help me get back on track</button> : <div className="space-y-3">
            <div><h2 className="font-black text-white">Every return counts.</h2><p className="text-xs text-text-secondary">Your routine can change. Let's find a realistic next step.</p><p className="text-xs text-text-muted mt-1">{workout.workout_type || 'Your planned session'} · {exercises.length} exercises · no extra sessions added</p></div>
            <p className="text-sm text-text-secondary">Getting back into your routine starts with one manageable step.</p>
            <div className="flex flex-wrap gap-2"><button onClick={() => setComebackOpen(false)} className="fortis-btn-secondary px-3 py-2 text-xs">Resume my plan</button><button onClick={() => {setAdaptOpen(true);setAdaptMinutes((workout?.estimated_duration_min || 40) > 20 ? 20 : 15);setComebackOpen(false);}} className="fortis-btn-secondary px-3 py-2 text-xs">Start a shorter session</button><button onClick={() => setComebackOpen(false)} className="fortis-btn-secondary px-3 py-2 text-xs">Take more time</button></div>
            <button onClick={() => setComebackOpen(false)} className="text-xs text-text-muted underline">Close</button>
          </div>}
        </section>
      )}

      {workout?.status !== 'COMPLETED' && exercises.length > 0 && (
        <div className="space-y-3">
          {!adaptOpen && <button onClick={() => { setAdaptOpen(true); setAdaptDraft(null); }} className="fortis-btn-secondary w-full py-3 font-bold text-sm">ADAPT TODAY'S WORKOUT</button>}
          {adaptOpen && !adaptDraft && <section className="rounded-2xl border border-dark-border bg-dark-card p-5 space-y-4">
            <div><h2 className="text-lg font-black text-white">Time &amp; equipment switch</h2><p className="text-xs text-text-muted">Build a reviewable draft. Your saved plan stays unchanged.</p></div>
            <fieldset><legend className="text-xs font-bold text-text-secondary mb-2">Available time</legend><div className="flex flex-wrap gap-2">{[10,15,20,30,45].map((n) => <button key={n} aria-pressed={adaptMinutes===n} onClick={() => setAdaptMinutes(n)} className={`rounded-full border px-3 py-1.5 text-xs ${adaptMinutes===n?'border-brand bg-brand/20 text-white':'border-dark-border text-text-secondary'}`}>{n} min</button>)}</div></fieldset>
            <fieldset><legend className="text-xs font-bold text-text-secondary mb-2">Available equipment</legend><div className="flex flex-wrap gap-2">{[['bodyweight','Bodyweight only'],['dumbbells','Dumbbells'],['resistance_bands','Resistance bands'],['exercise_mat','Exercise mat'],['pull_up_bar','Pull-up bar'],['bench','Bench'],['full_gym','Full gym']].map(([id,label]) => <button key={id} aria-pressed={adaptEquipment.includes(id)} onClick={() => setAdaptEquipment(id==='full_gym'?['full_gym']:id==='bodyweight'?(adaptEquipment.length===1&&adaptEquipment[0]==='bodyweight'?[]: ['bodyweight']):adaptEquipment.filter(x=>x!=='bodyweight'&&x!=='full_gym').includes(id)?adaptEquipment.filter(x=>x!==id):[...adaptEquipment.filter(x=>x!=='full_gym'),id])} className={`rounded-full border px-3 py-1.5 text-xs ${adaptEquipment.includes(id)?'border-brand bg-brand/20 text-white':'border-dark-border text-text-secondary'}`}>{label}</button>)}</div></fieldset>
            <div className="flex gap-2"><button onClick={generateAdaptation} disabled={saving||adaptEquipment.length===0} className="fortis-btn-primary flex-1 py-2.5 text-sm">{saving?'Preparing…':'Review adaptation'}</button><button onClick={()=>setAdaptOpen(false)} className="fortis-btn-secondary px-4 py-2.5 text-sm">Cancel</button></div>
          </section>}
          {adaptOpen && adaptDraft && <DecisionExplanationCard draft={adaptDraft} busy={saving} onAccept={acceptAdaptation} onKeep={()=>{ if (workout?.id && adaptDraft?.recommendation_id) void api.post(`/api/workouts/${workout.id}/adaptation-drafts/${Number(adaptDraft.recommendation_id)}/reject`).catch(()=>undefined); setAdaptDraft(null);setAdaptOpen(false); }} />}
        </div>
      )}

      {workout?.status !== 'COMPLETED' && exercises.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="How is your energy today?">
          <span className="text-xs font-bold text-text-muted mr-1">Energy today</span>
          {CHECKINS.map((c) => (
            <button key={c.id} role="radio" aria-checked={checkin === c.id} onClick={() => setCheckin(c.id)}
              className={`text-xs font-bold px-3.5 py-1.5 rounded-full border transition ${checkin === c.id
                ? (c.id === 'low' ? 'bg-sky-400/20 text-sky-200 border-sky-400/50' : 'bg-brand text-white border-brand')
                : 'bg-dark-card text-text-secondary border-dark-border hover:border-brand/40'}`}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3">
        {[
          { icon: <Clock className="w-4 h-4" />, v: plannedMin != null ? `${plannedMin}` : '—', l: 'minutes' },
          { icon: <Dumbbell className="w-4 h-4" />, v: `${exercises.length}`, l: 'exercises' },
          { icon: <Layers className="w-4 h-4" />, v: `${totalSets}`, l: 'total sets' },
        ].map(({ icon, v, l }) => (
          <div key={l} className="bg-dark-card border border-dark-border rounded-xl p-3 flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">{icon}</span>
            <div><p className="text-xl font-black text-white leading-none">{v}</p><p className="text-[11px] text-text-muted mt-0.5">{l}</p></div>
          </div>
        ))}
      </div>

      {exercises.length === 0 ? (
        <div className="bg-dark-card border border-dark-border rounded-xl p-8 text-center space-y-2">
          <Dumbbell className="w-8 h-8 text-text-muted mx-auto opacity-50" />
          <h3 className="text-sm font-bold text-white">No exercises scheduled</h3>
          <p className="text-xs text-text-secondary max-w-sm mx-auto">Your recovery score indicates rest, or your training profile is still calibrating.</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter by muscle group">
            {muscleFilters.map((m) => (
              <button key={m} role="tab" aria-selected={filter === m} onClick={() => setFilter(m)}
                className={`shrink-0 text-xs font-bold px-3.5 py-1.5 rounded-full border transition ${filter === m ? 'bg-brand text-white border-brand shadow-glow' : 'bg-dark-card text-text-secondary border-dark-border hover:border-brand/40'}`}>
                {m}
              </button>
            ))}
          </div>

          <ol className="relative space-y-3 pl-0 sm:pl-8">
            <span className="hidden sm:block absolute left-[11px] top-2 bottom-2 w-px bg-gradient-to-b from-brand/60 via-dark-border to-transparent" />
            {visible.map(({ item, index }) => {
              const open = openId === (item.id ?? index);
              const ex = item.exercise;
              return (
                <li key={item.id ?? index} className="relative">
                  <span className="hidden sm:flex absolute -left-8 top-5 w-6 h-6 rounded-full bg-dark-card border-2 border-brand text-[10px] font-black text-brand-light items-center justify-center">{index + 1}</span>
                  <div className={`bg-dark-card border rounded-2xl overflow-hidden transition-all duration-300 ${open ? 'border-brand/40 shadow-glow' : 'border-dark-border hover:border-brand/25'}`}>
                    <button onClick={() => setOpenId(open ? null : item.id ?? index)} aria-expanded={open}
                      className="w-full flex items-stretch text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                      <div className="relative w-24 sm:w-32 shrink-0 overflow-hidden">
                        <img src={imgFor(item)} alt="" loading="lazy" onError={(event) => handleImageFallback(event, ex?.name || '')}
                          className={`w-full h-full object-cover transition-transform duration-500 ${open ? 'scale-110' : ''}`} />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-dark-card/50" />
                      </div>
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <h3 className="font-bold text-white leading-tight">{ex?.name}</h3>
                          <p className="text-xs text-text-muted mt-0.5 truncate">{getGain(ex?.muscle_groups)}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-bold text-white">{item.planned_sets} × {item.planned_reps}</p>
                            {(item.planned_weight_kg ?? 0) > 0 && <p className="text-xs text-brand-light font-bold">{item.planned_weight_kg} kg</p>}
                          </div>
                          <ChevronDown className={`w-4 h-4 text-text-muted transition-transform duration-300 ${open ? 'rotate-180 text-brand' : ''}`} />
                        </div>
                      </div>
                    </button>

                    <div className={`grid transition-all duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                      <div className="overflow-hidden">
                        <div className="p-4 pt-0 space-y-3 border-t border-dark-border/60">
                          {item.adaptation_note && (
                            <p className="mt-3 text-xs text-brand-light font-medium bg-brand/10 px-2.5 py-1.5 rounded-lg border border-brand/20">{item.adaptation_note}</p>
                          )}
                          {ex?.instructions && <p className="pt-2 text-sm text-text-secondary leading-relaxed">{ex.instructions}</p>}
                          {getExerciseDemoUrl(ex) && (
                            <a href={getExerciseDemoUrl(ex)} target="_blank" rel="noopener noreferrer"
                              aria-label={`Find a ${ex.name} demo video on YouTube`}
                              className="fortis-btn-secondary text-xs py-2 px-4 inline-flex items-center gap-1.5">
                              <Youtube className="w-3.5 h-3.5 text-red-400" />Find demo video on YouTube
                            </a>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {ex?.muscle_groups?.map((m) => (
                              <span key={m} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand/10 text-brand-light border border-brand/20">{m}</span>
                            ))}
                            {ex?.equipment_required?.map((q) => (
                              <span key={q} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-dark-surface text-text-muted border border-dark-border">{q}</span>
                            ))}
                          </div>
                          {workout?.status !== 'COMPLETED' && (
                            <button onClick={() => start(index)} disabled={saving} className="fortis-btn-secondary text-xs py-2 px-4 flex items-center gap-1.5">
                              <Play className="w-3 h-3 fill-current" />Start from here
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
            {visible.length === 0 && <p className="text-sm text-text-muted text-center py-6">No exercises target {filter} today.</p>}
          </ol>
        </>
      )}
      <p className="text-center text-[11px] text-text-muted">
        Exercise data by <a href="https://repdb.co" target="_blank" rel="noopener noreferrer" className="underline hover:text-text-secondary">RepDB (repdb.co)</a>
      </p>
    </div>
  );
};

export const WorkoutPage: React.FC = () => (
  <>
    <CinematicStyles />
    <WorkoutInner />
  </>
);

export default WorkoutPage;
