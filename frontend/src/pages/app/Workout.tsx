import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Dumbbell, CheckCircle, Play, Sparkles, AlertCircle, ChevronDown, Plus, Minus,
  Target, TrendingUp, SkipForward, Timer, Award, Flame, Battery, Activity,
  Zap, Clock, Layers, RotateCcw,
} from 'lucide-react';
import api, { getCached } from '../../services/api';
import SplashScreen from '../../components/SplashScreen';

// ─── Types ────────────────────────────────────────────────────
type Phase = 'overview' | 'exercise' | 'rest' | 'feedback' | 'complete';

interface ExerciseItem {
  id: number;
  exercise: {
    id: number; name: string; muscle_groups: string[]; equipment_required: string[];
    difficulty: string; instructions: string; category: string; image_url?: string;
  };
  planned_sets: number;
  planned_reps: number;
  planned_weight_kg?: number;
  order_index: number;
  adaptation_note?: string;
}

// ─── Images ───────────────────────────────────────────────────
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=800&q=80`;

// Exercise-specific photos (exact name match).
const EXERCISE_IMAGES: Record<string, string> = {
  'Push-up': U('1598971639058-fab3c3109a00'), 'Knee Push-up': U('1571019614242-c5c5dee9f50b'),
  'Pike Push-up': U('1571019613454-1cb2f99b2d8b'), 'Diamond Push-up': U('1616803689943-5601631c7fec'),
  'Dumbbell Floor Press': U('1532029837206-abbe2b7620e3'), 'Dumbbell Shoulder Press': U('1581009146145-b5ef050c2e1e'),
  'Lateral Raise': U('1583454110551-21f2fa2afe61'), 'Tricep Dip': U('1530822847156-5df684ec5933'),
  'Pull-up': U('1598266663439-2056e6900339'), 'Dumbbell Row': U('1534368786749-b63e05c90863'),
  'Dumbbell Bicep Curl': U('1581009137042-c552e485697a'), 'Resistance Band Row': U('1549576490-b0b4831ef60a'),
  'Bodyweight Squat': U('1566241142559-40e1dab266c6'), 'Romanian Deadlift': U('1517963628607-235ccdd5476c'),
  'Reverse Lunge': U('1574680096145-d05b474e2155'), 'Glute Bridge': U('1601422407692-ec4eeec1d9b3'),
  'Step-up': U('1607962837359-5e7e89f86776'), 'Calf Raise': U('1547919307-1ecb10702e6f'),
  'Wall Sit': U('1434682881908-b43d0467b798'), 'Plank': U('1571019614242-c5c5dee9f50b'),
  'Jumping Jack': U('1476480862126-209bfaa8edc8'), 'Jump Rope (Simulated)': U('1518611012118-696072aa579a'),
  "World's Greatest Stretch": U('1544367567-0f2fcb009e0b'),
};

// Category pools: each exercise in a category gets a different photo.
const CATEGORY_POOLS: Record<string, string[]> = {
  upper_push: ['1598971639058-fab3c3109a00', '1532029837206-abbe2b7620e3', '1581009146145-b5ef050c2e1e', '1583454110551-21f2fa2afe61', '1530822847156-5df684ec5933', '1616803689943-5601631c7fec'].map(U),
  upper_pull: ['1598266663439-2056e6900339', '1534368786749-b63e05c90863', '1581009137042-c552e485697a', '1549576490-b0b4831ef60a'].map(U),
  lower: ['1566241142559-40e1dab266c6', '1574680096145-d05b474e2155', '1517963628607-235ccdd5476c', '1607962837359-5e7e89f86776', '1547919307-1ecb10702e6f', '1601422407692-ec4eeec1d9b3'].map(U),
  core: ['1571019614242-c5c5dee9f50b', '1571019613454-1cb2f99b2d8b', '1601422407692-ec4eeec1d9b3', '1434682881908-b43d0467b798'].map(U),
  compound: ['1517963628607-235ccdd5476c', '1532029837206-abbe2b7620e3', '1434682881908-b43d0467b798', '1476480862126-209bfaa8edc8'].map(U),
  cardio: ['1476480862126-209bfaa8edc8', '1518611012118-696072aa579a', '1434682881908-b43d0467b798'].map(U),
  mobility: ['1544367567-0f2fcb009e0b', '1534438327276-14e5300c3a48'].map(U),
};
const ALL_PHOTOS = Array.from(new Set(Object.values(CATEGORY_POOLS).flat()));

const hash = (s: string) => Array.from(s).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** One image per exercise, never repeating within a session while photos remain.
 *  Priority: API image_url -> name match -> category pool -> any unused photo. */
function assignImages(items: ExerciseItem[]): string[] {
  const used = new Set<string>();
  return items.map((it) => {
    const ex = it.exercise;
    const pool = CATEGORY_POOLS[ex?.category?.toLowerCase() || ''] || ALL_PHOTOS;
    const off = hash(ex?.name || '') % pool.length;
    const rotated = [...pool.slice(off), ...pool.slice(0, off)];
    const candidates = [ex?.image_url, EXERCISE_IMAGES[ex?.name], ...rotated, ...ALL_PHOTOS].filter(Boolean) as string[];
    const pick = candidates.find((c) => !used.has(c)) || candidates[0];
    used.add(pick);
    return pick;
  });
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

// ─── Coach strip ──────────────────────────────────────────────
function Coach({ quote, compact = false }: { quote: string; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 bg-dark-card border border-brand/20 rounded-2xl ${compact ? 'p-3' : 'p-4'} shadow-glow`}>
      <div className="relative shrink-0">
        <div className={`${compact ? 'w-10 h-10' : 'w-14 h-14'} rounded-full overflow-hidden border-2 border-brand`}>
          <img src="/landing_imgs/coach.png" alt="Coach" className="w-full h-full object-cover object-top" />
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-dark-card" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-black text-brand-light">Coach Fortis <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-brand/20 text-brand border border-brand/30">AI</span></p>
        <p className="text-sm text-text-secondary leading-snug">{quote}</p>
      </div>
    </div>
  );
}

// ─── Set Ring: the centrepiece — one arc per set, tap to log ──
function SetRing({
  total, done, label, sub, onLog, disabled,
}: { total: number; done: number; label: string; sub: string; onLog: () => void; disabled?: boolean }) {
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
              stroke={filled ? '#f97316' : active ? 'rgba(249,115,22,0.35)' : '#1e1e2e'}
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
            <span className="text-xs text-brand-light font-bold">{sub}</span>
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
function RestTimer({ onDone, seconds: start = 30 }: { onDone: () => void; seconds?: number }) {
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
          <circle cx="75" cy="75" r={r} fill="none" stroke="#f97316" strokeWidth="9" strokeLinecap="round"
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

// ─── Tap scale (replaces sliders) ─────────────────────────────
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

// ─── Page ─────────────────────────────────────────────────────
export const WorkoutPage: React.FC = () => {
  const [workout, setWorkout] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>('overview');
  const [idx, setIdx] = useState(0);

  // per-exercise live tracking
  const [setsDone, setSetsDone] = useState<number[]>([]);
  const [repsAdj, setRepsAdj] = useState<number[]>([]);
  const [weightAdj, setWeightAdj] = useState<number[]>([]);
  const [loggedVolume, setLoggedVolume] = useState(0);

  // overview interactivity
  const [filter, setFilter] = useState('All');
  const [openId, setOpenId] = useState<number | null>(null);

  // session clock
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finalTime, setFinalTime] = useState(0);

  // feedback
  const [rpe, setRpe] = useState(7);
  const [energy, setEnergy] = useState(7);
  const [soreness, setSoreness] = useState(4);
  const [mood, setMood] = useState(7);
  const [pain, setPain] = useState(false);

  const exercises: ExerciseItem[] = workout?.exercises || [];
  const current = exercises[idx];
  const images = useMemo(() => assignImages(exercises), [workout]); // eslint-disable-line react-hooks/exhaustive-deps
  const imgFor = (it?: ExerciseItem) => (it ? images[exercises.indexOf(it)] : undefined);

  const fetchWorkout = () => {
    setLoading(true); setLoadError(null);
    getCached('/api/workouts/today')
      .then((res) => setWorkout(res.data))
      .catch(() => { setLoadError('Unable to load scheduled workout. Please try again.'); setWorkout(null); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchWorkout(); }, []);

  // reset trackers when exercises load
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
      setPhase('exercise');
    } catch {
      setActionError('Could not start workout. Check your connection and retry.');
    } finally { setSaving(false); }
  };

  const logSet = () => {
    if (!current || setsDone[idx] >= current.planned_sets) return;
    setSetsDone((a) => a.map((v, i) => (i === idx ? v + 1 : v)));
    setLoggedVolume((v) => v + repsAdj[idx] * (weightAdj[idx] || 1));
    setPhase('rest');
  };

  const goNext = useCallback(() => {
    if (idx < exercises.length - 1) { setIdx(idx + 1); setPhase('exercise'); }
    else { setFinalTime(elapsed); setPhase('feedback'); }
  }, [idx, exercises.length, elapsed]);

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
      setPhase('complete'); fetchWorkout();
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
        <button onClick={fetchWorkout} className="fortis-btn-primary py-2 px-5 text-xs">Try again</button>
      </div>
    );
  }

  // ── Complete ──
  if (phase === 'complete') {
    return (
      <div className="max-w-lg mx-auto space-y-5 animate-fade-in">
        <div className="bg-dark-card border border-success/30 rounded-2xl p-8 text-center space-y-5 shadow-glow-success">
          <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto"><Award className="w-8 h-8 text-success" /></div>
          <h2 className="text-2xl font-black text-white">Workout complete</h2>
          <p className="text-sm text-text-secondary max-w-sm mx-auto">Fortis has your feedback and updated your Personal Fitness State. Your next session adapts automatically.</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: 'Time', v: fmtTime(finalTime), c: 'text-white' },
              { l: 'Sets logged', v: `${doneSets}/${totalSets}`, c: 'text-brand-light' },
              { l: 'Volume', v: `${Math.round(loggedVolume)}`, c: 'text-white' },
              { l: 'Effort', v: `${rpe}/10`, c: 'text-success' },
            ].map(({ l, v, c }) => (
              <div key={l} className="bg-dark-surface rounded-xl p-3 border border-dark-border">
                <p className="text-[11px] text-text-muted">{l}</p>
                <p className={`text-2xl font-black tabular-nums ${c}`}>{v}</p>
              </div>
            ))}
          </div>
        </div>
        <Coach quote="Excellent work. Recovery starts now — eat well, sleep well. I'll plan your next session tonight." />
        <button onClick={() => setPhase('overview')} className="fortis-btn-secondary w-full text-sm">Back to overview</button>
      </div>
    );
  }

  // ── Feedback ──
  if (phase === 'feedback') {
    return (
      <div className="max-w-lg mx-auto space-y-5 animate-slide-up">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-black text-white">How did that feel?</h2>
          <p className="text-sm text-text-secondary">{doneSets} sets in {fmtTime(finalTime)}. Tap a level to tune your next session.</p>
        </div>
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

  // ── Rest ──
  if (phase === 'rest' && current) {
    const moreSets = setsDone[idx] < current.planned_sets;
    const next = moreSets ? current : exercises[idx + 1];
    return (
      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        <div className="bg-dark-card border border-brand/20 rounded-2xl p-6 shadow-glow">
          <p className="text-center text-sm font-bold text-brand-light mb-4">
            {moreSets ? `Set ${setsDone[idx]} of ${current.planned_sets} logged` : `${current.exercise.name} complete`}
          </p>
          <RestTimer onDone={handleRestDone} seconds={moreSets ? 30 : 45} />
        </div>
        {next ? (
          <div className="relative h-24 rounded-xl overflow-hidden border border-dark-border">
            <img src={imgFor(next)} alt="" className="w-full h-full object-cover opacity-50" />
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
        <Coach compact quote="Breathe slowly and hydrate. Controlled breathing speeds recovery between sets." />
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
        {/* Session bar: clickable exercise rail + clock */}
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

        {/* Hero */}
        <div className="relative h-44 rounded-2xl overflow-hidden border border-dark-border bg-dark-surface">
          <img key={ex.id} src={imgFor(current)} alt={ex.name} className="w-full h-full object-cover" />
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

        {/* Ring + steppers */}
        <div className="bg-dark-card border border-dark-border rounded-2xl p-5 space-y-5 shadow-card">
          <SetRing total={current.planned_sets} done={done} disabled={allDone}
            label={`Log set ${done + 1} of ${current.planned_sets}`}
            sub={`${reps} reps${weight ? ` · ${weight}kg` : ''}`} onLog={logSet} />
          <div className="grid grid-cols-2 gap-2.5">
            <Stepper label="Reps" value={reps} step={1} min={1} onChange={(v) => setRepsAdj((a) => a.map((x, i) => (i === idx ? v : x)))} />
            <Stepper label="Weight" value={weight} unit="kg" step={2.5} onChange={(v) => setWeightAdj((a) => a.map((x, i) => (i === idx ? v : x)))} />
          </div>
          {done > 0 && !allDone && (
            <button onClick={undoSet} className="mx-auto flex items-center gap-1.5 text-xs text-text-muted hover:text-white transition">
              <RotateCcw className="w-3 h-3" />Undo last set
            </button>
          )}
        </div>

        {/* Details */}
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

      {/* Session at a glance */}
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

      <Coach quote={`I've programmed ${exercises.length} exercises for today's ${workout?.workout_type || 'session'}, matched to your recovery and fitness state. Tap any exercise to preview it, or start from where you like.`} />

      {exercises.length === 0 ? (
        <div className="bg-dark-card border border-dark-border rounded-xl p-8 text-center space-y-2">
          <Dumbbell className="w-8 h-8 text-text-muted mx-auto opacity-50" />
          <h3 className="text-sm font-bold text-white">No exercises scheduled</h3>
          <p className="text-xs text-text-secondary max-w-sm mx-auto">Your recovery score indicates rest, or your training profile is still calibrating.</p>
        </div>
      ) : (
        <>
          {/* Muscle filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter by muscle group">
            {muscleFilters.map((m) => (
              <button key={m} role="tab" aria-selected={filter === m} onClick={() => setFilter(m)}
                className={`shrink-0 text-xs font-bold px-3.5 py-1.5 rounded-full border transition ${filter === m ? 'bg-brand text-white border-brand shadow-glow' : 'bg-dark-card text-text-secondary border-dark-border hover:border-brand/40'}`}>
                {m}
              </button>
            ))}
          </div>

          {/* Exercise route */}
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
                        <img src={imgFor(item)} alt="" loading="lazy"
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

                    {/* Expandable details */}
                    <div className={`grid transition-all duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                      <div className="overflow-hidden">
                        <div className="p-4 pt-0 space-y-3 border-t border-dark-border/60">
                          {item.adaptation_note && (
                            <p className="mt-3 text-xs text-brand-light font-medium bg-brand/10 px-2.5 py-1.5 rounded-lg border border-brand/20">{item.adaptation_note}</p>
                          )}
                          {ex?.instructions && <p className="pt-2 text-sm text-text-secondary leading-relaxed">{ex.instructions}</p>}
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
    </div>
  );
};

export default WorkoutPage;
