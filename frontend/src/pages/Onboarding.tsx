import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  User,
  Target,
  Utensils,
  Moon,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Crosshair,
  X,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import BrandLogo from '../components/BrandLogo';
import BodyMap, { FOCUS_GROUPS, type FocusId } from '../components/BodyMap';
import type { OnboardingData } from '../types';

export interface OnboardingProps {
  isModal?: boolean;
  onClose?: () => void;
}

const COACH_IMG = '/landing_imgs/hero_pose.png';

const STEPS = [
  { id: 1, title: 'About you', icon: User, tip: "Honest numbers make a better plan. Nobody's grading you." },
  { id: 2, title: 'Goals & schedule', icon: Target, tip: "Pick what you'll actually do. Consistency beats ambition." },
  { id: 3, title: 'Nutrition', icon: Utensils, tip: "Food is fuel. Tell me what's on your plate and your budget." },
  { id: 4, title: 'Lifestyle', icon: Moon, tip: 'Sleep is the cheapest supplement there is.' },
  { id: 5, title: 'Safety', icon: ShieldCheck, tip: "Tell me what hurts. I'd rather work around it than through it." },
  { id: 6, title: 'Focus', icon: Crosshair, tip: 'Pick where you want extra emphasis. Everything else still gets trained.' },
  { id: 7, title: 'Review', icon: Sparkles, tip: 'Last look. Then we get to work.' },
];
const TOTAL_STEPS = STEPS.length;

/* ───────────────────────── UI helpers ───────────────────────── */

const cx = (...c: Array<string | false | undefined | null>) => c.filter(Boolean).join(' ');

const inputCls = 'fortis-input !text-base sm:!text-sm';

const TONES = {
  brand: { on: 'border-brand bg-brand/15 text-white', check: 'text-brand-light' },
  emerald: { on: 'border-emerald-500 bg-emerald-500/15 text-emerald-300', check: 'text-emerald-300' },
  indigo: { on: 'border-indigo-400 bg-indigo-500/15 text-white', check: 'text-indigo-300' },
};
const OFF = 'border-dark-border bg-dark-surface text-text-secondary hover:text-white hover:border-white/20';

const Choice: React.FC<{
  selected: boolean;
  onClick: () => void;
  label: string;
  desc?: string;
  tone?: keyof typeof TONES;
  check?: boolean;
  center?: boolean;
}> = ({ selected, onClick, label, desc, tone = 'brand', check, center }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={cx(
      'min-h-[46px] w-full px-3 py-2.5 rounded-xl border text-xs font-bold transition-all active:scale-[0.98] flex items-center gap-2',
      center ? 'justify-center text-center' : 'justify-between text-left',
      selected ? TONES[tone].on : OFF,
    )}
  >
    <span className="min-w-0">
      <span className="block leading-snug">{label}</span>
      {desc && <span className="block text-[10px] font-normal text-text-muted mt-0.5">{desc}</span>}
    </span>
    {check && selected && <Check className={cx('w-4 h-4 shrink-0', TONES[tone].check)} />}
  </button>
);

const Field: React.FC<{ label: React.ReactNode; hint?: string; htmlFor?: string; children: React.ReactNode }> = ({
  label,
  hint,
  htmlFor,
  children,
}) => (
  <div className="min-w-0">
    <label className="fortis-label" htmlFor={htmlFor}>
      {label}
    </label>
    {children}
    {hint && <p className="text-[11px] text-text-muted mt-1.5">{hint}</p>}
  </div>
);

const RangeField: React.FC<{
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  ticks?: string[];
  accent?: string;
  onChange: (v: number) => void;
}> = ({ label, display, value, min, max, step = 1, ticks, accent = 'accent-brand', onChange }) => (
  <div>
    <div className="flex items-baseline justify-between mb-1.5 gap-3">
      <span className="fortis-label mb-0">{label}</span>
      <span className="text-white font-black text-lg tabular-nums shrink-0">{display}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cx('w-full h-7 cursor-pointer', accent)}
    />
    {ticks && (
      <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    )}
  </div>
);

const TagInput: React.FC<{
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}> = ({ items, onChange, placeholder }) => {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (!v) return;
    if (!items.includes(v)) onChange([...items, v]);
    setText('');
  };
  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          enterKeyHint="done"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className={cx(inputCls, 'flex-1 min-w-0')}
        />
        <button type="button" onClick={add} className="fortis-btn-secondary text-xs px-4 shrink-0 min-h-[44px]">
          Add
        </button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {items.map((item) => (
            <button
              type="button"
              key={item}
              aria-label={`Remove ${item}`}
              onClick={() => onChange(items.filter((i) => i !== item))}
              className="fortis-pill inline-flex items-center gap-1.5 min-h-[32px]"
            >
              {item}
              <X className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const SectionTitle: React.FC<{ icon: React.ElementType; iconClass: string; title: string; children: React.ReactNode }> = ({
  icon: Icon,
  iconClass,
  title,
  children,
}) => (
  <div className="flex items-start gap-3">
    <div className="w-10 h-10 rounded-xl bg-dark-surface border border-dark-border flex items-center justify-center shrink-0">
      <Icon className={cx('w-5 h-5', iconClass)} />
    </div>
    <div className="min-w-0">
      <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">{title}</h2>
      <p className="text-xs sm:text-sm text-text-secondary mt-1 leading-relaxed">{children}</p>
    </div>
  </div>
);

const ReviewCard: React.FC<{
  title: string;
  titleClass: string;
  onEdit: () => void;
  rows: Array<[string, React.ReactNode]>;
  wide?: boolean;
}> = ({ title, titleClass, onEdit, rows, wide }) => (
  <section className={cx('rounded-2xl border border-dark-border bg-dark-surface/60 p-4', wide && 'sm:col-span-2')}>
    <div className="flex items-center justify-between mb-2.5">
      <h3 className={cx('text-sm font-bold', titleClass)}>{title}</h3>
      <button
        type="button"
        onClick={onEdit}
        className="text-xs font-semibold text-brand-light px-3 py-1.5 -mr-2 rounded-lg hover:bg-white/5"
      >
        Edit
      </button>
    </div>
    <dl className="space-y-1.5 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <dt className="text-text-muted shrink-0">{k}</dt>
          <dd className="text-white font-medium text-right min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  </section>
);

const pretty = (s?: string | null) => (s ? s.replace(/_/g, ' ').toLowerCase() : '');

const CoachTip: React.FC<{ tip: string; className?: string }> = ({ tip, className }) => (
  <div className={cx('flex items-center gap-3 rounded-2xl border border-brand/20 bg-brand/5 p-3', className)}>
    <img
      src={COACH_IMG}
      alt=""
      aria-hidden
      className="w-11 h-11 rounded-full object-cover object-[50%_16%] border border-brand/40 shrink-0"
    />
    <p className="text-xs text-text-secondary leading-snug">
      <span className="text-white font-bold">Coach Fortis: </span>
      {tip}
    </p>
  </div>
);

/* ───────────────────────── Page ───────────────────────── */

export const Onboarding: React.FC<OnboardingProps> = ({ isModal, onClose }) => {
  const navigate = useNavigate();
  const onboardingComplete = useAuthStore((s) => s.onboardingComplete);
  const userName = useAuthStore((s) => s.user?.name || 'Athlete');

  // If already onboarded and accessed directly as full page, redirect to dashboard
  React.useEffect(() => {
    if (!isModal && onboardingComplete) {
      navigate('/dashboard', { replace: true });
    }
  }, [onboardingComplete, isModal, navigate]);

  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Form State
  const [formData, setFormData] = useState<OnboardingData>({
    // Step 1: Personal Details
    age: 25,
    height_cm: 175,
    weight_kg: 70,
    gender: 'unspecified',
    regional_preference: 'Kerala',

    // Step 2: Fitness Goals
    primary_goal: 'GENERAL_FITNESS',
    experience_level: 'BEGINNER',
    workout_location: 'home',
    equipment_list: ['bodyweight'],
    days_per_week: 3,
    workout_duration_min: 45,

    // Step 3: Nutrition
    diet_type: 'non_vegetarian',
    allergies: [],
    preferred_cuisine: 'Kerala/South Indian',
    daily_budget_inr: 150,
    meals_per_day: 3,
    cooking_access: 'home',
    cooking_available: true,

    // Step 4: Lifestyle
    activity_level: 'MODERATELY_ACTIVE',
    typical_sleep_hours: 7.5,
    typical_sleep_quality: 7,
    typical_energy_level: 7,
    preferred_time: 'morning',

    // Step 5: Exercise Readiness
    injury_notes: '',
    exercises_to_avoid: [],
    preferred_exercise_types: ['Full Body', 'Cardio'],
    strength_benchmarks: {},

    // Step 6: Focus (empty array = Balanced)
    focus_areas: [] as string[],
  });

  const set = (patch: Partial<OnboardingData>) => setFormData((prev) => ({ ...prev, ...patch }));

  // Scroll to the top of the wizard (works for both the page and the scrolling modal)
  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Navigation handlers
  const handleNext = () => {
    setError(null);
    if (!validateCurrentStep()) return;
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((prev) => prev + 1);
      scrollTop();
    }
  };

  const handleBack = () => {
    setError(null);
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      scrollTop();
    }
  };

  const handleSkip = () => {
    setError(null);
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((prev) => prev + 1);
      scrollTop();
    }
  };

  const goToStep = (n: number) => {
    setError(null);
    setCurrentStep(n);
    scrollTop();
  };

  // Validation
  const validateCurrentStep = (): boolean => {
    if (currentStep === 1) {
      if (!formData.age || formData.age < 12 || formData.age > 120) {
        setError('Please enter a valid age between 12 and 120.');
        return false;
      }
      if (!formData.height_cm || formData.height_cm < 50 || formData.height_cm > 280) {
        setError('Height should be between 50 cm and 280 cm.');
        return false;
      }
      if (!formData.weight_kg || formData.weight_kg < 20 || formData.weight_kg > 350) {
        setError('Weight should be between 20 kg and 350 kg.');
        return false;
      }
      if (!formData.regional_preference?.trim()) {
        setError('Please enter your region or country.');
        return false;
      }
    } else if (currentStep === 2) {
      if (!formData.days_per_week || formData.days_per_week < 1 || formData.days_per_week > 7) {
        setError('Workout days per week must be between 1 and 7.');
        return false;
      }
      if (!formData.equipment_list || formData.equipment_list.length === 0) {
        setError('Please select at least one equipment option (Bodyweight is standard).');
        return false;
      }
    } else if (currentStep === 3) {
      if (formData.daily_budget_inr !== undefined && formData.daily_budget_inr < 30) {
        setError('Daily food budget must be at least ₹30.');
        return false;
      }
    }
    // Step 6 (Focus): an empty selection is valid and means "Balanced".
    return true;
  };

  // Submission
  const handleSubmit = () => {
    setError(null);
    setSubmitting(true);
    navigate('/plan-creating', { state: { onboardingData: formData } });
  };

  // Helper toggle for array fields
  const toggleArrayItem = (field: 'equipment_list' | 'preferred_exercise_types', item: string) => {
    const list = formData[field] || [];
    if (list.includes(item)) {
      if (list.length === 1 && field === 'equipment_list') return; // Keep at least one
      setFormData({ ...formData, [field]: list.filter((i) => i !== item) });
    } else {
      setFormData({ ...formData, [field]: [...list, item] });
    }
  };

  // Focus: toggling a group leaves "Balanced"; picking all groups is the same as Balanced
  const toggleFocus = (id: FocusId) => {
    const cur = (formData.focus_areas || []) as FocusId[];
    const next = cur.includes(id) ? cur.filter((i) => i !== id) : [...cur, id];
    set({ focus_areas: next.length === FOCUS_GROUPS.length ? [] : next });
  };

  const focusLabel = formData.focus_areas?.length
    ? FOCUS_GROUPS.filter((g) => formData.focus_areas!.includes(g.id)).map((g) => g.label).join(', ')
    : 'Balanced';

  const step = STEPS[currentStep - 1];
  const showSidebar = !isModal;
  const benchmarksText =
    Object.entries(formData.strength_benchmarks || {})
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([lift, value]) => `${lift.replace('_kg', '').replace('_', ' ')} ${value} kg`)
      .join(' · ') || 'Not provided';

  return (
    <div
      className={cx(
        'relative text-text-primary',
        isModal ? 'px-3 sm:px-6 pt-3 sm:pt-5' : 'min-h-dvh bg-dark-bg flex flex-col',
      )}
    >
      <style>{`
        @keyframes ob-step-in { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
        .ob-step { animation: ob-step-in .28s ease both; }
        @media (prefers-reduced-motion: reduce) { .ob-step { animation: none; } }
      `}</style>

      {/* Background ambience (page only). Its own overflow box keeps sticky actions working. */}
      {!isModal && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          <div className="absolute inset-0 bg-radial-orange" />
          <img
            src="/landing_imgs/footer.png"
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-[72%_50%] opacity-[0.12]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-dark-bg/60 via-dark-bg/80 to-dark-bg" />
        </div>
      )}

      <div
        className={cx(
          'relative z-10 w-full mx-auto flex-1 flex flex-col',
          isModal ? 'max-w-3xl' : 'max-w-6xl px-4 sm:px-6 pt-4 sm:pt-8',
        )}
      >
        {/* ── Header ── */}
        <header className="flex items-center justify-between gap-3 mb-4 sm:mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo className="h-9 sm:h-12 w-auto shrink-0" />
            <span className="hidden min-[380px]:block text-xs text-text-muted truncate">Personalised setup</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="fortis-pill whitespace-nowrap">
              Step {currentStep} of {TOTAL_STEPS}
            </span>
            {isModal && onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close setup"
                className="w-10 h-10 rounded-xl bg-dark-surface border border-dark-border text-text-muted hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        <div className={cx(showSidebar && 'lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10 lg:items-start')}>
          {/* ── Desktop sidebar: stepper + coach ── */}
          {showSidebar && (
            <aside className="hidden lg:flex flex-col gap-5 sticky top-8">
              <ol className="space-y-1.5">
                {STEPS.map((s) => {
                  const done = s.id < currentStep;
                  const active = s.id === currentStep;
                  const Icon = s.icon;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        disabled={!done}
                        onClick={() => goToStep(s.id)}
                        aria-current={active ? 'step' : undefined}
                        className={cx(
                          'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                          active ? 'bg-brand/15 border border-brand/40' : 'border border-transparent',
                          done && 'hover:bg-white/5 cursor-pointer',
                        )}
                      >
                        <span
                          className={cx(
                            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border',
                            done && 'bg-brand border-brand text-white',
                            active && 'border-brand text-brand-light',
                            !done && !active && 'border-dark-border text-text-muted',
                          )}
                        >
                          {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                        </span>
                        <span className={cx('text-sm font-semibold', active ? 'text-white' : done ? 'text-text-secondary' : 'text-text-muted')}>
                          {s.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              <div className="relative rounded-2xl overflow-hidden border border-brand/25 aspect-[4/5]">
                <img src={COACH_IMG} alt="Coach Fortis" className="absolute inset-0 w-full h-full object-cover object-[50%_10%]" />
                <div className="absolute inset-0 bg-gradient-to-t from-dark-bg via-dark-bg/60 to-transparent" />
                <p className="absolute left-4 right-4 bottom-4 text-sm text-white font-semibold leading-snug">
                  “{step.tip}”
                  <span className="block text-xs text-brand-light font-bold mt-1.5">Coach Fortis</span>
                </p>
              </div>
            </aside>
          )}

          {/* ── Main column ── */}
          <div className="min-w-0 w-full max-w-3xl mx-auto lg:mx-0 flex flex-col flex-1">
            <div ref={topRef} className="scroll-mt-4" />

            {/* Progress (hidden when the sidebar already shows it) */}
            <div className={cx('mb-4', showSidebar && 'lg:hidden')}>
              <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL_STEPS} aria-valuenow={currentStep}>
                {STEPS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={s.id >= currentStep}
                    onClick={() => goToStep(s.id)}
                    aria-label={`Go to ${s.title}`}
                    className="flex-1 py-2 group"
                  >
                    <span
                      className={cx(
                        'block h-1.5 rounded-full transition-colors',
                        s.id < currentStep && 'bg-brand/70 group-hover:bg-brand',
                        s.id === currentStep && 'bg-brand',
                        s.id > currentStep && 'bg-dark-border',
                      )}
                    />
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-text-muted">{step.title}</p>
            </div>

            <CoachTip tip={step.tip} className={cx('mb-4', showSidebar && 'lg:hidden')} />

            {/* Wizard card */}
            <div className="fortis-card rounded-3xl p-5 sm:p-8">
              <div key={currentStep} className="ob-step">
                {/* ───── STEP 1: PERSONAL DETAILS ───── */}
                {currentStep === 1 && (
                  <div className="space-y-6">
                    <SectionTitle icon={User} iconClass="text-brand-light" title="Personal details">
                      Welcome, <span className="text-white font-semibold">{userName}</span>. Tell us a bit about yourself so Fortis can
                      calibrate your body metrics and recommendations.
                    </SectionTitle>

                    <div className="grid grid-cols-2 gap-4">
                      <Field label={<>Age <span className="text-brand">*</span></>} htmlFor="ob-age">
                        <input
                          id="ob-age"
                          type="number"
                          inputMode="numeric"
                          min={12}
                          max={120}
                          value={formData.age || ''}
                          onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value) || 0 })}
                          className={inputCls}
                          placeholder="e.g. 25"
                          required
                        />
                      </Field>
                      <Field label={<>Height (cm) <span className="text-brand">*</span></>} htmlFor="ob-height">
                        <input
                          id="ob-height"
                          type="number"
                          inputMode="decimal"
                          min={50}
                          max={280}
                          value={formData.height_cm || ''}
                          onChange={(e) => setFormData({ ...formData, height_cm: parseFloat(e.target.value) || undefined })}
                          className={inputCls}
                          placeholder="e.g. 175"
                          required
                        />
                      </Field>
                      <Field label={<>Weight (kg) <span className="text-brand">*</span></>} htmlFor="ob-weight">
                        <input
                          id="ob-weight"
                          type="number"
                          inputMode="decimal"
                          min={20}
                          max={350}
                          step="0.1"
                          value={formData.weight_kg || ''}
                          onChange={(e) => setFormData({ ...formData, weight_kg: parseFloat(e.target.value) || undefined })}
                          className={inputCls}
                          placeholder="e.g. 70.5"
                          required
                        />
                      </Field>
                      <Field label={<>Region / country <span className="text-brand">*</span></>} htmlFor="regional-preference">
                        <input
                          id="regional-preference"
                          type="text"
                          value={formData.regional_preference || ''}
                          onChange={(e) => setFormData({ ...formData, regional_preference: e.target.value })}
                          className={inputCls}
                          placeholder="e.g. Kerala, India"
                          autoComplete="country-name"
                          required
                        />
                      </Field>
                    </div>
                    <p className="text-[11px] text-text-muted -mt-3">
                      Region is used to tailor local food suggestions and nutrition recommendations.
                    </p>

                    <Field label="Gender (optional)">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { id: 'male', label: 'Male' },
                          { id: 'female', label: 'Female' },
                          { id: 'other', label: 'Non-binary / other' },
                          { id: 'unspecified', label: 'Prefer not to say' },
                        ].map((g) => (
                          <Choice
                            key={g.id}
                            center
                            label={g.label}
                            selected={(formData.gender || 'unspecified') === g.id}
                            onClick={() => set({ gender: g.id })}
                          />
                        ))}
                      </div>
                    </Field>
                  </div>
                )}

                {/* ───── STEP 2: FITNESS GOALS ───── */}
                {currentStep === 2 && (
                  <div className="space-y-6">
                    <SectionTitle icon={Target} iconClass="text-brand-light" title="Fitness goals & schedule">
                      Choose your focus, training environment, and how much time you can commit.
                    </SectionTitle>

                    <Field label="Primary goal">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {[
                          { key: 'GENERAL_FITNESS', label: 'General fitness', desc: 'Health & balance' },
                          { key: 'STRENGTH', label: 'Strength', desc: 'Power & core lifts' },
                          { key: 'MUSCLE', label: 'Hypertrophy', desc: 'Muscle building' },
                          { key: 'ENDURANCE', label: 'Endurance', desc: 'Stamina & cardio' },
                        ].map((g) => (
                          <Choice
                            key={g.key}
                            label={g.label}
                            desc={g.desc}
                            selected={formData.primary_goal === g.key}
                            onClick={() => set({ primary_goal: g.key })}
                          />
                        ))}
                      </div>
                    </Field>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-4">
                      <Field label="Experience level">
                        <div className="grid grid-cols-3 gap-2">
                          {['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].map((exp) => (
                            <Choice
                              key={exp}
                              center
                              label={exp.charAt(0) + exp.slice(1).toLowerCase()}
                              selected={formData.experience_level === exp}
                              onClick={() => set({ experience_level: exp })}
                            />
                          ))}
                        </div>
                      </Field>
                      <Field label="Workout location">
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'home', label: 'Home' },
                            { id: 'gym', label: 'Gym' },
                            { id: 'outdoors', label: 'Outdoors' },
                          ].map((loc) => (
                            <Choice
                              key={loc.id}
                              center
                              label={loc.label}
                              selected={formData.workout_location === loc.id}
                              onClick={() => set({ workout_location: loc.id })}
                            />
                          ))}
                        </div>
                      </Field>
                    </div>

                    <Field label="Available equipment (select all that apply)">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                          { id: 'bodyweight', label: 'Bodyweight' },
                          { id: 'dumbbells', label: 'Dumbbells' },
                          { id: 'resistance_bands', label: 'Resistance bands' },
                          { id: 'barbell', label: 'Barbell & plates' },
                          { id: 'pull_up_bar', label: 'Pull-up bar' },
                          { id: 'full_gym', label: 'Full gym machines' },
                        ].map((eq) => (
                          <Choice
                            key={eq.id}
                            check
                            label={eq.label}
                            selected={!!formData.equipment_list?.includes(eq.id)}
                            onClick={() => toggleArrayItem('equipment_list', eq.id)}
                          />
                        ))}
                      </div>
                    </Field>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-4">
                      <RangeField
                        label="Workout days per week"
                        display={`${formData.days_per_week || 3} days`}
                        min={1}
                        max={7}
                        value={formData.days_per_week || 3}
                        ticks={['1', '3', '5', '7']}
                        onChange={(v) => set({ days_per_week: v || 3 })}
                      />
                      <Field label="Session duration">
                        <div className="grid grid-cols-4 gap-2">
                          {[15, 30, 45, 60].map((dur) => (
                            <Choice
                              key={dur}
                              center
                              label={`${dur}m`}
                              selected={formData.workout_duration_min === dur}
                              onClick={() => set({ workout_duration_min: dur })}
                            />
                          ))}
                        </div>
                      </Field>
                    </div>
                  </div>
                )}

                {/* ───── STEP 3: NUTRITION ───── */}
                {currentStep === 3 && (
                  <div className="space-y-6">
                    <SectionTitle icon={Utensils} iconClass="text-emerald-400" title="Nutrition preferences">
                      Fortis builds practical Indian and regional meal plans around your diet pattern and budget.
                    </SectionTitle>

                    <Field label="Dietary pattern">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {[
                          { id: 'vegetarian', label: 'Vegetarian' },
                          { id: 'eggetarian', label: 'Eggetarian' },
                          { id: 'non_vegetarian', label: 'Non-vegetarian' },
                          { id: 'vegan', label: 'Vegan' },
                        ].map((d) => (
                          <Choice
                            key={d.id}
                            center
                            tone="emerald"
                            label={d.label}
                            selected={formData.diet_type === d.id}
                            onClick={() => set({ diet_type: d.id })}
                          />
                        ))}
                      </div>
                    </Field>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Preferred cuisine" htmlFor="ob-cuisine">
                        <select
                          id="ob-cuisine"
                          value={formData.preferred_cuisine || 'Kerala/South Indian'}
                          onChange={(e) => set({ preferred_cuisine: e.target.value })}
                          className={inputCls}
                        >
                          <option value="Kerala/South Indian">Kerala / South Indian</option>
                          <option value="North Indian">North Indian</option>
                          <option value="Continental/High-Protein">Continental / High-Protein</option>
                          <option value="Flexible Mixed">Flexible Mixed</option>
                        </select>
                      </Field>
                      <Field
                        label="Daily food budget (₹ INR)"
                        htmlFor="ob-budget"
                        hint="Recommended: ₹120 – ₹250 per day for balanced whole foods."
                      >
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-text-muted">₹</span>
                          <input
                            id="ob-budget"
                            type="number"
                            inputMode="numeric"
                            min={30}
                            step="10"
                            value={formData.daily_budget_inr || ''}
                            onChange={(e) => set({ daily_budget_inr: parseFloat(e.target.value) || 0 })}
                            className={cx(inputCls, 'pl-8')}
                            placeholder="e.g. 150"
                          />
                        </div>
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-4">
                      <Field label="Meals per day">
                        <div className="grid grid-cols-4 gap-2">
                          {[2, 3, 4, 5].map((m) => (
                            <Choice
                              key={m}
                              center
                              label={`${m}`}
                              selected={formData.meals_per_day === m}
                              onClick={() => set({ meals_per_day: m })}
                            />
                          ))}
                        </div>
                      </Field>
                      <Field label="Cooking access">
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'home', label: 'Home kitchen' },
                            { id: 'hostel', label: 'Hostel / mess' },
                            { id: 'mixed', label: 'Mixed / dining out' },
                          ].map((c) => (
                            <Choice
                              key={c.id}
                              center
                              label={c.label}
                              selected={formData.cooking_access === c.id}
                              onClick={() => set({ cooking_access: c.id })}
                            />
                          ))}
                        </div>
                      </Field>
                    </div>

                    <Field label="Food allergies or avoidances (optional)">
                      <TagInput
                        items={formData.allergies || []}
                        onChange={(allergies) => set({ allergies })}
                        placeholder="e.g. Peanuts, dairy, seafood"
                      />
                    </Field>
                  </div>
                )}

                {/* ───── STEP 4: LIFESTYLE ───── */}
                {currentStep === 4 && (
                  <div className="space-y-6">
                    <SectionTitle icon={Moon} iconClass="text-indigo-400" title="Lifestyle & recovery">
                      Your baseline sleep and energy set your workout volume and Fortis Pulse readiness.
                    </SectionTitle>

                    <RangeField
                      label="Average sleep"
                      display={`${formData.typical_sleep_hours || 7.5} h`}
                      min={4}
                      max={12}
                      step={0.5}
                      accent="accent-indigo-400"
                      value={formData.typical_sleep_hours || 7.5}
                      ticks={['4 h', '7 h', '9 h', '12 h']}
                      onChange={(v) => set({ typical_sleep_hours: v || 7.5 })}
                    />

                    <Field label="Daily activity level">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {[
                          { id: 'SEDENTARY', label: 'Sedentary', desc: 'Desk job, light walking' },
                          { id: 'MODERATELY_ACTIVE', label: 'Moderately active', desc: 'On feet, moderate steps' },
                          { id: 'VERY_ACTIVE', label: 'Very active', desc: 'Physical work, sports' },
                        ].map((act) => (
                          <Choice
                            key={act.id}
                            tone="indigo"
                            label={act.label}
                            desc={act.desc}
                            selected={formData.activity_level === act.id}
                            onClick={() => set({ activity_level: act.id })}
                          />
                        ))}
                      </div>
                    </Field>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-4">
                      <Field label="Preferred workout time">
                        <div className="grid grid-cols-3 gap-2">
                          {['morning', 'afternoon', 'evening'].map((time) => (
                            <Choice
                              key={time}
                              center
                              label={time.charAt(0).toUpperCase() + time.slice(1)}
                              selected={formData.preferred_time === time}
                              onClick={() => set({ preferred_time: time })}
                            />
                          ))}
                        </div>
                      </Field>
                      <RangeField
                        label="Baseline energy"
                        display={`${formData.typical_energy_level || 7} / 10`}
                        min={1}
                        max={10}
                        value={formData.typical_energy_level || 7}
                        ticks={['Low', 'Moderate', 'High']}
                        onChange={(v) => set({ typical_energy_level: v || 7 })}
                      />
                    </div>

                    {/* Optional stress & soreness */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-4 pt-5 border-t border-dark-border/60">
                      {(
                        [
                          { key: 'typical_stress_level', label: 'Typical stress level', add: '+ Add typical stress level (optional)' },
                          { key: 'typical_soreness_level', label: 'Typical muscle soreness', add: '+ Add typical soreness level (optional)' },
                        ] as const
                      ).map((opt) => {
                        const val = formData[opt.key];
                        return (
                          <div key={opt.key}>
                            {val === undefined ? (
                              <button
                                type="button"
                                onClick={() => set({ [opt.key]: 5 } as Partial<OnboardingData>)}
                                className="w-full min-h-[44px] rounded-xl border border-dashed border-dark-border text-xs font-semibold text-text-secondary hover:text-white hover:border-brand/40 transition-colors px-3"
                              >
                                {opt.add}
                              </button>
                            ) : (
                              <div>
                                <RangeField
                                  label={opt.label}
                                  display={`${val} / 10`}
                                  min={1}
                                  max={10}
                                  accent="accent-warning"
                                  value={val}
                                  onChange={(v) => set({ [opt.key]: v } as Partial<OnboardingData>)}
                                />
                                <button
                                  type="button"
                                  onClick={() => set({ [opt.key]: undefined } as Partial<OnboardingData>)}
                                  className="text-[11px] text-text-muted hover:text-white mt-1 py-1"
                                >
                                  Clear
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ───── STEP 5: EXERCISE READINESS ───── */}
                {currentStep === 5 && (
                  <div className="space-y-6">
                    <SectionTitle icon={ShieldCheck} iconClass="text-brand-light" title="Exercise readiness & safety">
                      Help Fortis safeguard your training. Everything in this step is optional.
                    </SectionTitle>

                    <Field label="Injuries or movement limitations (optional)" htmlFor="ob-injury">
                      <textarea
                        id="ob-injury"
                        rows={3}
                        value={formData.injury_notes || ''}
                        onChange={(e) => set({ injury_notes: e.target.value })}
                        placeholder="e.g. Mild lower back sensitivity, recovering from a right wrist sprain…"
                        className={cx(inputCls, 'resize-none')}
                      />
                    </Field>

                    <Field label="Exercises or movements to avoid (optional)">
                      <TagInput
                        items={formData.exercises_to_avoid || []}
                        onChange={(exercises_to_avoid) => set({ exercises_to_avoid })}
                        placeholder="e.g. Overhead press, deep squats"
                      />
                    </Field>

                    <Field label="Preferred exercise styles">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {['Full Body', 'Strength Splits', 'Cardio / HIIT', 'Mobility & Core'].map((style) => (
                          <Choice
                            key={style}
                            check
                            label={style}
                            selected={!!formData.preferred_exercise_types?.includes(style)}
                            onClick={() => toggleArrayItem('preferred_exercise_types', style)}
                          />
                        ))}
                      </div>
                    </Field>

                    <Field
                      label="Strength benchmarks (optional, kg)"
                      hint="Add recent working weights if you know them. Leave blank if you are unsure."
                    >
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { key: 'squat_kg', label: 'Squat' },
                          { key: 'bench_kg', label: 'Bench' },
                          { key: 'deadlift_kg', label: 'Deadlift' },
                        ].map((lift) => (
                          <div key={lift.key}>
                            <label className="text-[11px] text-text-muted block mb-1" htmlFor={`benchmark-${lift.key}`}>
                              {lift.label}
                            </label>
                            <input
                              id={`benchmark-${lift.key}`}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="0.5"
                              value={formData.strength_benchmarks?.[lift.key] ?? ''}
                              onChange={(e) => {
                                const benchmarks = { ...(formData.strength_benchmarks || {}) };
                                if (e.target.value === '') {
                                  delete benchmarks[lift.key];
                                } else {
                                  benchmarks[lift.key] = Number(e.target.value);
                                }
                                set({ strength_benchmarks: benchmarks });
                              }}
                              className={inputCls}
                              placeholder="kg"
                            />
                          </div>
                        ))}
                      </div>
                    </Field>
                  </div>
                )}

                {/* ───── STEP 6: FOCUS ───── */}
                {currentStep === 6 && (
                  <div className="space-y-6">
                    <SectionTitle icon={Crosshair} iconClass="text-brand-light" title="Focus">
                      Tap one or more groups on the silhouette to give them more emphasis. Your whole body will still be trained.
                    </SectionTitle>

                    <div>
                      <h3 className="text-center text-base font-bold text-white mb-3">Muscles to prioritize?</h3>
                      <BodyMap value={(formData.focus_areas || []) as FocusId[]} onToggle={toggleFocus} />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-label="Muscle groups to prioritize">
                      <Choice
                        center
                        label="Balanced"
                        desc="Recommended"
                        selected={!formData.focus_areas?.length}
                        onClick={() => set({ focus_areas: [] })}
                      />
                      {FOCUS_GROUPS.map((g) => (
                        <Choice
                          key={g.id}
                          center
                          label={g.label}
                          selected={!!formData.focus_areas?.includes(g.id)}
                          onClick={() => toggleFocus(g.id)}
                        />
                      ))}
                    </div>

                    {!formData.focus_areas?.length && (
                      <p className="text-center text-[11px] text-text-muted -mt-2">
                        All groups together make a balanced program.
                      </p>
                    )}
                  </div>
                )}

                {/* ───── STEP 7: REVIEW ───── */}
                {currentStep === 7 && (
                  <div className="space-y-6">
                    <SectionTitle icon={Sparkles} iconClass="text-brand" title="Review & generate plans">
                      Confirm your details. Fortis will generate your personalised starter workout plan and nutrition blueprint.
                    </SectionTitle>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <ReviewCard
                        title="Personal details"
                        titleClass="text-brand-light"
                        onEdit={() => goToStep(1)}
                        rows={[
                          ['Age', `${formData.age} yrs`],
                          ['Gender', formData.gender === 'unspecified' ? 'Prefer not to say' : formData.gender || 'Prefer not to say'],
                          ['Height / weight', `${formData.height_cm} cm · ${formData.weight_kg} kg`],
                          ['Region', formData.regional_preference],
                        ]}
                      />
                      <ReviewCard
                        title="Fitness & training"
                        titleClass="text-brand-light"
                        onEdit={() => goToStep(2)}
                        rows={[
                          ['Goal', pretty(formData.primary_goal)],
                          ['Experience', pretty(formData.experience_level)],
                          ['Location', formData.workout_location],
                          ['Equipment', formData.equipment_list?.join(', ') || 'None selected'],
                          ['Schedule', `${formData.days_per_week} days/week · ${formData.workout_duration_min} min`],
                        ]}
                      />
                      <ReviewCard
                        title="Nutrition"
                        titleClass="text-emerald-400"
                        onEdit={() => goToStep(3)}
                        rows={[
                          ['Diet', pretty(formData.diet_type)],
                          ['Cuisine', formData.preferred_cuisine],
                          ['Allergies', formData.allergies?.join(', ') || 'None'],
                          ['Budget', `₹${formData.daily_budget_inr}/day · ${formData.meals_per_day} meals`],
                          ['Cooking', formData.cooking_access],
                        ]}
                      />
                      <ReviewCard
                        title="Lifestyle"
                        titleClass="text-indigo-400"
                        onEdit={() => goToStep(4)}
                        rows={[
                          ['Sleep', `${formData.typical_sleep_hours} hours/night`],
                          ['Activity', pretty(formData.activity_level)],
                          ['Energy', `${formData.typical_energy_level}/10`],
                          ['Workout time', formData.preferred_time],
                          ['Stress', formData.typical_stress_level ? `${formData.typical_stress_level}/10` : 'Not provided'],
                          ['Soreness', formData.typical_soreness_level ? `${formData.typical_soreness_level}/10` : 'Not provided'],
                        ]}
                      />
                      <ReviewCard
                        wide
                        title="Exercise readiness"
                        titleClass="text-brand-light"
                        onEdit={() => goToStep(5)}
                        rows={[
                          ['Injury notes', formData.injury_notes?.trim() || 'None provided'],
                          ['Avoiding', formData.exercises_to_avoid?.join(', ') || 'None specified'],
                          ['Preferred styles', formData.preferred_exercise_types?.join(', ') || 'No preference'],
                          ['Benchmarks', benchmarksText],
                        ]}
                      />
                      <ReviewCard
                        wide
                        title="Training focus"
                        titleClass="text-brand-light"
                        onEdit={() => goToStep(6)}
                        rows={[['Priority', focusLabel]]}
                      />
                    </div>

                    <div className="bg-brand/10 border border-brand/20 rounded-2xl p-4 text-xs text-text-secondary leading-relaxed flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-brand-light shrink-0 mt-0.5" />
                      <span>
                        Your starter plans are generated from your saved profile without fabricating past history or scores. Log real
                        workouts and recovery to start building your actual Fortis Pulse.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Sticky action bar (errors appear here so they are never off-screen) ── */}
            <div className="sticky bottom-0 z-20 -mx-4 sm:mx-0 px-4 sm:px-0 mt-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-dark-bg via-dark-bg/95 to-transparent">
              {error && (
                <div
                  role="alert"
                  className="mb-3 flex items-start gap-2.5 bg-danger/10 border border-danger/30 rounded-xl p-3 text-xs text-danger backdrop-blur"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="min-w-0 break-words">{error}</span>
                </div>
              )}

              <div className="flex items-center gap-2.5">
                {currentStep > 1 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={submitting}
                    aria-label="Back"
                    className="fortis-btn-secondary flex items-center justify-center gap-1.5 text-xs min-h-[48px] px-4 shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="hidden min-[380px]:inline">Back</span>
                  </button>
                )}

                {currentStep === 5 && (
                  <button
                    type="button"
                    onClick={handleSkip}
                    disabled={submitting}
                    className="fortis-btn-ghost text-xs min-h-[48px] px-3 shrink-0"
                  >
                    Skip
                  </button>
                )}

                {currentStep < TOTAL_STEPS ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="fortis-btn-primary flex-1 flex items-center justify-center gap-2 text-sm font-bold min-h-[48px] px-5"
                  >
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="fortis-btn-primary flex-1 flex items-center justify-center gap-2 text-sm font-bold min-h-[48px] px-5 shadow-glow"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating your plan…
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Create my fitness plan
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer branding */}
        {!isModal && (
          <p className="text-center text-xs text-text-muted py-5">Fortis AI Adaptive Fitness System · Secure & private</p>
        )}
      </div>
    </div>
  );
};

export default Onboarding;