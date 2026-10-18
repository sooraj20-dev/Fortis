import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Utensils, Wallet, Sparkles, ListPlus, AlertCircle, Check, Copy, Loader2, Flame, Beef,
  MapPin, ShoppingBasket, RotateCcw,
} from 'lucide-react';
import api, { getCached } from '../../services/api';
import SplashScreen from '../../components/SplashScreen';

const REGIONS = [
  { id: 'Kerala', label: 'Kerala', sub: 'Puttu, fish, matta rice' },
  { id: 'South India', label: 'South Indian', sub: 'Tamil Nadu staples' },
  { id: 'General', label: 'Pan-Indian', sub: 'Dal, roti, paneer' },
];
const BUDGET_PRESETS = [80, 120, 150, 200, 300];
const MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'snacks', 'dinner'];

const num = (v: any) => (typeof v === 'number' ? v : parseFloat(v) || 0);
const rupee = (v: any) => `₹${Math.round(num(v) * 100) / 100}`;
const pct = (a: any, b: any) => (num(b) > 0 ? Math.min(100, (num(a) / num(b)) * 100) : 0);
const sortMeals = (keys: string[]) =>
  [...keys].sort((a, b) => {
    const ia = MEAL_ORDER.indexOf(a.toLowerCase()), ib = MEAL_ORDER.indexOf(b.toLowerCase());
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

// ─── Progress ring ────────────────────────────────────────────
function Ring({ value, target, label, unit, color, icon }: {
  value: any; target: any; label: string; unit: string; color: string; icon: React.ReactNode;
}) {
  const r = 34, circ = 2 * Math.PI * r;
  const p = pct(value, target);
  const has = value != null && target != null;
  return (
    <div className="bg-dark-card border border-dark-border rounded-2xl p-4 shadow-card flex items-center gap-4">
      <div className="relative w-20 h-20 shrink-0">
        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="#1e1e2e" strokeWidth="8" />
          <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ - (p / 100) * circ} style={{ transition: 'stroke-dashoffset .8s ease' }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center" style={{ color }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-text-muted font-medium">{label}</p>
        <p className="text-2xl font-black text-white tabular-nums leading-tight">
          {has ? Math.round(num(value)) : '—'}<span className="text-xs text-text-muted font-normal"> {unit}</span>
        </p>
        <p className="text-[11px] text-text-secondary">{has ? `${Math.round(p)}% of ${Math.round(num(target))} ${unit}` : 'No target set'}</p>
      </div>
    </div>
  );
}

// ─── Thin comparison bar ──────────────────────────────────────
function Meter({ label, value, target, unit, color, over }: { label: string; value: any; target: any; unit: string; color: string; over?: boolean }) {
  const isOver = over && num(value) > num(target);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className={`font-bold tabular-nums ${isOver ? 'text-amber-400' : 'text-white'}`}>
          {unit === '₹' ? rupee(value) : Math.round(num(value))}{unit !== '₹' && ` ${unit}`}
          <span className="text-text-muted font-normal"> / {unit === '₹' ? rupee(target) : `${Math.round(num(target))} ${unit}`}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-dark-border overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct(value, target)}%`, background: isOver ? '#f59e0b' : color }} />
      </div>
    </div>
  );
}

export const NutritionPage: React.FC = () => {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [budget, setBudget] = useState(150);
  const [region, setRegion] = useState('Kerala');
  const [mealPlan, setMealPlan] = useState<any>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optError, setOptError] = useState<string | null>(null);
  const [activeMeal, setActiveMeal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [groceryList, setGroceryList] = useState<any>(null);
  const [groceryLoading, setGroceryLoading] = useState(false);
  const [groceryError, setGroceryError] = useState<string | null>(null);
  const [got, setGot] = useState<Set<number>>(new Set());

  const loadSummary = useCallback(() => {
    setLoading(true); setLoadError(false);
    getCached<any>('/api/nutrition/today')
      .then((res) => {
        setSummary(res.data);
        if (res.data?.budget_inr != null) setBudget(res.data.budget_inr);
        if (res.data?.regional_preference) setRegion(res.data.regional_preference);
      })
      .catch((err) => { console.error('Failed to load nutrition summary:', err); setLoadError(true); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  if (loading && !summary && !loadError) {
    return <SplashScreen isLoader message="Loading your nutrition summary…" />;
  }

  const handleOptimize = () => {
    setOptimizing(true); setOptError(null); setGroceryList(null);
    api.post('/api/diet/generate', {
      daily_budget_inr: budget,
      goal: summary?.goal,
      regional_preference: region,
      diet_type: summary?.diet_type,
      allergies: summary?.allergies || [],
    })
      .then((res) => {
        setMealPlan(res.data);
        setActiveMeal(sortMeals(Object.keys(res.data?.meals || {}))[0] ?? null);
      })
      .catch((err) => {
        console.error('Failed to generate diet plan:', err);
        setOptError('Could not generate a plan. Try a different budget or region.');
      })
      .finally(() => setOptimizing(false));
  };

  const handleGrocery = () => {
    setGroceryLoading(true); setGroceryError(null);
    api.post('/api/grocery-list/generate')
      .then((res) => { setGroceryList(res.data); setGot(new Set()); })
      .catch((err) => { console.error('Failed to generate grocery list:', err); setGroceryError('Could not build the grocery list. Please try again.'); })
      .finally(() => setGroceryLoading(false));
  };

  const mealKeys = useMemo(() => sortMeals(Object.keys(mealPlan?.meals || {})), [mealPlan]);
  const mealTotals = useMemo(() => {
    const out: Record<string, { cost: number; kcal: number; protein: number }> = {};
    mealKeys.forEach((k) => {
      const items: any[] = mealPlan.meals[k] || [];
      out[k] = {
        cost: items.reduce((a, i) => a + num(i.estimated_cost_inr), 0),
        kcal: items.reduce((a, i) => a + num(i.calories), 0),
        protein: items.reduce((a, i) => a + num(i.protein_g), 0),
      };
    });
    return out;
  }, [mealPlan, mealKeys]);

  const copyPlan = async () => {
    const lines = mealKeys.map((k) => `${k.toUpperCase()}\n${(mealPlan.meals[k] || []).map((i: any) => `  - ${i.name} ${i.quantity_g}g (${rupee(i.estimated_cost_inr)})`).join('\n')}`);
    try {
      await navigator.clipboard.writeText(`Fortis meal plan (${rupee(mealPlan.total_cost_inr)})\n\n${lines.join('\n\n')}`);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  // Today's logs grouped by meal
  const logGroups = useMemo(() => {
    const g: Record<string, any[]> = {};
    (summary?.logs || []).forEach((l: any) => { (g[l.meal_type || 'Other'] ||= []).push(l); });
    return sortMeals(Object.keys(g)).map((k) => ({ meal: k, items: g[k] }));
  }, [summary]);

  const remainingCost = groceryList?.items?.reduce((a: number, it: any, i: number) => (got.has(i) ? a : a + num(it.estimated_cost_inr)), 0) ?? 0;
  const regionLabel = REGIONS.find((r) => r.id === region)?.label || region;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div>
        <p className="text-xs font-bold text-brand-light mb-1">Nutrition</p>
        <h1 className="text-3xl sm:text-4xl font-black text-white">Eat well within budget</h1>
        <p className="text-sm text-text-secondary mt-1 max-w-xl">
          Meal plans built from authentic Kerala and Indian foods that hit your targets without overspending.
        </p>
      </div>

      {loadError && (
        <div role="alert" className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-300 flex items-center justify-between gap-3">
          <span>Nutrition data could not be loaded.</span>
          <button className="underline font-semibold" onClick={loadSummary}>Retry</button>
        </div>
      )}

      {/* ── Today ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-live="polite" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-dark-card border border-dark-border animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Ring label="Calories today" value={summary?.total_calories} target={summary?.target_calories} unit="kcal" color="#f97316" icon={<Flame className="w-6 h-6" />} />
          <Ring label="Protein today" value={summary?.total_protein_g} target={summary?.target_protein_g} unit="g" color="#fb923c" icon={<Beef className="w-6 h-6" />} />
          <div className="bg-dark-card border border-dark-border rounded-2xl p-4 shadow-card flex items-center gap-4">
            <div className="w-20 h-20 shrink-0 rounded-full bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center"><Wallet className="w-7 h-7 text-emerald-400" /></div>
            <div>
              <p className="text-xs text-text-muted font-medium">Daily budget</p>
              <p className="text-2xl font-black text-emerald-400 tabular-nums leading-tight">{summary?.budget_inr != null ? rupee(summary.budget_inr) : '—'}</p>
              <p className="text-[11px] text-text-secondary">per day</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Optimizer ── */}
      <section className="bg-dark-card border border-dark-border rounded-3xl p-5 sm:p-7 shadow-card space-y-6">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center"><Wallet className="w-4 h-4 text-emerald-400" /></span>
          <div>
            <h2 className="text-lg font-black text-white leading-tight">Smart budget planner</h2>
            <p className="text-xs text-text-muted">Set what you can spend. We build the day around it.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Budget */}
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <label htmlFor="budget" className="text-xs font-bold text-text-secondary">Daily budget</label>
              <div className="flex items-center gap-1">
                <span className="text-2xl font-black text-emerald-400">₹</span>
                <input id="budget" type="number" min={0} value={budget} onChange={(e) => setBudget(Math.max(0, Number(e.target.value)))}
                  className="w-24 bg-transparent text-3xl font-black text-white tabular-nums text-right border-b-2 border-dark-border focus:border-brand focus:outline-none" />
              </div>
            </div>
            <input type="range" min={50} max={500} step={10} value={Math.min(500, Math.max(50, budget))} onChange={(e) => setBudget(Number(e.target.value))}
              aria-label="Daily budget slider" className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{ background: `linear-gradient(to right,#10b981 ${((Math.min(500, Math.max(50, budget)) - 50) / 450) * 100}%,#1e1e2e 0)` }} />
            <div className="flex flex-wrap gap-1.5">
              {BUDGET_PRESETS.map((b) => (
                <button key={b} onClick={() => setBudget(b)} aria-pressed={budget === b}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border transition active:scale-95 ${budget === b ? 'bg-emerald-400/15 border-emerald-400/50 text-emerald-300' : 'border-dark-border text-text-secondary hover:border-emerald-400/30'}`}>₹{b}</button>
              ))}
            </div>
          </div>

          {/* Region */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-text-secondary flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />Regional profile</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2" role="radiogroup" aria-label="Regional profile">
              {REGIONS.map((r) => (
                <button key={r.id} role="radio" aria-checked={region === r.id} onClick={() => setRegion(r.id)}
                  className={`text-left px-3.5 py-2.5 rounded-xl border transition ${region === r.id ? 'bg-brand/10 border-brand shadow-glow' : 'bg-dark-surface border-dark-border hover:border-brand/30'}`}>
                  <span className="block text-sm font-bold text-white">{r.label}</span>
                  <span className="block text-[11px] text-text-muted">{r.sub}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={handleOptimize} disabled={optimizing || budget <= 0}
          className="fortis-btn-primary w-full py-3.5 font-black text-sm flex items-center justify-center gap-2 shadow-glow disabled:opacity-60">
          {optimizing ? <><Loader2 className="w-4 h-4 animate-spin" />Calculating your plan…</> : <><Sparkles className="w-4 h-4" />{mealPlan ? 'Re-optimize plan' : 'Optimize my meal plan'}</>}
        </button>

        {optError && (
          <div role="alert" className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" /><span>{optError}</span>
          </div>
        )}

        {/* ── Plan ── */}
        {mealPlan && (
          <div className="bg-dark-surface border border-emerald-500/30 rounded-2xl p-5 space-y-5 animate-slide-up">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-white text-lg">Your cost-optimal day</h3>
                <p className="text-xs text-text-muted">{regionLabel} foods, planned for {rupee(mealPlan.target_budget_inr ?? budget)}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={copyPlan} className="fortis-btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
                  {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'Copied' : 'Copy plan'}
                </button>
                <button onClick={handleGrocery} disabled={groceryLoading} className="fortis-btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-60">
                  {groceryLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListPlus className="w-3.5 h-3.5" />}Weekly grocery list
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Meter label="Cost" value={mealPlan.total_cost_inr} target={mealPlan.target_budget_inr ?? budget} unit="₹" color="#10b981" over />
              <Meter label="Calories" value={mealPlan.total_calories} target={mealPlan.target_calories} unit="kcal" color="#f97316" />
              <Meter label="Protein" value={mealPlan.total_protein_g} target={mealPlan.target_protein_g} unit="g" color="#fb923c" />
            </div>

            {mealPlan.explanation && (
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" /><span>{mealPlan.explanation}</span>
              </div>
            )}

            {/* Meal tabs */}
            {mealKeys.length > 0 && (
              <div className="space-y-3">
                <div role="tablist" className="flex gap-1.5 overflow-x-auto">
                  {mealKeys.map((k) => (
                    <button key={k} role="tab" aria-selected={activeMeal === k} onClick={() => setActiveMeal(k)}
                      className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold capitalize border transition ${activeMeal === k ? 'bg-brand text-white border-brand shadow-glow' : 'bg-dark-card border-dark-border text-text-secondary hover:border-brand/40'}`}>
                      {k} <span className="opacity-70 font-medium">· {rupee(mealTotals[k]?.cost)}</span>
                    </button>
                  ))}
                </div>

                {activeMeal && mealPlan.meals[activeMeal] && (
                  <div key={activeMeal} className="space-y-2 animate-fade-in">
                    {(mealPlan.meals[activeMeal] as any[]).map((it, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 p-3.5 bg-dark-card border border-dark-border rounded-xl">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{it.name}</p>
                          <p className="text-[11px] text-text-muted">{it.quantity_g}g · {it.calories} kcal · {it.protein_g}g protein</p>
                        </div>
                        <span className="text-sm font-black text-emerald-400 tabular-nums shrink-0">{rupee(it.estimated_cost_inr)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between px-3.5 py-2 text-xs text-text-secondary">
                      <span className="capitalize">{activeMeal} total</span>
                      <span className="tabular-nums">{Math.round(mealTotals[activeMeal]?.kcal)} kcal · {Math.round(mealTotals[activeMeal]?.protein)}g protein · <span className="text-emerald-400 font-bold">{rupee(mealTotals[activeMeal]?.cost)}</span></span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {groceryError && <div role="alert" className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-400">{groceryError}</div>}

        {/* ── Grocery list ── */}
        {groceryList && (
          <div className="bg-dark-card border border-brand/30 rounded-2xl p-5 space-y-4 animate-slide-up">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-black text-white flex items-center gap-2"><ShoppingBasket className="w-4 h-4 text-brand" />Weekly groceries</h3>
              <div className="text-right text-xs text-text-muted">
                <span className="text-emerald-400 font-black text-base tabular-nums">{rupee(remainingCost)}</span> left to buy
                <span className="block">of {rupee(groceryList.total_estimated_cost)} estimated</span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-dark-border overflow-hidden">
              <div className="h-full bg-brand rounded-full transition-all duration-500" style={{ width: `${groceryList.items?.length ? (got.size / groceryList.items.length) * 100 : 0}%` }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {groceryList.items?.map((item: any, i: number) => {
                const on = got.has(i);
                return (
                  <button key={i} role="checkbox" aria-checked={on}
                    onClick={() => setGot((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition active:scale-[0.98] ${on ? 'bg-success/10 border-success/30' : 'bg-dark-surface border-dark-border hover:border-brand/30'}`}>
                    <span className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center ${on ? 'bg-success border-success' : 'border-dark-border'}`}>{on && <Check className="w-3.5 h-3.5 text-white" />}</span>
                    <span className={`flex-1 min-w-0 text-xs font-medium truncate ${on ? 'text-text-muted line-through' : 'text-white'}`}>{item.name} ({item.quantity} {item.unit})</span>
                    <span className="text-xs text-emerald-400 font-bold tabular-nums">{rupee(item.estimated_cost_inr)}</span>
                  </button>
                );
              })}
            </div>
            {got.size > 0 && <button onClick={() => setGot(new Set())} className="text-xs text-text-muted hover:text-white flex items-center gap-1"><RotateCcw className="w-3 h-3" />Clear ticks</button>}
          </div>
        )}
      </section>

      {/* ── Today's logs ── */}
      <section className="bg-dark-card border border-dark-border rounded-3xl p-5 sm:p-7 shadow-card">
        <h2 className="text-lg font-black text-white mb-4">Today's meals</h2>
        {logGroups.length > 0 ? (
          <div className="space-y-5">
            {logGroups.map(({ meal, items }) => {
              const kcal = items.reduce((a, l) => a + num(l.calories), 0);
              return (
                <div key={meal} className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-black text-brand-light capitalize">{meal}</span>
                    <span className="text-text-muted tabular-nums">{Math.round(kcal)} kcal</span>
                  </div>
                  {items.map((log: any) => (
                    <div key={log.id} className="flex items-center justify-between gap-3 p-3 bg-dark-surface border border-dark-border rounded-xl">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{log.food_name}</p>
                        <p className="text-[11px] text-text-muted">{log.quantity_g}g</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-white tabular-nums">{log.calories} kcal</p>
                        <p className="text-[11px] text-brand-light font-medium">{log.protein_g}g protein</p>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10 border border-dashed border-dark-border rounded-2xl">
            <Utensils className="w-9 h-9 text-text-muted mx-auto mb-2 opacity-50" />
            <p className="text-sm text-text-secondary font-semibold">No meals logged yet today</p>
            <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">Scan a meal in Food Vision to start tracking what you actually eat.</p>
          </div>
        )}
      </section>
    </div>
  );
};

export default NutritionPage;
