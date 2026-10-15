import React, { useEffect, useState } from 'react';
import { 
  Dumbbell, 
  CheckCircle, 
  Play, 
  Sparkles, 
  AlertCircle,
  Clock,
  Flame,
  ChevronRight
} from 'lucide-react';
import api, { getCached } from '../../services/api';

export const WorkoutPage: React.FC = () => {
  const [workout, setWorkout] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [rpe, setRpe] = useState(7);
  const [soreness, setSoreness] = useState(4);
  const [energy, setEnergy] = useState(7);
  const [submittedFeedback, setSubmittedFeedback] = useState(false);
  const [savingAction, setSavingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchWorkout = () => {
    setLoading(true);
    setLoadError(null);
    getCached('/api/workouts/today')
      .then((res) => setWorkout(res.data))
      .catch((err) => {
        console.error('Failed to load workout:', err);
        setLoadError('Unable to load scheduled workout. Please try again.');
        setWorkout(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchWorkout();
  }, []);

  const handleStartWorkout = async () => {
    if (!workout?.id) return;
    setSavingAction(true);
    setActionError(null);
    try {
      await api.post(`/api/workouts/${workout.id}/start`);
      setSessionActive(true);
      fetchWorkout();
    } catch {
      setActionError('Could not start this workout. Check your connection and retry.');
    } finally {
      setSavingAction(false);
    }
  };

  const handleCompleteWorkout = async () => {
    if (!workout?.id) return;
    setSavingAction(true);
    setActionError(null);
    try {
      await api.post(`/api/workouts/${workout.id}/complete`, {
        overall_rpe: rpe,
        energy_level: energy,
        soreness_level: soreness,
        pain_flag: false,
        difficulty_notes: 'Completed session as recommended.'
      });
      setSubmittedFeedback(true);
      fetchWorkout();
    } catch {
      setActionError('Workout feedback could not be saved. Check your connection and retry.');
    } finally {
      setSavingAction(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-text-muted">Loading scheduled workout plan...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center space-y-3 bg-dark-card border border-dark-border rounded-2xl">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
        <p className="text-sm text-text-secondary">{loadError}</p>
        <button onClick={fetchWorkout} className="fortis-btn-primary py-2 px-5 text-xs">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-brand/20 text-brand-light border border-brand/30">
              {workout?.decision_type || 'ADAPTED'} TRAINING
            </span>
            {workout?.adjustment_factor && workout.adjustment_factor !== 1.0 && (
              <span className="text-xs text-warning flex items-center gap-1 font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                Adaptive Factor: {workout.adjustment_factor}x
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            {workout?.workout_type || 'Today\'s Session'}
          </h1>
          <p className="text-sm text-text-secondary">
            Estimated Duration: {workout?.estimated_duration_min ?? '—'}{workout?.estimated_duration_min != null ? ' mins' : ''}
          </p>
        </div>

        {!sessionActive && !submittedFeedback && (
          <button 
            onClick={handleStartWorkout}
            className="fortis-btn-primary flex items-center justify-center gap-2 shadow-glow py-3 px-6"
            disabled={savingAction}
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Start Session</span>
          </button>
        )}
      </div>

      {actionError && <div role="alert" className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-300">{actionError}</div>}

      {/* Exercises List */}
      <div className="space-y-3">
        {(!workout?.exercises || workout.exercises.length === 0) && (
          <div className="bg-dark-card border border-dark-border rounded-xl p-8 text-center space-y-2">
            <Dumbbell className="w-8 h-8 text-text-muted mx-auto opacity-50" />
            <h3 className="text-sm font-bold text-white">No Exercises Scheduled</h3>
            <p className="text-xs text-text-secondary max-w-sm mx-auto">
              Your recovery score indicates rest, or your training profile is being calibrated. Complete onboarding or check back after logging recovery.
            </p>
          </div>
        )}
        {workout?.exercises?.map((item: any, index: number) => (
          <div 
            key={item.id || index}
            className="bg-dark-card border border-dark-border rounded-xl p-4 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-dark-surface border border-dark-border flex items-center justify-center font-bold text-sm text-brand-light">
                {index + 1}
              </div>
              <div>
                <h3 className="font-bold text-white text-base leading-tight">
                  {item.exercise?.name}
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  {item.exercise?.instructions}
                </p>
                {item.adaptation_note && (
                  <span className="inline-block mt-1 text-[11px] text-brand-light font-medium bg-brand/10 px-2 py-0.5 rounded">
                    {item.adaptation_note}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm font-semibold bg-dark-surface px-4 py-2 rounded-lg border border-dark-border/60 self-start sm:self-auto">
              <div>
                <span className="text-xs text-text-muted font-normal block">Target</span>
                <span>{item.planned_sets} sets × {item.planned_reps} reps</span>
              </div>
              {item.planned_weight_kg > 0 && (
                <div className="border-l border-dark-border pl-4">
                  <span className="text-xs text-text-muted font-normal block">Weight</span>
                  <span className="text-brand-light">{item.planned_weight_kg} kg</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* RPE & Adaptation Feedback Dialog */}
      {sessionActive && !submittedFeedback && (
        <div className="bg-dark-card border border-brand/30 rounded-2xl p-6 shadow-glow space-y-6">
          <div className="border-b border-dark-border pb-3">
            <h2 className="text-lg font-bold text-white">Log Workout Feedback (Feedback Loop)</h2>
            <p className="text-xs text-text-secondary">
              Fortis uses this performance feedback immediately to recalculate your Fatigue Risk and update tomorrow's decision.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm font-medium mb-1">
                <span>Overall Session RPE (Difficulty: 1 - 10)</span>
                <span className="font-bold text-brand-light">{rpe}/10</span>
              </div>
              <input 
                type="range" min="1" max="10" value={rpe}
                onChange={(e) => setRpe(Number(e.target.value))}
                className="w-full accent-brand bg-dark-border"
              />
              <div className="flex justify-between text-[11px] text-text-muted mt-1">
                <span>1 (Easy warm-up)</span>
                <span>5 (Moderate)</span>
                <span>10 (Maximal effort)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1 block">Post-workout Energy (1-10)</label>
                <input 
                  type="number" min="1" max="10" value={energy}
                  onChange={(e) => setEnergy(Number(e.target.value))}
                  className="fortis-input"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1 block">Expected Soreness (1-10)</label>
                <input 
                  type="number" min="1" max="10" value={soreness}
                  onChange={(e) => setSoreness(Number(e.target.value))}
                  className="fortis-input"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleCompleteWorkout}
            disabled={savingAction}
            className="fortis-btn-primary w-full py-3 font-bold text-sm tracking-wide"
          >
            {savingAction ? 'Saving workout…' : 'Complete Workout & Adapt Future Plan'}
          </button>
        </div>
      )}

      {submittedFeedback && (
        <div className="bg-success/15 border border-success/30 rounded-xl p-5 text-center space-y-2">
          <CheckCircle className="w-8 h-8 text-success mx-auto" />
          <h3 className="font-bold text-base text-white">Workout Performance Recorded!</h3>
          <p className="text-xs text-text-secondary max-w-md mx-auto">
            Fortis Continuous Adaptation Engine has digested your RPE ({rpe}/10) and updated your Personal Fitness State. Your next session will dynamically adapt based on recovery.
          </p>
        </div>
      )}
    </div>
  );
};

export default WorkoutPage;
