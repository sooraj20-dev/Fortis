import React, { useEffect, useState } from 'react';
import { FortisPulse } from '../../components/fortis/FortisPulse';
import { FortisDecision } from '../../components/fortis/FortisDecision';
import {
  Dumbbell,
  Utensils,
  Moon,
  Flame,
  Clock,
  ArrowRight,
  Info,
  ScanLine,
  Activity,
  Sparkles,
  X,
  CheckCircle2,
  ShieldCheck,
  Target,
  Zap,
  Calendar,
  Layers,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { getLatestScan } from '../../services/scanApi';
import { useAuthStore } from '../../stores/authStore';
import Onboarding from '../Onboarding';
import type { ScanResult } from '../../types/scan';

export const Dashboard: React.FC = () => {
  const onboardingComplete = useAuthStore((s) => s.onboardingComplete);
  const userName = useAuthStore((s) => s.user?.name || 'Athlete');

  // Show onboarding wizard ONLY for newly registered users whose onboarding is incomplete
  const isNewRegistration =
    typeof window !== 'undefined' &&
    sessionStorage.getItem('fortis_new_registration') === 'true';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [latestScan, setLatestScan] = useState<ScanResult | null>(null);
  const [showOnboardingModal, setShowOnboardingModal] = useState(
    !onboardingComplete && isNewRegistration
  );

  const fetchDashboardData = () => {
    setLoading(true);
    api.get('/api/dashboard')
      .then((res) => {
        setData(res.data);
      })
      .catch((err) => {
        console.error('Failed to load dashboard data:', err);
        setData(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboardData();
    getLatestScan().then(setLatestScan).catch(() => null);
  }, []);

  // Sync modal state if store changes
  useEffect(() => {
    if (onboardingComplete) {
      setShowOnboardingModal(false);
      sessionStorage.removeItem('fortis_new_registration');
    }
  }, [onboardingComplete]);

  const handleOnboardingComplete = () => {
    setShowOnboardingModal(false);
    sessionStorage.removeItem('fortis_new_registration');
    fetchDashboardData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-text-muted">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">Synthesizing Personal Fitness State...</span>
        </div>
      </div>
    );
  }

  // Onboarding summary data helpers
  const ob = data?.onboarding_summary || {};
  const goalTitle = (ob.primary_goal || 'GENERAL_FITNESS')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  const experienceTitle = (ob.experience_level || 'BEGINNER')
    .toLowerCase()
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  const locationTitle = (ob.workout_location || 'home')
    .toLowerCase()
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  const dietTitle = (ob.diet_type || 'Balanced Diet')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  const cuisineTitle = ob.preferred_cuisine || ob.regional_preference || 'South Indian';

  // Subscores from backend fitness state
  const subscores = data?.fitness_state ? {
    strength: data.fitness_state.strength_score ?? undefined,
    recovery: data.fitness_state.recovery_score ?? undefined,
    consistency: data.fitness_state.consistency_score ?? undefined,
    nutrition: data.fitness_state.nutrition_score ?? undefined,
    fatigueRisk: data.fitness_state.fatigue_risk ?? undefined,
  } : undefined;

  const hasRecoveryLogged = data?.recovery_summary && (
    data.recovery_summary.sleep_hours !== undefined ||
    data.recovery_summary.energy_level !== undefined ||
    data.recovery_summary.recovery_score !== null
  );

  const exercises = data?.today_workout?.exercises || [];
  const exercisesToAvoid = ob.exercises_to_avoid || [];

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* ── ONBOARDING WIZARD MODAL (ONLY FOR NEW REGISTERED USERS) ── */}
      {showOnboardingModal && !onboardingComplete && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="relative w-full max-w-3xl bg-dark-bg border border-dark-border rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto hide-scrollbar">
            <button
              onClick={() => {
                setShowOnboardingModal(false);
                sessionStorage.removeItem('fortis_new_registration');
              }}
              className="absolute top-4 right-4 z-20 w-9 h-9 rounded-xl bg-dark-card border border-dark-border text-text-muted hover:text-white flex items-center justify-center text-sm font-bold transition-all shadow-card hover:border-brand/40"
              title="Close and explore dashboard"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="p-1 sm:p-3">
              <Onboarding
                isModal
                onComplete={handleOnboardingComplete}
                onClose={() => {
                  setShowOnboardingModal(false);
                  sessionStorage.removeItem('fortis_new_registration');
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── NEW USER SETUP BANNER (ONLY FOR NEW REGISTERED USERS BEFORE COMPLETION) ── */}
      {!onboardingComplete && isNewRegistration && (
        <div className="relative overflow-hidden bg-gradient-to-r from-brand/20 via-dark-card to-dark-card border-2 border-brand/40 rounded-3xl p-6 sm:p-7 shadow-glow">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 relative z-10">
            <div className="space-y-1.5 max-w-lg">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-brand text-white shadow-glow">
                  First-Time Setup
                </span>
                <span className="text-xs text-brand-light font-semibold">AI Personalization</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white">
                Complete Your Fitness Onboarding
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Welcome, {userName}! Answer 6 quick questions so Fortis AI can generate your tailored workout schedule, exercise choices, and regional nutrition targets.
              </p>
            </div>

            <button
              onClick={() => setShowOnboardingModal(true)}
              className="fortis-btn-primary inline-flex items-center gap-2 py-3 px-6 text-sm font-black tracking-wide shrink-0 shadow-glow"
            >
              <Sparkles className="w-4 h-4" />
              <span>Answer Questions</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── 1. HEADER & ATHLETE SUMMARY ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              {data?.greeting || `Welcome, ${userName}`}
            </h1>
            {onboardingComplete && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-success/15 text-success border border-success/30">
                <CheckCircle2 className="w-3 h-3" />
                Profile Active
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-text-secondary">
            {onboardingComplete
              ? `AI Continuous Adaptation: Calibrated for ${goalTitle} • ${locationTitle} Setup • ${cuisineTitle} Nutrition`
              : 'Complete your onboarding questions to activate your personalized AI training cycle.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Link
            to="/workout"
            className="fortis-btn-primary text-xs sm:text-sm py-2 px-3.5 inline-flex items-center gap-2 shadow-glow"
          >
            <Dumbbell className="w-4 h-4" />
            <span>Today's Session</span>
          </Link>
          <Link
            to="/coach"
            className="fortis-btn-secondary text-xs sm:text-sm py-2 px-3.5 inline-flex items-center gap-1.5"
          >
            <span>Ask Coach</span>
            <ArrowRight className="w-3.5 h-3.5 text-brand-light" />
          </Link>
        </div>
      </div>

      {/* ── 2. ONBOARDING BLUEPRINT STRIP (SIMPLE & CONCISE) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Goal Card */}
        <div className="bg-dark-card border border-dark-border/80 rounded-2xl p-4 shadow-card hover:border-brand/30 transition-colors">
          <div className="flex items-center gap-2 text-brand-light mb-1.5">
            <Target className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Primary Goal</span>
          </div>
          <h4 className="text-sm sm:text-base font-black text-white truncate">{goalTitle}</h4>
          <p className="text-[11px] text-text-secondary mt-0.5">{experienceTitle} Level</p>
        </div>

        {/* Schedule & Location Card */}
        <div className="bg-dark-card border border-dark-border/80 rounded-2xl p-4 shadow-card hover:border-brand/30 transition-colors">
          <div className="flex items-center gap-2 text-indigo-400 mb-1.5">
            <Calendar className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Training Rhythm</span>
          </div>
          <h4 className="text-sm sm:text-base font-black text-white">
            {ob.days_per_week || 3} Days / Week
          </h4>
          <p className="text-[11px] text-text-secondary mt-0.5 truncate">
            {locationTitle} • {ob.workout_duration_min || 45} mins
          </p>
        </div>

        {/* Nutrition Blueprint Card */}
        <div className="bg-dark-card border border-dark-border/80 rounded-2xl p-4 shadow-card hover:border-brand/30 transition-colors">
          <div className="flex items-center gap-2 text-emerald-400 mb-1.5">
            <Utensils className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Diet & Cuisine</span>
          </div>
          <h4 className="text-sm sm:text-base font-black text-white truncate">{dietTitle}</h4>
          <p className="text-[11px] text-text-secondary mt-0.5 truncate">
            {cuisineTitle} • ₹{ob.daily_budget_inr || 150}/day
          </p>
        </div>

        {/* Recovery & Safeguards Card */}
        <div className="bg-dark-card border border-dark-border/80 rounded-2xl p-4 shadow-card hover:border-brand/30 transition-colors">
          <div className="flex items-center gap-2 text-amber-400 mb-1.5">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">AI Safeguards</span>
          </div>
          <h4 className="text-sm sm:text-base font-black text-white truncate">
            {exercisesToAvoid.length > 0 ? `${exercisesToAvoid.length} Exercises Filtered` : 'All Exercises Safe'}
          </h4>
          <p className="text-[11px] text-text-secondary mt-0.5 truncate">
            {ob.injury_notes ? `Note: ${ob.injury_notes}` : 'No movement restrictions'}
          </p>
        </div>
      </div>

      {/* ── 3. MAIN TRAINING & BIOMETRICS (7 COLS / 5 COLS) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── LEFT: TODAY'S AI WORKOUT (TAILORED FROM ONBOARDING) ── */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="bg-dark-card border border-brand/30 rounded-3xl p-6 shadow-glow relative overflow-hidden flex-1 flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-64 h-64 bg-radial-orange pointer-events-none opacity-40" />

            <div>
              {/* Header */}
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-brand/20 border border-brand/40 flex items-center justify-center text-brand-light">
                    <Dumbbell className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-light">
                      AI Generated Workout
                    </span>
                    <h3 className="text-lg sm:text-xl font-black text-white">
                      {data?.today_workout?.workout_type || `${goalTitle} Session`}
                    </h3>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-brand/15 text-brand-light border border-brand/30">
                  {data?.today_workout?.status || 'Scheduled'}
                </span>
              </div>

              {/* Workout Details Strip */}
              <div className="grid grid-cols-3 gap-2 py-3 px-4 bg-dark-surface/80 rounded-2xl border border-dark-border text-center mb-4">
                <div>
                  <span className="text-[10px] text-text-muted uppercase font-bold block">Target Duration</span>
                  <span className="text-sm font-extrabold text-white flex items-center justify-center gap-1 mt-0.5">
                    <Clock className="w-3.5 h-3.5 text-text-muted" />
                    {data?.today_workout?.estimated_duration_min || ob.workout_duration_min || 45} mins
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted uppercase font-bold block">Movement Volume</span>
                  <span className="text-sm font-extrabold text-brand-light flex items-center justify-center gap-1 mt-0.5">
                    <Flame className="w-3.5 h-3.5 text-brand-light" />
                    {exercises.length || 4} Exercises
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted uppercase font-bold block">Setup Location</span>
                  <span className="text-sm font-extrabold text-white flex items-center justify-center gap-1 mt-0.5">
                    <Layers className="w-3.5 h-3.5 text-text-muted" />
                    {locationTitle}
                  </span>
                </div>
              </div>

              {/* Safeguard pill if user specified avoidances */}
              {exercisesToAvoid.length > 0 && (
                <div className="mb-4 flex items-center gap-2 bg-dark-surface/60 border border-success/30 rounded-xl p-2.5 text-xs text-text-secondary">
                  <ShieldCheck className="w-4 h-4 text-success shrink-0" />
                  <span>
                    <strong className="text-success font-semibold">AI Safeguard Applied:</strong> Excluded{' '}
                    <span className="text-white font-medium">{exercisesToAvoid.join(', ')}</span> as requested in onboarding.
                  </span>
                </div>
              )}

              {/* Exercise Checklist */}
              <div className="space-y-2 mb-6">
                <div className="flex items-center justify-between text-xs font-bold text-text-muted uppercase tracking-wider px-1">
                  <span>Planned Exercises</span>
                  <span>Target Sets × Reps</span>
                </div>

                {exercises.length > 0 ? (
                  exercises.slice(0, 5).map((ex: any, idx: number) => (
                    <div
                      key={ex.id || idx}
                      className="flex items-center justify-between bg-dark-surface/90 hover:bg-dark-surface border border-dark-border/80 rounded-xl p-3 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-lg bg-dark-card border border-dark-border text-[11px] font-bold text-text-muted flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <h5 className="text-xs sm:text-sm font-bold text-white">{ex.name}</h5>
                          <span className="text-[10px] text-text-muted uppercase font-medium">
                            {ex.muscle_groups?.slice(0, 2).join(', ') || 'Compound'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-bold text-brand-light">
                          {ex.planned_sets || 3} sets × {ex.planned_reps || 10} reps
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-4 text-center text-xs text-text-muted bg-dark-surface rounded-xl">
                    Exercises calibrated and ready in your active training block.
                  </div>
                )}
              </div>
            </div>

            {/* Start CTA */}
            <Link
              to="/workout"
              className="fortis-btn-primary w-full py-3.5 text-center flex items-center justify-center gap-2 text-sm font-black tracking-wide shadow-glow"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>START TODAY'S WORKOUT & LOG RPE</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* ── RIGHT: PULSE, DECISION & SCAN ── */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Signature Metric: Fortis Pulse */}
          <div className="bg-dark-card border border-dark-border rounded-3xl p-6 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black text-brand-light tracking-wider uppercase">Signature Biometric</span>
              <span className="text-[11px] text-text-muted">Real-time Adaptation</span>
            </div>
            <FortisPulse score={data?.fortis_pulse ?? null} subscores={subscores} />
          </div>

          {/* Today's Decision Recommendation */}
          {data?.today_decision ? (
            <FortisDecision decision={data.today_decision} />
          ) : (
            <div className="bg-dark-card border border-dark-border rounded-2xl p-5 shadow-card flex items-start gap-3">
              <Activity className="w-5 h-5 text-brand-light shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm text-white">Daily Decision Calibrated</h4>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                  Train with standard progressive overload. Your starter session is built for {locationTitle} equipment.
                </p>
              </div>
            </div>
          )}

          {/* Movement Scan Shortcut */}
          <div className="bg-dark-card border border-dark-border rounded-2xl p-5 shadow-card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ScanLine className="w-4 h-4 text-brand-light" />
                <h4 className="text-sm font-bold text-white">Fortis Movement Scan</h4>
              </div>
              <span className="text-[10px] font-bold text-text-muted uppercase">Vision AI</span>
            </div>
            <p className="text-xs text-text-secondary mb-3 leading-relaxed">
              {latestScan
                ? `Latest Scan Quality: ${Math.round(latestScan.movement_quality)}% (Mobility: ${Math.round(latestScan.mobility_score)}%)`
                : '30-second camera squat analysis to check mobility, symmetry, and joint kinetic alignment.'}
            </p>
            <Link
              to={latestScan ? '/scan/result' : '/scan'}
              className="fortis-btn-secondary w-full py-2 text-center text-xs font-bold block"
            >
              {latestScan ? 'View Scan Blueprint →' : 'Start Camera Scan →'}
            </Link>
          </div>
        </div>
      </div>

      {/* ── 4. SECONDARY ROW: NUTRITION & RECOVERY SUMMARIES ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Nutrition Snapshot */}
        <div className="bg-dark-card border border-dark-border rounded-2xl p-5 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Utensils className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-sm text-white">Regional Nutrition Blueprint</h3>
            </div>
            <Link to="/nutrition" className="text-xs text-brand-light font-semibold hover:underline">
              Manage →
            </Link>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <div className="flex justify-between text-xs mb-1 text-text-secondary">
                <span>Calories ({data?.nutrition_summary?.total_calories ?? 0} / {data?.nutrition_summary?.target_calories ?? 2200} kcal)</span>
                <span>{data?.nutrition_summary?.calories_pct ?? 0}%</span>
              </div>
              <div className="w-full bg-dark-border h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, data?.nutrition_summary?.calories_pct ?? 0)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1 text-text-secondary">
                <span>Protein ({data?.nutrition_summary?.total_protein_g ?? 0}g / 150g)</span>
                <span>{data?.nutrition_summary?.protein_pct ?? 0}%</span>
              </div>
              <div className="w-full bg-dark-border h-2 rounded-full overflow-hidden">
                <div
                  className="bg-brand h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, data?.nutrition_summary?.protein_pct ?? 0)}%` }}
                />
              </div>
            </div>

            <div className="p-3 bg-dark-surface rounded-xl flex items-center justify-between text-xs">
              <div>
                <span className="text-text-muted block text-[10px] uppercase font-bold">Cuisine & Diet</span>
                <span className="text-white font-semibold">{cuisineTitle} • {dietTitle}</span>
              </div>
              <div className="text-right">
                <span className="text-text-muted block text-[10px] uppercase font-bold">Daily Budget</span>
                <span className="font-bold text-emerald-400">
                  ₹{data?.nutrition_summary?.budget_remaining_inr ?? ob.daily_budget_inr ?? 150}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Recovery Snapshot */}
        <div className="bg-dark-card border border-dark-border rounded-2xl p-5 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-indigo-400" />
              <h3 className="font-bold text-sm text-white">Recovery & Lifestyle Baseline</h3>
            </div>
            <Link to="/recovery" className="text-xs text-brand-light font-semibold hover:underline">
              Log Details →
            </Link>
          </div>

          {hasRecoveryLogged ? (
            <div className="grid grid-cols-3 gap-2 my-3">
              <div className="p-3 bg-dark-surface rounded-xl text-center">
                <span className="text-[10px] text-text-muted uppercase font-bold block">Score</span>
                <span className="text-base font-extrabold text-success">
                  {data?.recovery_summary?.recovery_score !== undefined && data.recovery_summary.recovery_score !== null
                    ? `${Math.round(data.recovery_summary.recovery_score)}%`
                    : '—'}
                </span>
              </div>
              <div className="p-3 bg-dark-surface rounded-xl text-center">
                <span className="text-[10px] text-text-muted uppercase font-bold block">Sleep</span>
                <span className="text-base font-extrabold text-white">
                  {data?.recovery_summary?.sleep_hours !== undefined && data.recovery_summary.sleep_hours !== null
                    ? `${data.recovery_summary.sleep_hours}h`
                    : '—'}
                </span>
              </div>
              <div className="p-3 bg-dark-surface rounded-xl text-center">
                <span className="text-[10px] text-text-muted uppercase font-bold block">Energy</span>
                <span className="text-base font-extrabold text-brand-light">
                  {data?.recovery_summary?.energy_level !== undefined && data.recovery_summary.energy_level !== null
                    ? `${data.recovery_summary.energy_level}/10`
                    : '—'}
                </span>
              </div>
            </div>
          ) : (
            <div className="my-3 p-3.5 bg-dark-surface rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-white block">Sleep & Energy Baseline Active</span>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Calibrated for {ob.workout_duration_min || 45}m sessions. Log daily sleep to adapt training load.
                </p>
              </div>
              <Link to="/recovery" className="fortis-btn-secondary py-1.5 px-3 text-xs shrink-0 ml-2">
                Log Recovery
              </Link>
            </div>
          )}

          <div className="text-xs text-text-secondary flex items-start gap-2 bg-dark-surface p-2.5 rounded-xl">
            <Info className="w-4 h-4 text-brand-light shrink-0 mt-0.5" />
            <span>
              {ob.injury_notes
                ? `AI Caution active: "${ob.injury_notes}". Training intensity is adapted to prevent strain.`
                : 'Adaptive fatigue prediction recalibrates automatically when recovery logs are added.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
