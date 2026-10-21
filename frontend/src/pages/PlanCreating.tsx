import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Circle, Dumbbell, Flame, HeartPulse, Leaf, Loader2, Target } from 'lucide-react';
import { completeOnboarding } from '../services/profileApi';
import { useAuthStore } from '../stores/authStore';
import BrandLogo from '../components/BrandLogo';
import type { OnboardingData } from '../types';

/* Each build step has its own coach pose + a line the coach "says" */
const BUILD_STEPS = [
  {
    title: 'Reading your starting point',
    detail: 'Your goals, experience and readiness shape the plan.',
    icon: Target,
    image: '/landing_imgs/coach.png',
    focus: 'object-[50%_18%]',
    say: (name: string) => `Alright ${name}, let me look at where you're starting from.`,
  },
  {
    title: 'Shaping your training week',
    detail: 'Sessions fit your schedule, space and equipment.',
    icon: Dumbbell,
    image: '/landing_imgs/coach2.png',
    focus: 'object-[50%_30%]',
    say: () => 'Now the week. Every session has to fit your real schedule.',
  },
  {
    title: 'Balancing food and recovery',
    detail: 'Your preferences and daily routine guide the recommendations.',
    icon: Leaf,
    image: '/landing_imgs/hero.png',
    focus: 'object-[50%_15%]',
    say: () => 'Strong comes from eating and resting right. Building that in.',
  },
  {
    title: 'Personalising your Fortis plan',
    detail: 'Saving your profile and preparing your starter plans.',
    icon: HeartPulse,
    image: '/landing_imgs/hero_pose.png',
    focus: 'object-[50%_25%]',
    say: () => 'Last bit. Saving everything and getting your first week ready.',
  },
];

const ERROR_IMAGE = '/landing_imgs/coach.png';

/* Messages shown as the user taps "rep" while waiting */
const repMessage = (n: number) => {
  if (n === 0) return 'Tap while you wait';
  if (n < 10) return 'Good start. Keep going.';
  if (n < 25) return 'That is how a habit starts.';
  if (n < 50) return 'You are warmed up.';
  return 'Save some for the workout.';
};

const PlanCreating: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const data = (location.state as { onboardingData?: OnboardingData } | null)?.onboardingData;
  const userName = useAuthStore((s) => s.user?.name?.split(' ')[0] || 'Athlete');

  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(0);
  const [pinned, setPinned] = useState<number | null>(null); // image the user chose by tapping a step
  const [reps, setReps] = useState(0);
  const [burst, setBurst] = useState(0); // changes on each tap to restart the pop animation
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const bubbleKey = useRef(0);

  const summary = useMemo(
    () =>
      data
        ? [
            `${data.days_per_week} training days`,
            `${data.workout_duration_min} min sessions`,
            data.workout_location === 'home' ? 'Home workouts' : 'Gym workouts',
          ]
        : [],
    [data],
  );

  /* ---- build / save logic (unchanged behaviour, retry now re-runs reliably) ---- */
  useEffect(() => {
    if (!data) {
      navigate('/onboarding', { replace: true });
      return;
    }
    let mounted = true;
    const started = Date.now();
    setStep(0);
    const timers = BUILD_STEPS.map((_, i) =>
      window.setTimeout(() => {
        if (mounted) setStep((current) => Math.max(current, i + 1));
      }, 900 + i * 1350),
    );
    completeOnboarding(data)
      .then(async (response) => {
        if (!response.success && !response.onboarding_complete)
          throw new Error(response.message || 'We could not finish creating your plan.');
        await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, 5200 - (Date.now() - started))));
        if (!mounted) return;
        sessionStorage.removeItem('fortis_new_registration');
        useAuthStore.getState().setOnboardingComplete(true);
        navigate('/dashboard', { replace: true });
      })
      .catch((err: any) => {
        if (mounted)
          setError(
            err?.response?.data?.detail ||
              err?.message ||
              'Could not save your plan. Check your connection and try again.',
          );
      });
    return () => {
      mounted = false;
      timers.forEach(window.clearTimeout);
    };
  }, [data, navigate, attempt]);

  /* Follow progress: open the active step and release any manual image choice */
  useEffect(() => {
    if (step < BUILD_STEPS.length) {
      setExpanded(step);
      setPinned(null);
    }
    bubbleKey.current += 1;
  }, [step]);

  const retry = () => {
    setError('');
    setReps(0);
    setAttempt((a) => a + 1);
  };

  const rep = () => {
    setReps((r) => r + 1);
    setBurst((b) => b + 1);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(8);
  };

  const activeIndex = Math.min(step, BUILD_STEPS.length - 1);
  const shownIndex = pinned ?? activeIndex;
  const coachLine = error
    ? 'No problem. Your answers are safe. Give it another go.'
    : pinned !== null
    ? BUILD_STEPS[pinned].detail
    : BUILD_STEPS[activeIndex].say(userName);
  const progress = error ? 0 : Math.min(96, step * 24);

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-dark-bg px-4 pb-10 pt-5 text-white sm:px-8 sm:pt-7">
      {/* component-scoped animations */}
      <style>{`
        @keyframes fp-ember { 0% { transform: translateY(0) scale(1); opacity: 0; } 15% { opacity: .9; } 100% { transform: translateY(-120px) scale(.4); opacity: 0; } }
        @keyframes fp-pop { 0% { transform: scale(1); } 40% { transform: scale(.92); } 100% { transform: scale(1); } }
        @keyframes fp-rise { 0% { transform: translateY(-4px); opacity: 1; } 100% { transform: translateY(-34px); opacity: 0; } }
        @keyframes fp-bubble { 0% { opacity: 0; transform: translateY(8px) scale(.98); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes fp-pulse-ring { 0% { box-shadow: 0 0 0 0 rgba(255,125,45,.45); } 100% { box-shadow: 0 0 0 18px rgba(255,125,45,0); } }
        .fp-ember { animation: fp-ember 4.5s ease-in infinite; }
        .fp-pop { animation: fp-pop .22s ease-out; }
        .fp-rise { animation: fp-rise .7s ease-out forwards; }
        .fp-bubble { animation: fp-bubble .45s ease-out both; }
        .fp-ring { animation: fp-pulse-ring 1.8s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .fp-ember, .fp-pop, .fp-rise, .fp-bubble, .fp-ring { animation: none !important; }
        }
      `}</style>

      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-brand/15 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-red-600/10 blur-[110px]" />
      </div>

      <div className="relative mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-3">
          <BrandLogo className="h-9 w-auto sm:h-10" />
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-text-secondary sm:text-xs">
            {error ? 'Paused' : `Step ${Math.min(step + 1, BUILD_STEPS.length)} of ${BUILD_STEPS.length}`}
          </span>
        </header>

        <div className="mt-6 grid gap-5 lg:mt-10 lg:grid-cols-[1.05fr_1fr] lg:items-start lg:gap-8">
          {/* ───────── Coach card ───────── */}
          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-black shadow-[0_0_60px_rgba(255,60,30,.18)]">
            <div className="relative aspect-[4/5] w-full sm:aspect-[16/11] lg:aspect-[4/5]">
              {/* stacked, cross-fading coach images */}
              {BUILD_STEPS.map((item, i) => {
                const visible = error ? false : i === shownIndex;
                return failedImages[item.image] ? null : (
                  <img
                    key={item.image}
                    src={item.image}
                    alt={visible ? 'Coach Fortis' : ''}
                    aria-hidden={!visible}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    draggable={false}
                    onError={() => setFailedImages((f) => ({ ...f, [item.image]: true }))}
                    className={`absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-out ${item.focus} ${
                      visible ? 'scale-100 opacity-100' : 'scale-105 opacity-0'
                    }`}
                  />
                );
              })}
              {error && !failedImages[ERROR_IMAGE] && (
                <img
                  src={ERROR_IMAGE}
                  alt="Coach Fortis"
                  className="absolute inset-0 h-full w-full object-cover object-[50%_18%] opacity-70 grayscale-[40%]"
                />
              )}

              {/* readability gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" aria-hidden />
              <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" aria-hidden />

              {/* embers */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 overflow-hidden" aria-hidden>
                {[8, 22, 38, 55, 70, 86].map((left, i) => (
                  <span
                    key={left}
                    className="fp-ember absolute bottom-0 h-1.5 w-1.5 rounded-full bg-orange-400"
                    style={{ left: `${left}%`, animationDelay: `${i * 0.7}s` }}
                  />
                ))}
              </div>

              {/* active step chip */}
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-xs font-semibold backdrop-blur sm:left-4 sm:top-4">
                {(() => {
                  const Icon = error ? Circle : BUILD_STEPS[shownIndex].icon;
                  return <Icon className="h-3.5 w-3.5 text-brand-light" />;
                })()}
                <span>{error ? 'Needs a retry' : BUILD_STEPS[shownIndex].title}</span>
              </div>

              {/* coach speech bubble */}
              <div className="absolute inset-x-3 bottom-3 sm:inset-x-5 sm:bottom-5">
                <div
                  key={`${bubbleKey.current}-${pinned}-${error ? 'e' : 'ok'}`}
                  className="fp-bubble relative rounded-2xl rounded-bl-sm border border-white/15 bg-black/65 p-3.5 backdrop-blur-md sm:p-4"
                  role="status"
                  aria-live="polite"
                >
                  <p className="text-[11px] font-bold text-brand-light">Coach Fortis</p>
                  <p className="mt-1 text-sm leading-relaxed text-white sm:text-base">{coachLine}</p>
                </div>

                {/* progress */}
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden>
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand to-amber-300 transition-all duration-700"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ───────── Right column ───────── */}
          <div className="flex flex-col gap-5">
            <section className="text-center lg:text-left">
              <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                {error ? 'A small pause.' : `Let’s build your plan, ${userName}.`}
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-text-secondary sm:text-base lg:mx-0">
                {error
                  ? 'Your answers are still here. You can safely try creating your plan again.'
                  : 'Coach Fortis is connecting your goals, schedule and recovery into a practical first week.'}
              </p>
              {summary.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2 lg:justify-start">
                  {summary.map((item, i) => (
                    <span
                      key={item}
                      className={`rounded-full border px-3 py-1.5 text-xs transition-colors duration-500 ${
                        step > i
                          ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                          : 'border-white/10 bg-white/[.04] text-text-secondary'
                      }`}
                    >
                      {step > i && <Check className="mr-1 inline h-3 w-3" />}
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* steps */}
            <section className="rounded-3xl border border-white/10 bg-[#111315]/90 p-3.5 shadow-2xl backdrop-blur sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">Your plan blueprint</p>
                  <p className="mt-0.5 text-xs text-text-muted">Tap a step to see what it means</p>
                </div>
                <span className="flex items-center gap-2 text-xs text-brand-light">
                  {error ? <Circle className="h-3.5 w-3.5" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                  {error ? 'Needs a retry' : 'Working on it'}
                </span>
              </div>

              <div className="space-y-2">
                {BUILD_STEPS.map((item, index) => {
                  const Icon = item.icon;
                  const done = step > index;
                  const active = step === index && !error;
                  const open = expanded === index;
                  return (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => {
                        setExpanded(open ? null : index);
                        setPinned(open ? null : index);
                      }}
                      aria-expanded={open}
                      className={`w-full rounded-2xl border p-3 text-left transition-all active:scale-[.99] sm:p-3.5 ${
                        active
                          ? 'border-brand/40 bg-brand/[.08]'
                          : open
                          ? 'border-white/20 bg-white/[.06]'
                          : 'border-white/[.06] bg-white/[.02] hover:bg-white/[.05]'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                            done
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : active
                              ? 'bg-brand/15 text-brand-light'
                              : 'bg-white/5 text-text-muted'
                          }`}
                        >
                          {done ? <Check className="h-5 w-5" /> : <Icon className={`h-5 w-5 ${active ? 'animate-pulse' : ''}`} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold">{item.title}</span>
                          <span
                            className={`grid transition-all duration-300 ${open ? 'mt-1 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                          >
                            <span className="overflow-hidden text-xs leading-relaxed text-text-muted">{item.detail}</span>
                          </span>
                        </span>
                        <span className="text-[10px] font-semibold text-text-muted">
                          {done ? 'Ready' : active ? 'Now' : 'Next'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {error && (
                <div role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}
              {error && (
                <div className="mt-4">
                  <button
                    onClick={retry}
                    className="fortis-btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 px-5 text-sm sm:w-auto"
                  >
                    Try again <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}
              {!error && (
                <p className="mt-4 text-center text-[11px] text-text-muted">Hang tight. Your answers are being saved securely.</p>
              )}
            </section>

            {/* warm-up rep counter */}
            {!error && (
              <section className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/[.03] p-4">
                <div className="relative">
                  <button
                    type="button"
                    onClick={rep}
                    aria-label="Count a warm-up rep"
                    className={`fp-ring relative grid h-20 w-20 shrink-0 select-none place-items-center rounded-full bg-gradient-to-br from-brand to-red-600 text-white shadow-lg touch-manipulation sm:h-24 sm:w-24`}
                  >
                    <span key={burst} className="fp-pop grid place-items-center">
                      <Dumbbell className="h-8 w-8 sm:h-9 sm:w-9" />
                    </span>
                  </button>
                  {reps > 0 && (
                    <span key={`plus-${burst}`} className="fp-rise pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 text-sm font-black text-amber-300">
                      +1
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-bold">
                    <Flame className="h-4 w-4 text-brand-light" />
                    Warm-up reps: <span className="tabular-nums">{reps}</span>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">{repMessage(reps)}</p>
                </div>
              </section>
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-[11px] text-text-muted">Fortis · Built for your real life, one session at a time</p>
      </div>
    </main>
  );
};

export default PlanCreating;