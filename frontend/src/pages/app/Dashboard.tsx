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
  CheckCircle2,
  ShieldCheck,
  Target,
  Zap,
  Calendar,
  Layers,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api, { getCached } from '../../services/api';
import { getLatestScan } from '../../services/scanApi';
import { useAuthStore } from '../../stores/authStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import SplashScreen from '../../components/SplashScreen';
import Onboarding from '../Onboarding';
import type { ScanResult } from '../../types/scan';

const COACH_IMG = '/landing_imgs/hero.png';

const COACH_QUOTES = [
  "The iron doesn't care about your excuses. Your body does, so listen to it.",
  'Rest is not weakness. It is where the strength actually gets built.',
  'Beat the man you were yesterday. Nobody else is on your scoreboard.',
  'Heavy days make you strong. Smart days keep you standing.',
  'Show up tired. Leave proud. That is the whole secret.',
];

const cx = (...c: Array<string | false | undefined | null>) => c.filter(Boolean).join(' ');

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/* ───────────────────────── UI pieces ───────────────────────── */

const StatCard: React.FC<{
  icon: React.ElementType;
  iconClass: string;
  label: string;
  value: string;
  sub: string;
}> = ({ icon: Icon, iconClass, label, value, sub }) => (
  <div className="bg-dark-card border border-dark-border/80 rounded-2xl p-4 shadow-card hover:border-brand/30 transition-colors min-w-[72%] min-[480px]:min-w-[44%] md:min-w-0 snap-start">
    <div className="flex items-center gap-2 mb-2">
      <span className="w-7 h-7 rounded-lg bg-dark-surface flex items-center justify-center shrink-0">
        <Icon className={cx('w-4 h-4', iconClass)} />
      </span>
      <span className="text-xs font-semibold text-text-muted">{label}</span>
    </div>
    <h4 className="text-base font-black text-white leading-snug line-clamp-2">{value}</h4>
    <p className="text-[11px] text-text-secondary mt-1 line-clamp-2">{sub}</p>
  </div>
);

const Panel: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <div className={cx('bg-dark-card border border-dark-border rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-card', className)}>
    {children}
  </div>
);

const PanelHeader: React.FC<{
  icon: React.ElementType;
  iconClass: string;
  title: string;
  to?: string;
  action?: string;
}> = ({ icon: Icon, iconClass, title, to, action }) => (
  <div className="flex items-center justify-between gap-3 mb-4">
    <div className="flex items-center gap-2 min-w-0">
      <Icon className={cx('w-4 h-4 shrink-0', iconClass)} />
      <h3 className="font-bold text-sm text-white truncate">{title}</h3>
    </div>
    {to && action && (
      <Link to={to} className="text-xs text-brand-light font-semibold hover:underline shrink-0 py-1">
        {action} →
      </Link>
    )}
  </div>
);

const MiniStat: React.FC<{ label: string; value: string; valueClass?: string }> = ({ label, value, valueClass }) => (
  <div className="p-3 bg-dark-surface rounded-xl text-center">
    <span className="text-[11px] text-text-muted block">{label}</span>
    <span className={cx('text-base font-extrabold', valueClass || 'text-white')}>{value}</span>
  </div>
);

const Bar: React.FC<{ label: string; right: string; pct: number; barClass: string }> = ({ label, right, pct, barClass }) => (
  <div>
    <div className="flex justify-between gap-3 text-xs mb-1.5 text-text-secondary">
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 tabular-nums">{right}</span>
    </div>
    <div className="w-full bg-dark-border h-2 rounded-full overflow-hidden">
      <div className={cx('h-full rounded-full transition-all duration-700', barClass)} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  </div>
);

/* ───────────────────────── Page ───────────────────────── */

export const Dashboard: React.FC = () => {
  const onboardingComplete = useAuthStore((s) => s.onboardingComplete);
  const userName = useAuthStore((s) => s.user?.name || 'Athlete');

  // Show onboarding wizard ONLY for newly registered users whose onboarding is incomplete
  const isNewRegistration =
    typeof window !== 'undefined' && sessionStorage.getItem('fortis_new_registration') === 'true';

  const {
    data,
    loading,
    latestScan,
    fetchDashboardData,
    fetchLatestScan,
  } = useDashboardStore();

  const [showOnboardingModal, setShowOnboardingModal] = useState(!onboardingComplete && isNewRegistration);

  useEffect(() => {
    fetchDashboardData();
    fetchLatestScan();
  }, [fetchDashboardData, fetchLatestScan]);

  // Sync modal state if store changes
  useEffect(() => {
    if (onboardingComplete) {
      setShowOnboardingModal(false);
      sessionStorage.removeItem('fortis_new_registration');
    }
  }, [onboardingComplete]);

  // Lock page scroll behind the full-screen setup sheet
  useEffect(() => {
    if (!showOnboardingModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showOnboardingModal]);

  const closeOnboarding = () => {
    setShowOnboardingModal(false);
    sessionStorage.removeItem('fortis_new_registration');
  };

  const handleOnboardingComplete = () => {
    closeOnboarding();
    fetchDashboardData(true);
  };

  if (loading && !data) {
    return <SplashScreen isLoader message="Synthesizing your Personal Fitness State…" />;
  }

  // Onboarding summary data helpers
  const ob = data?.onboarding_summary || {};
  const goalTitle = titleCase((ob.primary_goal || 'GENERAL_FITNESS').replace(/_/g, ' '));
  const experienceTitle = titleCase(ob.experience_level || 'BEGINNER');
  const locationTitle = titleCase(ob.workout_location || 'home');
  const dietTitle = titleCase((ob.diet_type || 'Balanced Diet').replace(/_/g, ' '));
  const cuisineTitle = ob.preferred_cuisine || ob.regional_preference || 'South Indian';

  // Subscores from backend fitness state
  const subscores = data?.fitness_state
    ? {
        strength: data.fitness_state.strength_score ?? undefined,
        recovery: data.fitness_state.recovery_score ?? undefined,
        consistency: data.fitness_state.consistency_score ?? undefined,
        nutrition: data.fitness_state.nutrition_score ?? undefined,
        fatigueRisk: data.fitness_state.fatigue_risk ?? undefined,
      }
    : undefined;

  const hasRecoveryLogged =
    data?.recovery_summary &&
    (data.recovery_summary.sleep_hours !== undefined ||
      data.recovery_summary.energy_level !== undefined ||
      data.recovery_summary.recovery_score !== null);

  const exercises = data?.today_workout?.exercises || [];
  const exercisesToAvoid = ob.exercises_to_avoid || [];

  // One coach quote per day
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const dailyQuote = COACH_QUOTES[dayOfYear % COACH_QUOTES.length];

  const rec = data?.recovery_summary;

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 pb-12">
      {/* ── ONBOARDING WIZARD (full-screen sheet on phones, dialog on larger screens) ── */}
      {showOnboardingModal && !onboardingComplete && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex sm:items-center sm:justify-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Fitness onboarding"
        >
          <div className="relative w-full h-[100dvh] sm:h-auto sm:max-w-3xl sm:max-h-[92vh] bg-dark-bg sm:border sm:border-dark-border sm:rounded-3xl sm:shadow-2xl overflow-y-auto overscroll-contain hide-scrollbar">
            <Onboarding isModal onComplete={handleOnboardingComplete} onClose={closeOnboarding} />
          </div>
        </div>
      )}

      {/* ── 1. HERO BANNER ── */}
      <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-brand/25 bg-dark-card">
        <img
          src={COACH_IMG}
          alt=""
          aria-hidden
          className="absolute inset-y-0 right-0 w-full sm:w-[52%] h-full object-cover object-[50%_10%] opacity-45 sm:opacity-100"
        />
        <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-dark-card via-dark-card/85 to-dark-card/10 sm:to-transparent" />
        <div className="absolute inset-0 bg-radial-orange opacity-40 pointer-events-none" />

        <div className="relative z-10 p-5 pt-28 sm:p-8 sm:pt-8 sm:pr-[45%]">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
              {data?.greeting || `Welcome, ${userName}`}
            </h1>
            {onboardingComplete && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-success/15 text-success border border-success/30">
                <CheckCircle2 className="w-3 h-3" />
                Profile active
              </span>
            )}
          </div>

          <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-md">
            {onboardingComplete
              ? `Calibrated for ${goalTitle} · ${locationTitle} setup · ${cuisineTitle} nutrition`
              : 'Complete your onboarding questions to activate your personalised AI training cycle.'}
          </p>

          <p className="mt-4 text-sm sm:text-base font-semibold text-white/90 leading-snug max-w-md">
            “{dailyQuote}”
            <span className="block text-xs text-brand-light font-bold mt-1">Coach Fortis</span>
          </p>

          <div className="flex flex-col min-[420px]:flex-row gap-2.5 mt-5">
            <Link
              to="/workout"
              className="fortis-btn-primary text-sm py-3 px-5 inline-flex items-center justify-center gap-2 shadow-glow"
            >
              <Dumbbell className="w-4 h-4" />
              <span>Today's session</span>
            </Link>
            <Link
              to="/coach"
              className="fortis-btn-secondary text-sm py-3 px-5 inline-flex items-center justify-center gap-1.5"
            >
              <span>Ask coach</span>
              <ArrowRight className="w-4 h-4 text-brand-light" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── 2. FIRST-TIME SETUP BANNER ── */}
      {!onboardingComplete && isNewRegistration && (
        <div className="relative overflow-hidden bg-gradient-to-r from-brand/20 via-dark-card to-dark-card border border-brand/40 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-glow">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div className="space-y-1.5 max-w-lg">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand text-white">
                First-time setup
              </span>
              <h3 className="text-lg sm:text-2xl font-black text-white">Complete your fitness onboarding</h3>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                Welcome, {userName}. Answer a few quick questions so Fortis can build your workout schedule, exercise choices, and
                regional nutrition targets.
              </p>
            </div>
            <button
              onClick={() => setShowOnboardingModal(true)}
              className="fortis-btn-primary inline-flex items-center justify-center gap-2 py-3 px-6 text-sm font-bold shrink-0 shadow-glow w-full sm:w-auto"
            >
              <Sparkles className="w-4 h-4" />
              <span>Answer questions</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── 3. BLUEPRINT STRIP (swipeable on phones) ── */}
      <div className="flex md:grid md:grid-cols-4 gap-3 overflow-x-auto md:overflow-visible snap-x snap-mandatory pb-1 hide-scrollbar">
        <StatCard
          icon={Target}
          iconClass="text-brand-light"
          label="Primary goal"
          value={goalTitle}
          sub={`${experienceTitle} level`}
        />
        <StatCard
          icon={Calendar}
          iconClass="text-indigo-400"
          label="Training rhythm"
          value={`${ob.days_per_week || 3} days / week`}
          sub={`${locationTitle} · ${ob.workout_duration_min || 45} mins`}
        />
        <StatCard
          icon={Utensils}
          iconClass="text-emerald-400"
          label="Diet & cuisine"
          value={dietTitle}
          sub={`${cuisineTitle} · ₹${ob.daily_budget_inr || 150}/day`}
        />
        <StatCard
          icon={ShieldCheck}
          iconClass="text-amber-400"
          label="AI safeguards"
          value={
            exercisesToAvoid.length > 0
              ? `${exercisesToAvoid.length} exercises filtered`
              : onboardingComplete
                ? 'No restrictions logged'
                : 'Assessment pending'
          }
          sub={
            ob.injury_notes
              ? `Note: ${ob.injury_notes}`
              : onboardingComplete
                ? 'No movement restrictions reported'
                : 'Complete onboarding assessment'
          }
        />
      </div>

      {/* ── 4. MAIN: WORKOUT + BIOMETRICS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* LEFT: today's workout */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="bg-dark-card border border-brand/30 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-glow relative overflow-hidden flex-1 flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-64 h-64 bg-radial-orange pointer-events-none opacity-40" />

            <div className="relative">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-brand/20 border border-brand/40 flex items-center justify-center text-brand-light shrink-0">
                    <Dumbbell className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-brand-light">AI generated workout</span>
                    <h3 className="text-lg sm:text-xl font-black text-white leading-tight truncate">
                      {data?.today_workout?.workout_type || `${goalTitle} Session`}
                    </h3>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-brand/15 text-brand-light border border-brand/30 shrink-0">
                  {data?.today_workout?.status || 'Scheduled'}
                </span>
              </div>

              {/* Details strip */}
              <div className="grid grid-cols-3 divide-x divide-dark-border py-3 bg-dark-surface/80 rounded-2xl border border-dark-border text-center mb-4">
                <div className="px-1">
                  <span className="text-[11px] text-text-muted block">Duration</span>
                  <span className="text-sm font-extrabold text-white flex items-center justify-center gap-1 mt-0.5">
                    <Clock className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    {data?.today_workout?.estimated_duration_min || ob.workout_duration_min || 45}m
                  </span>
                </div>
                <div className="px-1">
                  <span className="text-[11px] text-text-muted block">Volume</span>
                  <span className="text-sm font-extrabold text-brand-light flex items-center justify-center gap-1 mt-0.5">
                    <Flame className="w-3.5 h-3.5 shrink-0" />
                    {exercises.length || 4} moves
                  </span>
                </div>
                <div className="px-1 min-w-0">
                  <span className="text-[11px] text-text-muted block">Location</span>
                  <span className="text-sm font-extrabold text-white flex items-center justify-center gap-1 mt-0.5">
                    <Layers className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    <span className="truncate">{locationTitle}</span>
                  </span>
                </div>
              </div>

              {/* Safeguard note */}
              {exercisesToAvoid.length > 0 && (
                <div className="mb-4 flex items-start gap-2 bg-dark-surface/60 border border-success/30 rounded-xl p-3 text-xs text-text-secondary">
                  <ShieldCheck className="w-4 h-4 text-success shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-success font-semibold">AI safeguard applied:</strong> excluded{' '}
                    <span className="text-white font-medium">{exercisesToAvoid.join(', ')}</span> as requested in onboarding.
                  </span>
                </div>
              )}

              {/* Exercise list */}
              <div className="space-y-2 mb-5">
                <div className="flex items-center justify-between text-xs font-semibold text-text-muted px-1">
                  <span>Planned exercises</span>
                  <span>Sets × reps</span>
                </div>

                {exercises.length > 0 ? (
                  exercises.slice(0, 5).map((ex: any, idx: number) => (
                    <div
                      key={ex.id || idx}
                      className="flex items-center justify-between gap-3 bg-dark-surface/90 hover:bg-dark-surface border border-dark-border/80 rounded-xl p-3 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 h-7 rounded-lg bg-dark-card border border-dark-border text-xs font-bold text-text-muted flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <h5 className="text-sm font-bold text-white truncate">{ex.name}</h5>
                          <span className="text-[11px] text-text-muted truncate block">
                            {ex.muscle_groups?.slice(0, 2).join(', ') || 'Compound'}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-brand-light shrink-0 whitespace-nowrap">
                        {ex.planned_sets || 3} × {ex.planned_reps || 10}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-4 px-3 text-center text-xs text-text-muted bg-dark-surface rounded-xl">
                    Exercises calibrated and ready in your active training block.
                  </div>
                )}
              </div>
            </div>

            <Link
              to="/workout"
              className="relative fortis-btn-primary w-full py-3.5 text-center flex items-center justify-center gap-2 text-sm font-bold shadow-glow"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>Start workout & log RPE</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* RIGHT: pulse, decision, scan */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <Panel>
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="text-sm font-bold text-white">Fortis Pulse</span>
              <span className="text-[11px] text-text-muted">Real-time adaptation</span>
            </div>
            <FortisPulse score={data?.fortis_pulse ?? null} subscores={subscores} />
          </Panel>

          {data?.today_decision ? (
            <FortisDecision decision={data.today_decision} />
          ) : (
            <div className="bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-5 shadow-card flex items-start gap-3">
              <Activity className="w-5 h-5 text-brand-light shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm text-white">Daily decision calibrated</h4>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                  Train with standard progressive overload. Your starter session is built for {locationTitle} equipment.
                </p>
              </div>
            </div>
          )}

          <Panel className="!p-4 sm:!p-5 !rounded-2xl">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <ScanLine className="w-4 h-4 text-brand-light" />
                <h4 className="text-sm font-bold text-white">Movement scan</h4>
              </div>
              <span className="text-[11px] text-text-muted">Vision AI</span>
            </div>
            <p className="text-xs text-text-secondary mb-3 leading-relaxed">
              {latestScan
                ? `Latest scan quality: ${Math.round(latestScan.movement_quality)}% (mobility ${Math.round(latestScan.mobility_score)}%)`
                : '30-second camera squat analysis to check mobility, symmetry, and joint alignment.'}
            </p>
            <Link
              to={latestScan ? '/scan/result' : '/scan'}
              className="fortis-btn-secondary w-full py-2.5 text-center text-xs font-bold block"
            >
              {latestScan ? 'View scan blueprint →' : 'Start camera scan →'}
            </Link>
          </Panel>
        </div>
      </div>

      {/* ── 5. NUTRITION & RECOVERY ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <Panel>
          <PanelHeader icon={Utensils} iconClass="text-emerald-400" title="Regional nutrition blueprint" to="/nutrition" action="Manage" />
          <div className="space-y-4">
            <Bar
              label={`Calories (${data?.nutrition_summary?.total_calories ?? 0} / ${data?.nutrition_summary?.target_calories ?? 2200} kcal)`}
              right={`${data?.nutrition_summary?.calories_pct ?? 0}%`}
              pct={data?.nutrition_summary?.calories_pct ?? 0}
              barClass="bg-emerald-500"
            />
            <Bar
              label={`Protein (${data?.nutrition_summary?.total_protein_g ?? 0}g / 150g)`}
              right={`${data?.nutrition_summary?.protein_pct ?? 0}%`}
              pct={data?.nutrition_summary?.protein_pct ?? 0}
              barClass="bg-brand"
            />
            <div className="p-3 bg-dark-surface rounded-xl flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <span className="text-text-muted block text-[11px]">Cuisine & diet</span>
                <span className="text-white font-semibold block truncate">
                  {cuisineTitle} · {dietTitle}
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-text-muted block text-[11px]">Daily budget</span>
                <span className="font-bold text-emerald-400">
                  ₹{data?.nutrition_summary?.budget_remaining_inr ?? ob.daily_budget_inr ?? 150}
                </span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader icon={Moon} iconClass="text-indigo-400" title="Recovery & lifestyle baseline" to="/recovery" action="Log details" />

          {hasRecoveryLogged ? (
            <div className="grid grid-cols-3 gap-2 mb-3">
              <MiniStat
                label="Score"
                valueClass="text-success"
                value={
                  rec?.recovery_score !== undefined && rec.recovery_score !== null ? `${Math.round(rec.recovery_score)}%` : '—'
                }
              />
              <MiniStat
                label="Sleep"
                value={rec?.sleep_hours !== undefined && rec.sleep_hours !== null ? `${rec.sleep_hours}h` : '—'}
              />
              <MiniStat
                label="Energy"
                valueClass="text-brand-light"
                value={rec?.energy_level !== undefined && rec.energy_level !== null ? `${rec.energy_level}/10` : '—'}
              />
            </div>
          ) : (
            <div className="mb-3 p-3.5 bg-dark-surface rounded-xl flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-white block">Sleep & energy baseline active</span>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Calibrated for {ob.workout_duration_min || 45}m sessions. Log daily sleep to adapt training load.
                </p>
              </div>
              <Link to="/recovery" className="fortis-btn-secondary py-2 px-3 text-xs shrink-0 text-center">
                Log recovery
              </Link>
            </div>
          )}

          <div className="text-xs text-text-secondary flex items-start gap-2 bg-dark-surface p-3 rounded-xl">
            <Info className="w-4 h-4 text-brand-light shrink-0 mt-0.5" />
            <span className="min-w-0 break-words">
              {ob.injury_notes
                ? `AI caution active: "${ob.injury_notes}". Training intensity is adapted to prevent strain.`
                : 'Adaptive fatigue prediction recalibrates automatically when recovery logs are added.'}
            </span>
          </div>
        </Panel>
      </div>
    </div>
  );
};

export default Dashboard;