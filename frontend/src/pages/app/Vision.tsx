import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera, Upload, CheckCircle, AlertTriangle, Award, Sparkles, Info, Leaf, X,
  Utensils, Activity, Clipboard, Minus, Plus, Video, RotateCcw, Target,
} from 'lucide-react';
import api from '../../services/api';
import AIUsageIndicator from '../../components/AIUsageIndicator';

type Tab = 'food' | 'form';

const EXERCISES = [
  { id: 'squat', name: 'Squat', hint: 'Depth & knee tracking' },
  { id: 'pushup', name: 'Push-up', hint: 'Body line & elbow angle' },
  { id: 'curl', name: 'Bicep curl', hint: 'Elbow pinning & range' },
];
const MEALS = ['Breakfast', 'Lunch', 'Snack', 'Dinner'];
const pct = (v: number) => `${Math.round((v || 0) * 100)}%`;
const num = (v: any) => (typeof v === 'number' ? v : parseFloat(v) || 0);
const round1 = (v: number) => Math.round(v * 10) / 10;

// Animated count-up for scores
function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

// ─── Viewfinder: corner brackets + scan line while analysing ──
function Viewfinder({ children, scanning, active, className = '' }: {
  children: React.ReactNode; scanning?: boolean; active?: boolean; className?: string;
}) {
  const c = `absolute w-6 h-6 border-brand transition-all duration-300 ${active ? 'scale-110' : ''}`;
  return (
    <div className={`relative ${className}`}>
      <span className={`${c} top-0 left-0 border-t-2 border-l-2 rounded-tl-xl`} />
      <span className={`${c} top-0 right-0 border-t-2 border-r-2 rounded-tr-xl`} />
      <span className={`${c} bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl`} />
      <span className={`${c} bottom-0 right-0 border-b-2 border-r-2 rounded-br-xl`} />
      <div className="relative m-2 rounded-lg overflow-hidden">
        {children}
        {scanning && (
          <>
            <div className="absolute inset-0 bg-brand/5 pointer-events-none" />
            <div className="absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-brand/40 to-transparent pointer-events-none"
              style={{ animation: 'vscan 1.6s ease-in-out infinite' }} />
          </>
        )}
      </div>
      <style>{`@keyframes vscan{0%{top:-4rem}100%{top:100%}}@media (prefers-reduced-motion:reduce){[style*="vscan"]{animation:none!important}}`}</style>
    </div>
  );
}

// ─── Macro donut ──────────────────────────────────────────────
function MacroDonut({ p, c, f, kcal }: { p: number; c: number; f: number; kcal: number }) {
  const parts = [
    { k: 'Protein', g: p, cal: p * 4, color: '#f97316' },
    { k: 'Carbs', g: c, cal: c * 4, color: '#10b981' },
    { k: 'Fat', g: f, cal: f * 9, color: '#f59e0b' },
  ];
  const total = parts.reduce((a, x) => a + x.cal, 0) || 1;
  const r = 52, circ = 2 * Math.PI * r;
  const [hover, setHover] = useState<string | null>(null);
  let acc = 0;
  const shown = parts.find((x) => x.k === hover);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative w-36 h-36 shrink-0">
        <svg viewBox="0 0 130 130" className="w-full h-full -rotate-90">
          <circle cx="65" cy="65" r={r} fill="none" stroke="#1e1e2e" strokeWidth="14" />
          {parts.map((x) => {
            const len = (x.cal / total) * circ;
            const el = (
              <circle key={x.k} cx="65" cy="65" r={r} fill="none" stroke={x.color}
                strokeWidth={hover === x.k ? 18 : 14}
                strokeDasharray={`${Math.max(0, len - 3)} ${circ}`} strokeDashoffset={-acc}
                style={{ transition: 'all 0.5s ease', opacity: hover && hover !== x.k ? 0.35 : 1 }}
                onMouseEnter={() => setHover(x.k)} onMouseLeave={() => setHover(null)} />
            );
            acc += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-black text-white tabular-nums">{shown ? `${Math.round((shown.cal / total) * 100)}%` : Math.round(kcal)}</span>
          <span className="text-[11px] text-text-muted">{shown ? shown.k : 'kcal'}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-1 gap-2 flex-1 w-full">
        {parts.map((x) => (
          <button key={x.k} onMouseEnter={() => setHover(x.k)} onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(x.k)} onBlur={() => setHover(null)}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-dark-card border border-dark-border hover:border-brand/40 transition text-left">
            <span className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: x.color }} />{x.k}
            </span>
            <span className="text-sm font-black text-white tabular-nums">{round1(x.g)}g</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Score ring ───────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const shown = useCountUp(score);
  const r = 58, circ = 2 * Math.PI * r;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative w-40 h-40 mx-auto">
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#1e1e2e" strokeWidth="10" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ - (shown / 100) * circ} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-black text-white tabular-nums">{shown}</span>
        <span className="text-[11px] text-text-muted">form score</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────
export const VisionPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('food');
  const [analyzing, setAnalyzing] = useState(false);

  // food
  const [foodResult, setFoodResult] = useState<any>(null);
  const [foodError, setFoodError] = useState<string | null>(null);
  const [foodPreview, setFoodPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [portion, setPortion] = useState(1);
  const [meal, setMeal] = useState('Lunch');
  const [logged, setLogged] = useState(false);

  // form
  const [exercise, setExercise] = useState('squat');
  const [formResult, setFormResult] = useState<any>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoDrag, setVideoDrag] = useState(false);
  const [openMetric, setOpenMetric] = useState<string | null>(null);
  const [lastVideo, setLastVideo] = useState<File | null>(null);

  const foodInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  // revoke blob URLs on change/unmount
  useEffect(() => () => { if (foodPreview) URL.revokeObjectURL(foodPreview); }, [foodPreview]);
  useEffect(() => () => { if (videoPreview) URL.revokeObjectURL(videoPreview); }, [videoPreview]);

  const analyseFood = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { setFoodError('That file is not an image. Upload a JPG, PNG or WebP photo.'); return; }
    setAnalyzing(true); setFoodError(null); setFoodResult(null); setLogged(false); setPortion(1);
    setFoodPreview(URL.createObjectURL(file));
    const fd = new FormData(); fd.append('file', file);
    try {
      const res = await api.post('/api/vision/food', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFoodResult(res.data);
    } catch (err: any) {
      setFoodError(err?.response?.data?.detail || 'Could not classify this photo. Try a clearer, well-lit image.');
    } finally { setAnalyzing(false); }
  }, []);

  const analyseVideo = useCallback(async (file: File, ex = exercise) => {
    if (!file.type.startsWith('video/')) { setFormError('That file is not a video. Upload an MP4, MOV or WebM clip.'); return; }
    setAnalyzing(true); setFormError(null); setFormResult(null); setOpenMetric(null);
    setVideoPreview(URL.createObjectURL(file)); setLastVideo(file);
    const fd = new FormData(); fd.append('file', file); fd.append('exercise_name', ex);
    try {
      const res = await api.post('/api/vision/exercise', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFormResult(res.data);
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || 'Could not analyse this video. Check that it is a valid clip showing the full movement.');
    } finally { setAnalyzing(false); }
  }, [exercise]);

  // Paste an image straight into the Food tab
  useEffect(() => {
    if (tab !== 'food') return;
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files || []).find((x) => x.type.startsWith('image/'));
      if (f) analyseFood(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [tab, analyseFood]);

  const clearFood = () => {
    setFoodResult(null); setFoodError(null); setFoodPreview(null); setLogged(false); setPortion(1);
    if (foodInput.current) foodInput.current.value = '';
  };
  const clearVideo = () => {
    setFormResult(null); setFormError(null); setVideoPreview(null); setLastVideo(null);
    if (videoInput.current) videoInput.current.value = '';
  };

  const n = foodResult?.nutrition_estimate;
  const top = foodResult?.top_prediction;
  const scaled = (v: any) => round1(num(v) * portion);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-white">Fortis Vision</h1>
          <p className="text-sm text-text-secondary mt-1">Point, snap or drop. Identify a meal and its nutrition, or check your lifting form.</p>
        </div>
        <div className="pt-1">
          <AIUsageIndicator feature="fortis_vision" />
        </div>
      </div>

      {/* Sliding segmented switch */}
      <div role="tablist" className="relative grid grid-cols-2 p-1 rounded-2xl bg-dark-card border border-dark-border max-w-md">
        <span className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-brand shadow-glow transition-transform duration-300"
          style={{ transform: tab === 'food' ? 'translateX(0)' : 'translateX(100%)' }} />
        {([['food', 'Food Vision', Utensils], ['form', 'Form Check', Activity]] as const).map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`relative z-10 flex items-center justify-center gap-2 py-2.5 text-sm font-bold transition-colors ${tab === id ? 'text-white' : 'text-text-secondary hover:text-white'}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ───────────────────── FOOD ───────────────────── */}
      {tab === 'food' && (
        <div className="space-y-5 animate-fade-in">
          <input ref={foodInput} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) analyseFood(f); }} />

          {!foodPreview ? (
            <Viewfinder active={dragOver}>
              <div
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) analyseFood(f); }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => foodInput.current?.click()}
                role="button" tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && foodInput.current?.click()}
                className={`cursor-pointer text-center px-4 sm:px-6 py-8 sm:py-14 space-y-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${dragOver ? 'bg-brand/10' : 'bg-dark-card hover:bg-dark-hover'}`}
              >
                <div className={`w-16 h-16 mx-auto rounded-full bg-dark-surface border flex items-center justify-center text-brand-light transition-all ${dragOver ? 'border-brand scale-110' : 'border-dark-border'}`}>
                  {dragOver ? <Sparkles className="w-8 h-8" /> : <Camera className="w-8 h-8" />}
                </div>
                <h3 className="text-lg font-black text-white">{dragOver ? 'Release to scan' : 'Snap or drop your meal'}</h3>
                <p className="text-xs text-text-muted max-w-sm mx-auto">Works with Indian, Kerala and global food: rice, curries, snacks, drinks.</p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button onClick={(e) => { e.stopPropagation(); foodInput.current?.click(); }} className="fortis-btn-primary text-xs py-2 px-5 inline-flex items-center gap-2">
                    <Upload className="w-4 h-4" />Choose photo
                  </button>
                  <span className="text-[11px] text-text-muted inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dark-border">
                    <Clipboard className="w-3.5 h-3.5" />or paste with Ctrl/⌘ + V
                  </span>
                </div>
                <p className="text-[11px] text-text-muted">JPEG, PNG or WebP, up to 10 MB</p>
              </div>
            </Viewfinder>
          ) : (
            <div className="space-y-3">
              <Viewfinder scanning={analyzing}>
                <img src={foodPreview} alt="Your meal" className="w-full max-h-80 object-cover bg-dark-surface" />
                {analyzing && (
                  <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-bg/80 border border-brand/30 text-xs text-text-secondary">
                    <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                    Identifying food and estimating nutrition…
                  </div>
                )}
              </Viewfinder>
              <div className="flex justify-end">
                <button onClick={clearFood} className="text-xs text-text-muted hover:text-white flex items-center gap-1 transition-colors">
                  <X className="w-3.5 h-3.5" />Scan a different photo
                </button>
              </div>
            </div>
          )}

          {foodError && (
            <div role="alert" className="p-4 bg-danger/10 border border-danger/30 rounded-xl text-danger text-xs flex items-center justify-between gap-3">
              <span className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{foodError}</span>
              <button onClick={() => foodInput.current?.click()} className="fortis-btn-secondary py-1.5 px-3 text-xs shrink-0">Try again</button>
            </div>
          )}

          {foodResult && !analyzing && (
            <div className="bg-dark-card border border-brand/20 rounded-2xl p-5 space-y-5 shadow-glow animate-slide-up">
              {/* Identification */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {top?.is_healthy === true && <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full"><Leaf className="w-3 h-3" />Healthy</span>}
                    {top?.is_healthy === false && <span className="text-[11px] font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">Indulgent</span>}
                    {top?.region && <span className="text-[11px] text-text-muted">{top.region} cuisine</span>}
                  </div>
                  <h2 className="text-2xl font-black text-white leading-tight">{top?.name}</h2>
                  {top?.note && <p className="text-xs text-text-secondary italic">{top.note}</p>}
                  <div className="flex items-center gap-2 pt-1">
                    <div className="w-32 h-1.5 rounded-full bg-dark-border overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full transition-all duration-700" style={{ width: pct(top?.confidence) }} />
                    </div>
                    <span className="text-xs text-emerald-400 font-semibold">{pct(top?.confidence)} sure</span>
                  </div>
                </div>

                {foodResult.alternatives?.length > 0 && (
                  <div className="sm:max-w-[45%]">
                    <p className="text-[11px] text-text-muted mb-1.5">Also possible</p>
                    <div className="flex flex-wrap gap-1.5">
                      {foodResult.alternatives.map((a: any, i: number) => (
                        <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-dark-surface border border-dark-border text-text-secondary">
                          {a.name} <span className="text-text-muted">{pct(a.confidence)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {n && (
                <>
                  {/* Portion control */}
                  <div className="p-4 rounded-xl bg-dark-surface border border-dark-border space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">Portion size</p>
                        <p className="text-[11px] text-text-muted">
                          {n.serving_description || (n.serving_g ? `~${n.serving_g}g serving` : 'Standard serving')}
                          {n.serving_g ? ` · now about ${Math.round(n.serving_g * portion)}g` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setPortion((p) => Math.max(0.25, round1(p - 0.25)))} aria-label="Smaller portion"
                          className="w-8 h-8 rounded-lg bg-dark-card border border-dark-border hover:border-brand/50 active:scale-90 transition flex items-center justify-center"><Minus className="w-4 h-4 text-text-secondary" /></button>
                        <span className="w-12 text-center text-lg font-black text-white tabular-nums">{portion}×</span>
                        <button onClick={() => setPortion((p) => Math.min(4, round1(p + 0.25)))} aria-label="Larger portion"
                          className="w-8 h-8 rounded-lg bg-dark-card border border-dark-border hover:border-brand/50 active:scale-90 transition flex items-center justify-center"><Plus className="w-4 h-4 text-text-secondary" /></button>
                      </div>
                    </div>
                    <input type="range" min={0.25} max={4} step={0.25} value={portion} onChange={(e) => setPortion(Number(e.target.value))}
                      aria-label="Portion multiplier" className="w-full h-2 rounded-full appearance-none cursor-pointer"
                      style={{ background: `linear-gradient(to right,#f97316 ${((portion - 0.25) / 3.75) * 100}%,#1e1e2e ${((portion - 0.25) / 3.75) * 100}%)` }} />
                    <div className="flex gap-1.5">
                      {[0.5, 1, 1.5, 2].map((m) => (
                        <button key={m} onClick={() => setPortion(m)}
                          className={`flex-1 text-xs font-bold py-1.5 rounded-lg border transition ${portion === m ? 'bg-brand/20 border-brand/50 text-brand-light' : 'border-dark-border text-text-muted hover:text-white'}`}>{m}×</button>
                      ))}
                    </div>
                  </div>

                  <MacroDonut p={scaled(n.protein_g)} c={scaled(n.carbs_g)} f={scaled(n.fat_g)} kcal={num(n.calories) * portion} />

                  {(num(n.fiber_g) > 0 || num(n.sugar_g) > 0) && (
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      {num(n.fiber_g) > 0 && <div className="p-2.5 bg-dark-surface rounded-lg border border-dark-border flex justify-between"><span className="text-text-muted">Fibre</span><span className="font-bold text-white">{scaled(n.fiber_g)}g</span></div>}
                      {num(n.sugar_g) > 0 && <div className="p-2.5 bg-dark-surface rounded-lg border border-dark-border flex justify-between"><span className="text-text-muted">Sugar</span><span className="font-bold text-white">{scaled(n.sugar_g)}g</span></div>}
                    </div>
                  )}

                  <p className="flex items-start gap-1.5 text-[11px] text-text-muted">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span>Source: <strong className="text-text-secondary">{n.source}</strong>. {foodResult.disclaimer}</span>
                  </p>
                </>
              )}

              {/* Log */}
              <div className="pt-4 border-t border-dark-border space-y-3">
                {foodResult.confirm_prompt && <p className="text-xs text-text-muted">{foodResult.confirm_prompt}</p>}
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                  <div className="flex gap-1.5" role="radiogroup" aria-label="Meal type">
                    {MEALS.map((m) => (
                      <button key={m} role="radio" aria-checked={meal === m} onClick={() => { setMeal(m); setLogged(false); }}
                        className={`text-xs font-bold px-3 py-1.5 rounded-full border transition ${meal === m ? 'bg-brand text-white border-brand' : 'border-dark-border text-text-secondary hover:border-brand/40'}`}>{m}</button>
                    ))}
                  </div>
                  <button
                    disabled={logged}
                    onClick={() => setLogged(true) /* TODO: POST to your nutrition logging endpoint with { meal, portion, name, nutrition scaled } */}
                    className={`text-xs py-2.5 px-5 rounded-xl font-bold flex items-center justify-center gap-1.5 transition ${logged ? 'bg-success/15 text-success border border-success/30' : 'fortis-btn-primary'}`}>
                    <CheckCircle className="w-4 h-4" />{logged ? `Logged to ${meal}` : `Log ${Math.round(num(n?.calories) * portion)} kcal`}
                  </button>
                </div>
                {logged && <p className="text-[11px] text-text-muted">Saved on this screen only for now. The logging endpoint isn't connected yet.</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────── FORM ───────────────────── */}
      {tab === 'form' && (
        <div className="space-y-5 animate-fade-in">
          <input ref={videoInput} type="file" accept="video/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) analyseVideo(f); }} />

          {/* Exercise picker */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Exercise">
            {EXERCISES.map((x) => (
              <button key={x.id} role="radio" aria-checked={exercise === x.id}
                onClick={() => { setExercise(x.id); if (lastVideo) analyseVideo(lastVideo, x.id); }}
                className={`text-left p-4 rounded-2xl border transition-all hover:-translate-y-0.5 ${exercise === x.id ? 'bg-brand/10 border-brand shadow-glow' : 'bg-dark-card border-dark-border hover:border-brand/40'}`}>
                <p className="font-black text-white">{x.name}</p>
                <p className="text-xs text-text-muted mt-0.5">{x.hint}</p>
              </button>
            ))}
          </div>

          {!videoPreview ? (
            <Viewfinder active={videoDrag}>
              <div
                onDrop={(e) => { e.preventDefault(); setVideoDrag(false); const f = e.dataTransfer.files?.[0]; if (f) analyseVideo(f); }}
                onDragOver={(e) => { e.preventDefault(); setVideoDrag(true); }}
                onDragLeave={() => setVideoDrag(false)}
                onClick={() => videoInput.current?.click()}
                role="button" tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && videoInput.current?.click()}
                className={`cursor-pointer text-center px-4 sm:px-6 py-8 sm:py-12 space-y-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${videoDrag ? 'bg-brand/10' : 'bg-dark-card hover:bg-dark-hover'}`}>
                <div className="w-14 h-14 mx-auto rounded-full bg-dark-surface border border-dark-border flex items-center justify-center text-brand-light"><Video className="w-7 h-7" /></div>
                <h3 className="text-lg font-black text-white">{videoDrag ? 'Release to analyse' : 'Drop a clip of your set'}</h3>
                <p className="text-xs text-text-muted max-w-sm mx-auto">Film from the side with your whole body in frame. A few reps is enough.</p>
                <button onClick={(e) => { e.stopPropagation(); videoInput.current?.click(); }} className="fortis-btn-primary text-xs py-2 px-5 inline-flex items-center gap-2">
                  <Upload className="w-4 h-4" />Choose video
                </button>
              </div>
            </Viewfinder>
          ) : (
            <div className="space-y-3">
              <Viewfinder scanning={analyzing}>
                <video src={videoPreview} controls playsInline className="w-full max-h-80 bg-dark-surface" />
              </Viewfinder>
              <div className="flex items-center justify-between">
                {analyzing
                  ? <span className="flex items-center gap-2 text-xs text-text-secondary"><div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />Analysing your {EXERCISES.find((x) => x.id === exercise)?.name.toLowerCase()}…</span>
                  : <span />}
                <button onClick={clearVideo} className="text-xs text-text-muted hover:text-white flex items-center gap-1 transition-colors"><X className="w-3.5 h-3.5" />Use a different video</button>
              </div>
            </div>
          )}

          {formError && (
            <div role="alert" className="p-4 bg-danger/10 border border-danger/30 rounded-xl text-danger text-xs flex items-center justify-between gap-3">
              <span className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{formError}</span>
              {lastVideo && <button onClick={() => analyseVideo(lastVideo)} className="fortis-btn-secondary py-1.5 px-3 text-xs shrink-0 flex items-center gap-1"><RotateCcw className="w-3 h-3" />Retry</button>}
            </div>
          )}

          {formResult && !analyzing && (
            <div className="bg-dark-card border border-brand/20 rounded-2xl p-5 space-y-5 shadow-glow animate-slide-up">
              <div className="grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-6 items-center">
                <div>
                  <ScoreRing score={num(formResult.form_score)} />
                  {formResult.confidence != null && <p className="text-center text-[11px] text-text-muted mt-2">{pct(formResult.confidence)} assessment confidence</p>}
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-white capitalize flex items-center gap-2"><Award className="w-6 h-6 text-success" />{formResult.exercise} biomechanics</h2>
                  {formResult.primary_improvement && (
                    <div className="p-3.5 rounded-xl bg-brand/10 border border-brand/25">
                      <p className="text-xs font-bold text-brand-light flex items-center gap-1.5 mb-1"><Target className="w-3.5 h-3.5" />Fix this first</p>
                      <p className="text-sm text-text-secondary leading-relaxed">{formResult.primary_improvement}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Breakdown: tap a metric to focus */}
              {formResult.breakdown && Object.keys(formResult.breakdown).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-text-secondary">Breakdown</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {Object.entries(formResult.breakdown).map(([k, v]: [string, any]) => {
                      const val = num(v);
                      const isScore = typeof v === 'number' && val <= 100;
                      const color = val >= 80 ? '#10b981' : val >= 60 ? '#f59e0b' : '#ef4444';
                      return (
                        <button key={k} onClick={() => setOpenMetric(openMetric === k ? null : k)} aria-pressed={openMetric === k}
                          className={`text-left p-3 rounded-xl border transition ${openMetric === k ? 'border-brand/50 bg-brand/5' : 'bg-dark-surface border-dark-border hover:border-brand/30'}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-text-secondary capitalize">{k.replace(/_/g, ' ')}</span>
                            <span className="text-lg font-black text-white tabular-nums">{String(v)}</span>
                          </div>
                          {isScore && <div className="h-1.5 mt-2 rounded-full bg-dark-border overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${val}%`, background: color }} /></div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {formResult.feedback?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-text-secondary">Coaching notes</p>
                  <ul className="space-y-2">
                    {formResult.feedback.map((f: string, i: number) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-text-secondary p-3 rounded-xl bg-dark-surface border border-dark-border">
                        <CheckCircle className="w-4 h-4 text-brand mt-0.5 shrink-0" /><span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button onClick={() => videoInput.current?.click()} className="fortis-btn-secondary w-full text-sm py-2.5 flex items-center justify-center gap-2">
                <Video className="w-4 h-4" />Record another set and compare
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VisionPage;
