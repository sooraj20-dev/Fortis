import React, { useEffect, useState } from 'react';
import { 
  TrendingUp, 
  Target, 
  Flame, 
  Calendar,
  Sparkles,
  Info
} from 'lucide-react';
import { getCached } from '../../services/api';
import SplashScreen from '../../components/SplashScreen';

export const ProgressPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadProgress = () => {
    setLoading(true);
    setLoadError(false);
    getCached('/api/progress')
      .then((res) => setData(res.data))
      .catch((err) => {
        console.error('Failed to load progress data:', err);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadProgress, []);

  if (loading && !data && !loadError) {
    return <SplashScreen isLoader message="Loading your progress…" />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Progress & Trend Forecasting</h1>
        <p className="text-sm text-text-secondary mt-1">
          Historical adaptation trends and statistical progression projections.
        </p>
      </div>

      {loading && <p className="text-sm text-text-muted" aria-live="polite">Loading progress…</p>}
      {loadError && <div role="alert" className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-300">Progress could not be loaded. <button onClick={loadProgress} className="underline">Retry</button></div>}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-dark-card border border-dark-border rounded-xl p-4">
          <span className="text-xs text-text-muted">Consistency</span>
          <div className="text-2xl font-bold text-success mt-1">
            {data?.summary?.consistency_pct != null ? `${data.summary.consistency_pct}%` : '--'}
          </div>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-xl p-4">
          <span className="text-xs text-text-muted">Completed Sessions</span>
          <div className="text-2xl font-bold text-white mt-1">
            {data?.summary?.workouts_completed ?? '—'}
          </div>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-xl p-4">
          <span className="text-xs text-text-muted">Average RPE</span>
          <div className="text-2xl font-bold text-brand-light mt-1">
            {data?.summary?.avg_rpe ? data.summary.avg_rpe.toFixed(1) : '--'}
          </div>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-xl p-4">
          <span className="text-xs text-text-muted">Fortis Pulse</span>
          <div className="text-2xl font-bold text-white mt-1">
            {data?.summary?.current_pulse ?? '--'}
          </div>
        </div>
      </div>

      {/* Trajectory Forecast */}
      <div className="bg-dark-card border border-dark-border rounded-2xl p-6 shadow-card space-y-4">
        <div className="flex items-center gap-2 border-b border-dark-border pb-3">
          <Sparkles className="w-5 h-5 text-brand-light" />
          <h2 className="text-lg font-bold text-white">Fortis Pulse Statistical Trajectory</h2>
        </div>

        {data?.forecast && data.forecast.trend_label !== 'insufficient_data' ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-dark-surface rounded-xl border border-dark-border">
              <div>
                <span className="text-xs text-text-muted block">Projected 7-Day Trend</span>
                <span className="text-xl font-bold text-white capitalize">{data.forecast.trend_label || 'stable'} trajectory</span>
              </div>
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-xs text-text-muted block">7-Day Projection</span>
                  <span className="text-lg font-bold text-emerald-400">{data.forecast.forecast_7d ?? '--'}</span>
                </div>
                <div>
                  <span className="text-xs text-text-muted block">14-Day Projection</span>
                  <span className="text-lg font-bold text-brand-light">{data.forecast.forecast_14d ?? '--'}</span>
                </div>
              </div>
            </div>
            <div className="p-3 bg-dark-surface/50 rounded-lg text-xs text-text-muted flex items-start gap-2">
              <Info className="w-4 h-4 text-brand-light shrink-0 mt-0.5" />
              <span>{data.forecast.disclaimer || 'Projections represent mathematical trend extrapolation from logged workouts.'}</span>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-text-muted space-y-1">
            <p className="font-semibold text-text-secondary">Insufficient Historical Data for Personal Projections</p>
            <p>At least 3 activity or recovery records are required to project your personal trajectory reliably.</p>
          </div>
        )}
      </div>

      {/* Fitness State Progression Timeline */}
      <div className="bg-dark-card border border-dark-border rounded-2xl p-6 shadow-card space-y-4">
        <h2 className="text-base font-bold text-white border-b border-dark-border pb-3">Historical Pulse Timeline</h2>
        {data?.fitness_state_history && data.fitness_state_history.length > 0 ? (
          <div className="space-y-2">
            {data.fitness_state_history.map((item: any, i: number) => (
              <div key={i} className="flex justify-between items-center p-3 bg-dark-surface rounded-lg text-xs">
                <span className="font-medium text-white">{item.date}</span>
                <div className="flex gap-4">
                  <span>Pulse: <strong className="text-brand-light">{item.fortis_pulse}</strong></span>
                  <span>Fatigue Risk: <strong className="text-warning">{item.fatigue_risk}%</strong></span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-text-muted">
            No historical checkpoints recorded yet. Daily fitness state will appear here as you log activities.
          </div>
        )}
      </div>
    </div>
  );
};

export default ProgressPage;
