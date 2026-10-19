import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  Target,
  Flame,
  CalendarDays,
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Zap,
  Clock3,
  Dumbbell,
  CheckCircle2,
  LockKeyhole,
  RefreshCw,
  ArrowRight,
  X,
  CalendarCheck,
  Medal,
} from 'lucide-react';
import api, { getCached } from '../../services/api';
import SplashScreen from '../../components/SplashScreen';

type CalendarRecord = {
  date?: string;
  completed_at?: string;
  created_at?: string;
  timestamp?: string;
  status?: string;
  completed?: boolean;
  planned?: boolean;
  workout_name?: string;
  title?: string;
  session_id?: string;
};

type ProgressData = {
  summary?: {
    consistency_pct?: number | null;
    workouts_completed?: number | null;
    avg_rpe?: number | null;
    current_pulse?: number | null;
    weekly_goal?: number | null;
    current_streak?: number | null;
  };
  forecast?: {
    trend_label?: string;
    forecast_7d?: number | string | null;
    forecast_14d?: number | string | null;
    disclaimer?: string;
  };
  fitness_state_history?: Array<{
    date?: string;
    fortis_pulse?: number | null;
    fatigue_risk?: number | null;
  }>;
  workout_calendar?: CalendarRecord[];
  calendar?: CalendarRecord[];
  workout_history?: CalendarRecord[];
  active_plan?: {
    name?: string;
    title?: string;
  } | null;
};

type DayStatus = 'completed' | 'planned' | 'missed' | 'unknown';

type EquipmentOption = {
  id: string;
  label: string;
};

const DURATIONS = [10, 15, 20, 30, 45];

const EQUIPMENT_OPTIONS: EquipmentOption[] = [
  { id: 'bodyweight', label: 'Bodyweight' },
  { id: 'dumbbells', label: 'Dumbbells' },
  { id: 'bands', label: 'Resistance bands' },
  { id: 'gym', label: 'Full gym' },
];

const XP_PER_SESSION = 50;
const XP_PER_LEVEL = 250;

const panelClass =
  'rounded-2xl border border-dark-border bg-dark-card shadow-card';

const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

function dateKey(value?: string): string | null {
  if (!value) return null;

  // Preserve date-only values without applying a timezone conversion.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getRecordDate(record: CalendarRecord): string | null {
  return dateKey(
    record.date ??
      record.completed_at ??
      record.timestamp ??
      record.created_at
  );
}

function getRecordStatus(record: CalendarRecord): DayStatus {
  const status = record.status?.toLowerCase();

  if (
    record.completed === true ||
    ['completed', 'done', 'finished'].includes(status ?? '')
  ) {
    return 'completed';
  }

  if (
    record.planned === true ||
    ['planned', 'scheduled', 'upcoming'].includes(status ?? '')
  ) {
    return 'planned';
  }

  if (['missed', 'skipped'].includes(status ?? '')) {
    return 'missed';
  }

  return 'unknown';
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMonth(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function getActivityRecords(data: ProgressData | null): CalendarRecord[] {
  if (!data) return [];

  // Prefer an explicit workout calendar. Do not interpret fitness-state
  // checkpoints as completed workouts.
  return (
    data.workout_calendar ??
    data.calendar ??
    data.workout_history ??
    []
  );
}

function isSameDay(a: Date, b: Date): boolean {
  return localDateKey(a) === localDateKey(b);
}

function calculateStreak(completedDates: Set<string>): number {
  if (completedDates.size === 0) return 0;

  const today = new Date();
  const start = new Date(today);

  // A streak can continue from yesterday if the user has not trained today.
  if (!completedDates.has(localDateKey(start))) {
    start.setDate(start.getDate() - 1);
  }

  let streak = 0;
  const cursor = new Date(start);

  while (completedDates.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export const ProgressPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [workoutReward, setWorkoutReward] = useState(false);

  useEffect(() => {
    const navigationState = location.state as { workoutCompleted?: boolean } | null;
    if (!navigationState?.workoutCompleted) return;

    setWorkoutReward(true);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.key, location.pathname, location.search, location.state, navigate]);

  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Time & Equipment Switch state.
  const [availableMinutes, setAvailableMinutes] = useState(20);
  const [equipment, setEquipment] = useState<string[]>(['bodyweight']);
  const [adaptationPrepared, setAdaptationPrepared] = useState(false);
  const [adaptationDraft, setAdaptationDraft] = useState<any>(null);
  const [adaptationWorkoutId, setAdaptationWorkoutId] = useState<number | null>(null);
  const [adaptationBusy, setAdaptationBusy] = useState(false);
  const [adaptationError, setAdaptationError] = useState<string | null>(null);
  const [adaptationSaved, setAdaptationSaved] = useState(false);

  const loadProgress = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setLoadError(false);

    try {
      const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      const response = await getCached(`/api/progress?month=${monthKey}`);
      setData(response.data ?? null);
    } catch (error) {
      console.error('Failed to load progress data:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month]);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  const records = useMemo(() => getActivityRecords(data), [data]);

  const dailyRecords = useMemo(() => {
    const result = new Map<string, CalendarRecord[]>();

    records.forEach((record) => {
      const key = getRecordDate(record);
      if (!key) return;

      const existing = result.get(key) ?? [];
      existing.push(record);
      result.set(key, existing);
    });

    return result;
  }, [records]);

  const dailyStatuses = useMemo(() => {
    const result = new Map<string, DayStatus>();

    dailyRecords.forEach((dayRecords, key) => {
      const statuses = dayRecords.map(getRecordStatus);

      // Completion takes precedence when a day contains multiple records.
      if (statuses.includes('completed')) {
        result.set(key, 'completed');
      } else if (statuses.includes('planned')) {
        result.set(key, 'planned');
      } else if (statuses.includes('missed')) {
        result.set(key, 'missed');
      } else {
        result.set(key, 'unknown');
      }
    });

    return result;
  }, [dailyRecords]);

  const completedDates = useMemo(() => {
    return new Set(
      [...dailyStatuses.entries()]
        .filter(([, status]) => status === 'completed')
        .map(([key]) => key)
    );
  }, [dailyStatuses]);

  const completedSessionCount =
    data?.summary?.workouts_completed ??
    [...completedDates].length;

  const xp = Math.max(0, completedSessionCount ?? 0) * XP_PER_SESSION;
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const levelProgress = xp % XP_PER_LEVEL;
  const currentStreak = data?.summary?.current_streak ?? calculateStreak(completedDates);

  const achievements = useMemo(
    () => [
      {
        name: 'First Rep',
        description: 'Complete your first session',
        requirement: 1,
        icon: Zap,
      },
      {
        name: 'Momentum Builder',
        description: 'Complete 5 sessions',
        requirement: 5,
        icon: Flame,
      },
      {
        name: 'Training Regular',
        description: 'Complete 10 sessions',
        requirement: 10,
        icon: Target,
      },
      {
        name: 'Fortis Dedicated',
        description: 'Complete 25 sessions',
        requirement: 25,
        icon: Trophy,
      },
    ],
    []
  );

  const monthDays = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const numberOfDays = new Date(year, monthIndex + 1, 0).getDate();

    // Monday-first calendar.
    const leadingDays = (firstDay.getDay() + 6) % 7;

    return [
      ...Array.from({ length: leadingDays }, () => null),
      ...Array.from({ length: numberOfDays }, (_, index) => index + 1),
    ];
  }, [month]);

  const selectedDayRecords = selectedDate
    ? dailyRecords.get(selectedDate) ?? []
    : [];

  const selectedDayStatus = selectedDate
    ? dailyStatuses.get(selectedDate) ?? 'unknown'
    : 'unknown';

  const toggleEquipment = (id: string) => {
    setAdaptationPrepared(false);

    setEquipment((current) => {
      if (id === 'bodyweight') {
        return ['bodyweight'];
      }

      const withoutBodyweight = current.filter(
        (item) => item !== 'bodyweight'
      );

      if (current.includes(id)) {
        const next = withoutBodyweight.filter((item) => item !== id);
        return next.length > 0 ? next : ['bodyweight'];
      }

      return [...withoutBodyweight, id];
    });
  };

  const prepareAdaptationRequest = () => {
    void (async () => {
      setAdaptationBusy(true); setAdaptationError(null); setAdaptationSaved(false); setAdaptationDraft(null);
      try {
        const today = await api.get('/api/workouts/today');
        const workoutId = Number(today.data?.id);
        if (!Number.isInteger(workoutId) || !today.data?.exercises?.length) throw new Error('There is no planned workout available to adapt today.');
        setAdaptationWorkoutId(workoutId);
        const equipmentIds = equipment.map((id) => id === 'bands' ? 'resistance_bands' : id === 'gym' ? 'full_gym' : id);
        const response = await api.post(`/api/workouts/${workoutId}/adaptation-draft`, { available_minutes: availableMinutes, equipment_ids: equipmentIds });
        setAdaptationDraft(response.data); setAdaptationPrepared(true);
      } catch (error: any) {
        setAdaptationError(error?.response?.data?.detail || error?.message || 'Could not generate an adaptation. Your saved plan is unchanged.');
      } finally { setAdaptationBusy(false); }
    })();
  };

  const acceptAdaptation = async () => {
    if (!adaptationWorkoutId) return;
    setAdaptationBusy(true); setAdaptationError(null);
    try {
      await api.post(`/api/workouts/${adaptationWorkoutId}/adapted-session`, { adaptation_id: Number(adaptationDraft?.recommendation_id) });
      setAdaptationSaved(true); setAdaptationDraft(null); await loadProgress(true);
    } catch (error: any) {
      setAdaptationError(error?.response?.data?.detail || 'Could not save the adapted session. Your original workout remains unchanged.');
    } finally { setAdaptationBusy(false); }
  };

  if (loading && !data && !loadError) {
    return <SplashScreen isLoader message="Loading your progress…" />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-brand-light">
            <Sparkles className="h-4 w-4" />
            Your training journey
          </div>

          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
            Progress & Achievements
          </h1>

          <p className="mt-1 text-sm text-text-secondary">
            Every session counts. Build consistency at your own pace.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadProgress(true)}
          disabled={loading || refreshing}
          className={`${buttonClass} border border-dark-border bg-dark-surface text-white hover:border-brand-light/60`}
        >
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
          />
          Refresh
        </button>
      </div>

      {workoutReward && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200"
        >
          <span>
            Workout complete! You earned <strong>+{XP_PER_SESSION} XP</strong>.
            Your level and total XP are updated below.
          </span>
          <button
            type="button"
            onClick={() => setWorkoutReward(false)}
            className="font-semibold text-emerald-100 underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>
            Progress could not be loaded. Your saved activity has not been
            changed.
          </span>
          <button
            type="button"
            onClick={() => void loadProgress()}
            className="font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      {loading && data && (
        <p className="text-sm text-text-muted" aria-live="polite">
          Refreshing progress…
        </p>
      )}

      {/* XP / Gamification hero */}
      <section
        className={`${panelClass} relative overflow-hidden p-5 sm:p-7`}
      >
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-brand/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-red-900/20 blur-3xl" />

        <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-brand-light">
              <Trophy className="h-4 w-4" />
              Fortis Training XP
            </div>

            <h2 className="mt-4 text-2xl font-black text-white sm:text-3xl">
              Level {level}
              <span className="ml-2 text-brand-light">
                {level === 1
                  ? 'Rookie'
                  : level < 3
                    ? 'Builder'
                    : level < 6
                      ? 'Warrior'
                      : 'Elite'}
              </span>
            </h2>

            <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
              Your progress is built from the sessions you record—not from
              perfect streaks. Keep showing up in a way that works for you.
            </p>

            <div className="mt-5 max-w-lg">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-text-secondary">
                  Progress to Level {level + 1}
                </span>
                <span className="font-bold text-white">
                  {levelProgress} / {XP_PER_LEVEL} XP
                </span>
              </div>

              <div
                className="h-3 overflow-hidden rounded-full bg-dark-surface"
                role="progressbar"
                aria-label="Progress to next level"
                aria-valuemin={0}
                aria-valuemax={XP_PER_LEVEL}
                aria-valuenow={levelProgress}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-red-800 via-brand to-orange-400 transition-all duration-500"
                  style={{
                    width: `${(levelProgress / XP_PER_LEVEL) * 100}%`,
                  }}
                />
              </div>

              <p className="mt-2 text-xs text-text-muted">
                {XP_PER_SESSION} XP per recorded completed session.
                Cosmetic levels only; they do not measure fitness or health.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:w-64 md:grid-cols-1">
            <div className="rounded-xl border border-dark-border bg-dark-surface/90 p-4">
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <Zap className="h-4 w-4 text-brand-light" />
                Total XP
              </div>
              <p className="mt-2 text-3xl font-extrabold text-white">
                {xp.toLocaleString()}
              </p>
            </div>

            <div className="rounded-xl border border-dark-border bg-dark-surface/90 p-4">
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <Flame className="h-4 w-4 text-orange-400" />
                Current streak
              </div>
              <p className="mt-2 text-3xl font-extrabold text-white">
                {completedDates.size > 0 ? currentStreak : '—'}
                {completedDates.size > 0 && (
                  <span className="ml-2 text-sm font-medium text-text-muted">
                    days
                  </span>
                )}
              </p>
              {completedDates.size === 0 && (
                <p className="mt-1 text-xs text-text-muted">
                  Record sessions to start your streak.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={`${panelClass} p-4`}>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Target className="h-4 w-4 text-emerald-400" />
            Consistency
          </div>
          <p className="mt-3 text-2xl font-extrabold text-emerald-400">
            {data?.summary?.consistency_pct != null
              ? `${data.summary.consistency_pct}%`
              : '—'}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            From recorded schedule data
          </p>
        </div>

        <div className={`${panelClass} p-4`}>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <CheckCircle2 className="h-4 w-4 text-brand-light" />
            Sessions completed
          </div>
          <p className="mt-3 text-2xl font-extrabold text-white">
            {data?.summary?.workouts_completed ?? '—'}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Completed workout records
          </p>
        </div>

        <div className={`${panelClass} p-4`}>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <TrendingUp className="h-4 w-4 text-brand-light" />
            Average RPE
          </div>
          <p className="mt-3 text-2xl font-extrabold text-brand-light">
            {data?.summary?.avg_rpe != null
              ? Number(data.summary.avg_rpe).toFixed(1)
              : '—'}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Reported effort when available
          </p>
        </div>

        <div className={`${panelClass} p-4`}>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Sparkles className="h-4 w-4 text-amber-300" />
            Fortis Pulse
          </div>
          <p className="mt-3 text-2xl font-extrabold text-white">
            {data?.summary?.current_pulse ?? '—'}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Based on available fitness data
          </p>
        </div>
      </section>

      {/* TIME & EQUIPMENT SWITCH */}
      <section className={`${panelClass} overflow-hidden`}>
        <div className="border-b border-dark-border bg-gradient-to-r from-burgundy/40 to-transparent p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-brand/30 bg-brand/10 p-3">
              <RefreshCw className="h-5 w-5 text-brand-light" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-light">
                Time & Equipment Switch
              </p>
              <h2 className="mt-1 text-lg font-bold text-white sm:text-xl">
                Make today's training fit your day
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Choose the time and equipment available to you. FORTIS can
                use these constraints to prepare a proposed workout adjustment.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-brand-light" />
              <h3 className="text-sm font-semibold text-white">
                How much time do you have?
              </h3>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {DURATIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  aria-pressed={availableMinutes === minutes}
                  onClick={() => {
                    setAvailableMinutes(minutes);
                    setAdaptationPrepared(false);
                  }}
                  className={`rounded-xl border px-2 py-3 text-sm font-bold transition-colors ${
                    availableMinutes === minutes
                      ? 'border-brand bg-brand/15 text-white ring-1 ring-brand/50'
                      : 'border-dark-border bg-dark-surface text-text-secondary hover:border-brand/50 hover:text-white'
                  }`}
                >
                  {minutes} min
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-brand-light" />
              <h3 className="text-sm font-semibold text-white">
                What equipment is available?
              </h3>
            </div>

            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_OPTIONS.map((option) => {
                const active = equipment.includes(option.id);

                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleEquipment(option.id)}
                    className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${
                      active
                        ? 'border-brand bg-brand/15 text-white'
                        : 'border-dark-border bg-dark-surface text-text-secondary hover:border-brand/50 hover:text-white'
                    }`}
                  >
                    {active && (
                      <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                    )}
                    {option.label}
                  </button>
                );
              })}
            </div>

            <p className="mt-2 text-xs text-text-muted">
              Choose one or more options. Bodyweight is exclusive of the other
              equipment choices.
            </p>
          </div>

          <div className="rounded-xl border border-dark-border bg-dark-surface p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Your adaptation request
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs text-white">
                <Clock3 className="h-3.5 w-3.5 text-brand-light" />
                {availableMinutes} minutes
              </span>

              {equipment.map((id) => {
                const option = EQUIPMENT_OPTIONS.find((item) => item.id === id);

                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs text-white"
                  >
                    <Dumbbell className="h-3.5 w-3.5 text-brand-light" />
                    {option?.label ?? id}
                  </span>
                );
              })}
            </div>

            <p className="mt-3 text-xs leading-5 text-text-muted">
              These settings describe your constraints; they do not modify
              your saved plan. The backend adaptation engine must validate
              exercises, estimate the session time, and return a proposed
              workout before any changes are accepted.
            </p>
          </div>

          <button
            type="button"
            onClick={prepareAdaptationRequest}
            disabled={adaptationBusy}
            className={`${buttonClass} w-full bg-brand text-white hover:bg-brand-light sm:w-auto`}
          >
            <Sparkles className="h-4 w-4" />
            {adaptationBusy ? 'Preparing workout…' : 'Generate workout proposal'}
            <ArrowRight className="h-4 w-4" />
          </button>

          {adaptationError && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{adaptationError}</p>}

          {adaptationSaved && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">Adapted workout saved as a separate planned session. Your original plan is unchanged.</p>}

          {adaptationPrepared && adaptationDraft && (
            <div
              role="status"
              className="rounded-xl border border-brand/30 bg-dark-surface p-4 space-y-3"
            >
              <div><p className="text-xs font-black uppercase tracking-wider text-brand-light">Proposed workout · review before accepting</p><h3 className="mt-1 font-bold text-white">{adaptationDraft.title}</h3><p className="mt-1 text-sm text-text-secondary">{adaptationDraft.summary}</p></div>
              <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-lg bg-white/5 px-3 py-2 text-text-secondary">Original ~{adaptationDraft.original_duration_min} min</span><span className="rounded-lg bg-white/5 px-3 py-2 text-text-secondary">Target {adaptationDraft.target_duration_min} min</span><span className="rounded-lg bg-white/5 px-3 py-2 text-text-secondary">Estimate ~{adaptationDraft.estimated_duration_min} min</span></div>
              <ul className="space-y-1.5">{(adaptationDraft.exercises ?? []).map((item: any) => <li key={`${item.exercise_id}-${item.order_index}`} className="text-sm text-white">{item.name} <span className="text-text-muted">· {item.planned_sets} × {item.planned_reps}</span>{item.change && <p className="text-xs text-text-muted">{item.change}</p>}</li>)}</ul>
              {(adaptationDraft.reasons ?? []).map((reason: any) => <p key={reason.rule_id} className="text-xs text-text-secondary"><b className="text-brand-light">{reason.label}:</b> {reason.detail}</p>)}
              {(adaptationDraft.changes ?? []).map((change: string) => <p key={change} className="text-xs text-text-muted">{change}</p>)}
              <p className="text-xs text-text-muted">Duration is an estimate using 45 seconds per set, 60 seconds rest, and one minute between exercises.</p>
              <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void acceptAdaptation()} disabled={adaptationBusy || !adaptationDraft.exercises?.length} className={`${buttonClass} bg-brand text-white`}>{adaptationBusy ? 'Saving…' : 'Accept and save session'}</button><button type="button" onClick={() => { const draftId = Number(adaptationDraft?.recommendation_id); if (adaptationWorkoutId && Number.isInteger(draftId)) void api.post(`/api/workouts/${adaptationWorkoutId}/adaptation-drafts/${draftId}/reject`).catch(() => undefined); setAdaptationDraft(null);setAdaptationPrepared(false);}} disabled={adaptationBusy} className={`${buttonClass} border border-dark-border text-text-secondary`}>Keep original</button></div>
            </div>
          )}
        </div>
      </section>

      {/* Monthly activity calendar */}
      <section className={`${panelClass} space-y-5 p-4 sm:p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-brand-light" />
              <h2 className="text-lg font-bold text-white">
                Your Training Calendar
              </h2>
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              Celebrate sessions you actually completed. An empty day is not
              automatically a missed workout.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-dark-border bg-dark-surface p-1.5 sm:justify-start">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() =>
                setMonth(
                  (current) =>
                    new Date(
                      current.getFullYear(),
                      current.getMonth() - 1,
                      1
                    )
                )
              }
              className="rounded-lg p-2 text-text-secondary hover:bg-white/5 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="min-w-32 text-center text-sm font-semibold text-white">
              {formatMonth(month)}
            </span>

            <button
              type="button"
              aria-label="Next month"
              onClick={() =>
                setMonth(
                  (current) =>
                    new Date(
                      current.getFullYear(),
                      current.getMonth() + 1,
                      1
                    )
                )
              }
              className="rounded-lg p-2 text-text-secondary hover:bg-white/5 hover:text-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <div
              key={day}
              className="py-2 text-center text-[10px] font-bold uppercase tracking-wide text-text-muted sm:text-xs"
            >
              {day}
            </div>
          ))}

          {monthDays.map((day, index) => {
            if (day === null) {
              return <div key={`blank-${index}`} aria-hidden="true" />;
            }

            const date = new Date(
              month.getFullYear(),
              month.getMonth(),
              day
            );
            const key = localDateKey(date);
            const status = dailyStatuses.get(key) ?? 'unknown';
            const isToday = isSameDay(date, new Date());
            const selected = selectedDate === key;

            const statusStyle: Record<DayStatus, string> = {
              completed:
                'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
              planned:
                'border-brand/40 bg-brand/10 text-brand-light',
              missed:
                'border-amber-500/40 bg-amber-500/10 text-amber-300',
              unknown:
                'border-dark-border bg-dark-surface text-text-secondary',
            };

            return (
              <button
                type="button"
                key={key}
                onClick={() =>
                  setSelectedDate((current) => (current === key ? null : key))
                }
                aria-label={`${formatDay(date)}: ${status}`}
                aria-pressed={selected}
                className={`relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl border text-xs transition-colors sm:min-h-16 ${
                  statusStyle[status]
                } ${
                  selected
                    ? 'ring-2 ring-brand ring-offset-2 ring-offset-dark-card'
                    : 'hover:border-brand/60'
                } ${
                  isToday ? 'outline outline-1 outline-white/40' : ''
                }`}
              >
                <span className="font-bold">{day}</span>

                {status === 'completed' && (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {status === 'planned' && (
                  <CalendarCheck className="h-3.5 w-3.5" />
                )}
                {status === 'missed' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                )}

                {isToday && (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-secondary">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
            Completed
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-brand-light" />
            Planned
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
            Explicitly marked missed
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-dark-border" />
            No recorded status
          </span>
        </div>

        {selectedDate && (
          <div className="rounded-xl border border-dark-border bg-dark-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-text-muted">Selected day</p>
                <h3 className="mt-1 font-bold text-white">
                  {formatDay(new Date(`${selectedDate}T12:00:00`))}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                aria-label="Close selected day"
                className="rounded-lg p-1 text-text-muted hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selectedDayRecords.length > 0 ? (
              <div className="mt-3 space-y-2">
                {selectedDayRecords.map((record, index) => (
                  <div
                    key={record.session_id ?? `${selectedDate}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dark-border p-3"
                  >
                    <span className="text-sm text-white">
                      {record.workout_name ?? record.title ?? 'Recorded activity'}
                    </span>
                    <span className="text-xs capitalize text-text-secondary">
                      {getRecordStatus(record) === 'unknown'
                        ? 'Recorded'
                        : getRecordStatus(record)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-text-secondary">
                {selectedDayStatus === 'unknown'
                  ? 'There is no workout record for this day. This does not mean a workout was missed.'
                  : 'No additional session details are available.'}
              </p>
            )}
          </div>
        )}

        {records.length === 0 && (
          <div className="rounded-xl border border-dashed border-dark-border p-4 text-center">
            <CalendarDays className="mx-auto h-6 w-6 text-text-muted" />
            <p className="mt-2 text-sm font-semibold text-white">
              Your calendar is ready
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Activity markers will appear when the progress API supplies
              actual workout-calendar records.
            </p>
          </div>
        )}
      </section>

      {/* Achievement cards */}
      <section className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Medal className="h-5 w-5 text-brand-light" />
            <h2 className="text-lg font-bold text-white">
              Your Achievement Wall
            </h2>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            Collect milestones by completing and recording sessions.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {achievements.map((achievement) => {
            const achieved =
              (completedSessionCount ?? 0) >= achievement.requirement;
            const Icon = achievement.icon;

            return (
              <div
                key={achievement.name}
                className={`${panelClass} p-4 ${
                  achieved ? 'border-brand/40' : 'opacity-80'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`rounded-xl border p-3 ${
                      achieved
                        ? 'border-brand/40 bg-brand/15 text-brand-light'
                        : 'border-dark-border bg-dark-surface text-text-muted'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  {achieved ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <LockKeyhole className="h-4 w-4 text-text-muted" />
                  )}
                </div>

                <h3 className="mt-4 font-bold text-white">
                  {achievement.name}
                </h3>
                <p className="mt-1 text-xs text-text-secondary">
                  {achievement.description}
                </p>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-dark-surface">
                  <div
                    className={`h-full rounded-full ${
                      achieved ? 'bg-brand' : 'bg-text-muted'
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        ((completedSessionCount ?? 0) /
                          achievement.requirement) *
                          100
                      )}%`,
                    }}
                  />
                </div>

                <p className="mt-2 text-xs text-text-muted">
                  {Math.min(
                    completedSessionCount ?? 0,
                    achievement.requirement
                  )}{' '}
                  / {achievement.requirement} sessions
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Statistical trajectory */}
      <section className={`${panelClass} space-y-4 p-4 sm:p-6`}>
        <div className="flex items-center gap-2 border-b border-dark-border pb-3">
          <TrendingUp className="h-5 w-5 text-brand-light" />
          <h2 className="text-lg font-bold text-white">
            Fortis Pulse Trajectory
          </h2>
        </div>

        {data?.forecast &&
        data.forecast.trend_label !== 'insufficient_data' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-dark-border bg-dark-surface p-4">
                <p className="text-xs text-text-muted">Trend</p>
                <p className="mt-2 text-lg font-bold capitalize text-white">
                  {data.forecast.trend_label ?? 'Unavailable'}
                </p>
              </div>

              <div className="rounded-xl border border-dark-border bg-dark-surface p-4">
                <p className="text-xs text-text-muted">7-day projection</p>
                <p className="mt-2 text-xl font-bold text-emerald-400">
                  {data.forecast.forecast_7d ?? '—'}
                </p>
              </div>

              <div className="rounded-xl border border-dark-border bg-dark-surface p-4">
                <p className="text-xs text-text-muted">14-day projection</p>
                <p className="mt-2 text-xl font-bold text-brand-light">
                  {data.forecast.forecast_14d ?? '—'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-dark-surface/50 p-3 text-xs text-text-muted">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-light" />
              <span>
                {data.forecast.disclaimer ??
                  'Projections are statistical estimates from available history, not guaranteed outcomes.'}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-2 py-6 text-center">
            <Sparkles className="mx-auto h-7 w-7 text-text-muted" />
            <p className="font-semibold text-text-secondary">
              More history is needed for a personal forecast
            </p>
            <p className="text-xs text-text-muted">
              Continue recording workouts. FORTIS will show projections only
              when sufficient historical data is available.
            </p>
          </div>
        )}
      </section>

      {/* Historical timeline */}
      <section className={`${panelClass} space-y-4 p-4 sm:p-6`}>
        <h2 className="border-b border-dark-border pb-3 text-base font-bold text-white">
          Historical Pulse Timeline
        </h2>

        {data?.fitness_state_history &&
        data.fitness_state_history.length > 0 ? (
          <div className="space-y-2">
            {data.fitness_state_history.map((item, index) => (
              <div
                key={`${item.date ?? 'checkpoint'}-${index}`}
                className="flex flex-col gap-2 rounded-lg bg-dark-surface p-3 text-xs min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between"
              >
                <span className="font-medium text-white">
                  {item.date ?? 'Undated checkpoint'}
                </span>

                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span className="text-text-secondary">
                    Pulse:{' '}
                    <strong className="text-brand-light">
                      {item.fortis_pulse ?? '—'}
                    </strong>
                  </span>
                  <span className="text-text-secondary">
                    Fatigue risk:{' '}
                    <strong className="text-amber-400">
                      {item.fatigue_risk != null
                        ? `${item.fatigue_risk}%`
                        : '—'}
                    </strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-text-muted">
            No historical fitness checkpoints have been recorded yet.
          </div>
        )}
      </section>
    </div>
  );
};

export default ProgressPage;
