import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  AlertTriangle,
  Info,
  Dumbbell,
  Utensils,
  Calendar,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { generateBlueprint } from '../../../services/scanApi';
import type { Blueprint } from '../../../types/scan';
import SplashScreen from '../../../components/SplashScreen';

const priorityDot = (p: string) => {
  if (p === 'high')   return 'bg-red-400';
  if (p === 'medium') return 'bg-warning';
  return 'bg-brand';
};

const priorityLabel = (p: string) => {
  if (p === 'high')   return 'text-red-400 bg-red-400/10 border-red-400/20';
  if (p === 'medium') return 'text-warning bg-warning/10 border-warning/20';
  return 'text-brand-light bg-brand/10 border-brand/20';
};

const ScanBlueprint: React.FC = () => {
  const navigate = useNavigate();
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    generateBlueprint()
      .then(setBlueprint)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to generate blueprint.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <SplashScreen isLoader message="Generating your personalised blueprint…" />;
  }

  if (error || !blueprint) {
    return (
      <div className="max-w-lg mx-auto text-center py-20 space-y-4">
        <AlertTriangle className="w-12 h-12 text-warning mx-auto" />
        <p className="text-text-secondary text-sm">{error ?? 'No blueprint available. Complete a scan first.'}</p>
        <button onClick={() => navigate('/scan')} className="fortis-btn-primary px-6 py-3">
          Start a Scan
        </button>
      </div>
    );
  }

  const bp = blueprint;

  return (
    <div className="max-w-4xl mx-auto space-y-4">

      {/* ── HERO ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden bg-dark-card border border-dark-border rounded-3xl"
      >
        <div className="absolute inset-0 bg-radial-orange pointer-events-none" />
        <div
          className="absolute bottom-0 right-4 font-black leading-none pointer-events-none select-none text-white"
          style={{ fontSize: 'clamp(4rem,14vw,9rem)', opacity: 0.04 }}
        >
          PLAN
        </div>

        <div className="relative z-10 p-7 sm:p-10">
          <p className="overline-brand mb-3">Your Adaptive Plan</p>
          <div className="brand-line mb-5" />
          <h1
            className="font-black text-white leading-none tracking-tighter mb-3"
            style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)' }}
          >
            YOUR FORTIS
            <br />
            <span className="text-brand">BLUEPRINT</span>
          </h1>
          <p className="text-xs text-text-muted">
            Generated{' '}
            {new Date(bp.generated_at).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
      </motion.div>

      {/* ── CURRENT STATE ─────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-dark-card border border-dark-border rounded-3xl p-6"
      >
        <p className="overline-brand mb-5">Current Fitness State</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Movement',     value: bp.current_state.movement_quality, suffix: '%', accent: true },
            { label: 'Mobility',     value: bp.current_state.mobility,         suffix: '%' },
            { label: 'Stability',    value: bp.current_state.stability,        suffix: '%' },
            { label: 'Recovery',     value: bp.current_state.recovery_score,   suffix: '%' },
            { label: 'Fortis Pulse', value: bp.current_state.fortis_pulse,     suffix: '' },
          ].map((item) => (
            <div
              key={item.label}
              className={`bg-dark-surface border rounded-2xl p-4 text-center transition-colors
                ${item.accent ? 'border-brand/30' : 'border-dark-border'}`}
            >
              <span
                className="font-black leading-none"
                style={{
                  fontSize: 'clamp(1.75rem,5vw,2.5rem)',
                  color: item.accent ? '#fb923c' : '#f1f5f9',
                }}
              >
                {Math.round(item.value)}
                <span className="text-sm font-bold text-text-muted">{item.suffix}</span>
              </span>
              <p className="overline mt-2">{item.label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── TRAINING FOCUS + NUTRITION row ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* Training Focus */}
        {bp.training_focus && bp.training_focus.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="lg:col-span-7 bg-dark-card border border-dark-border rounded-3xl p-6"
          >
            <div className="flex items-center gap-2 mb-5">
              <Dumbbell className="w-4 h-4 text-brand-light" />
              <p className="overline-brand">Training Focus</p>
            </div>
            <div className="space-y-4">
              {bp.training_focus.map((f, i) => {
                const priority = (f.priority || (f as any).level || 'medium').toLowerCase();
                const area = f.area || (f as any).name || 'Focus Area';
                const reason = f.reason || (f as any).desc || '';
                return (
                  <div key={i} className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${priorityDot(priority)}`} />
                      <div>
                        <p className="text-sm font-bold text-white">{area}</p>
                        <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{reason}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border whitespace-nowrap ${priorityLabel(priority)}`}>
                      {priority}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Nutrition Quick View */}
        {bp.nutrition_approach && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-5 bg-dark-card border border-dark-border rounded-3xl p-6 flex flex-col"
          >
            <div className="flex items-center gap-2 mb-5">
              <Utensils className="w-4 h-4 text-emerald-400" />
              <p className="overline-brand">Nutrition</p>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {[
                { label: 'Region',    value: bp.nutrition_approach.region },
                { label: 'Diet',      value: bp.nutrition_approach.diet_type },
                { label: 'Budget',    value: `₹${bp.nutrition_approach.daily_budget_inr}` },
                { label: 'Calories',  value: `${bp.nutrition_approach.target_calories}` },
              ].map((item) => (
                <div key={item.label} className="bg-dark-surface border border-dark-border rounded-xl p-3 text-center">
                  <p className="text-sm font-black text-white">{item.value}</p>
                  <p className="overline mt-1">{item.label}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2 mb-4">
              {bp.nutrition_approach.meals_preview.map((meal) => (
                <div key={meal.meal} className="flex items-center gap-3 bg-dark-surface border border-dark-border rounded-xl px-3 py-2.5">
                  <span className="overline-brand w-16 shrink-0">{meal.meal}</span>
                  <span className="text-xs text-text-secondary truncate">{meal.recommendation}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 mt-auto">
              {bp.nutrition_approach.highlights.map((h, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-text-muted">
                  <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{h}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* ── WEEKLY PLAN ───────────────────────────────── */}
      {bp.weekly_plan && bp.weekly_plan.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-dark-card border border-dark-border rounded-3xl p-6"
        >
          <div className="flex items-center gap-2 mb-5">
            <Calendar className="w-4 h-4 text-brand-light" />
            <p className="overline-brand">Weekly Training Plan</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {bp.weekly_plan.map((day, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28 + i * 0.04 }}
                className="bg-dark-surface border border-dark-border rounded-2xl p-4 hover:border-brand/20 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg font-black text-brand-light">{day.day}</span>
                  <span className="text-[9px] text-text-muted italic">{day.emphasis}</span>
                </div>
                <p className="text-xs font-bold text-white mb-2 leading-tight">{day.focus}</p>
                <ul className="space-y-1">
                  {day.exercises.slice(0, 3).map((ex, j) => (
                    <li key={j} className="text-[11px] text-text-muted flex items-center gap-1.5">
                      <ChevronRight className="w-3 h-3 text-brand/50 shrink-0" />
                      {ex}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Disclaimer ───────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="flex items-start gap-2 text-[11px] text-text-muted bg-dark-surface border border-dark-border/50 rounded-2xl p-4"
      >
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand" />
        {bp.disclaimer}
      </motion.div>

      {/* ── CTA ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.38 }}
        className="flex flex-col sm:flex-row gap-3 pb-4"
      >
        <button
          onClick={() => navigate('/workout')}
          className="fortis-btn-primary flex-1 py-4 text-sm font-black tracking-wide flex items-center justify-center gap-2"
        >
          VIEW ADAPTED WORKOUT
          <ArrowRight className="w-4 h-4" />
        </button>
        <button onClick={() => navigate('/scan/result')} className="fortis-btn-secondary py-4 px-6 text-sm font-semibold">
          Back to Result
        </button>
      </motion.div>

    </div>
  );
};

export default ScanBlueprint;
