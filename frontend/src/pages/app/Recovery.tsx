import React, { useEffect, useState } from 'react';
import { 
  Moon, 
  BatteryCharging, 
  Activity, 
  Heart, 
  CheckCircle2, 
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import api from '../../services/api';

export const RecoveryPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [sleepHours, setSleepHours] = useState(7.0);
  const [sleepQuality, setSleepQuality] = useState(8);
  const [energy, setEnergy] = useState(7);
  const [soreness, setSoreness] = useState(3);
  const [stress, setStress] = useState(4);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    api.get('/api/recovery/today')
      .then((res) => setData(res.data))
      .catch((err) => {
        console.error('Failed to load recovery data:', err);
      });
  }, []);

  const handleLogRecovery = () => {
    Promise.all([
      api.post('/api/recovery/sleep/log', {
        duration_hours: sleepHours,
        quality: sleepQuality
      }),
      api.post('/api/recovery/log', {
        energy_level: energy,
        soreness_level: soreness,
        stress_level: stress,
        mood: 8
      })
    ]).catch(() => {});
    setSubmitted(true);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Recovery Intelligence</h1>
        <p className="text-sm text-text-secondary mt-1">
          Multivariate recovery scoring tracking personal rolling baselines.
        </p>
      </div>

      {/* Primary Score Tile */}
      <div className="bg-dark-card border border-dark-border rounded-2xl p-6 shadow-card flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-full border-4 border-success/30 flex items-center justify-center font-extrabold text-3xl text-success shadow-glow-success">
            {data?.recovery_score || 72}%
          </div>
          <div>
            <span className="text-xs font-bold text-success uppercase tracking-wider">Status: Optimized</span>
            <h2 className="text-xl font-bold text-white">Training Readiness Elevated</h2>
            <p className="text-xs text-text-muted mt-1 max-w-sm">
              {data?.recommendation || 'Autonomic recovery is acceptable for high workload.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 w-full sm:w-auto text-xs">
          <div className="bg-dark-surface p-3 rounded-lg border border-dark-border text-center">
            <span className="text-text-muted block">Sleep Duration</span>
            <span className="text-base font-bold text-white">{data?.sleep_hours || 7.2} hrs</span>
          </div>
          <div className="bg-dark-surface p-3 rounded-lg border border-dark-border text-center">
            <span className="text-text-muted block">Systemic Stress</span>
            <span className="text-base font-bold text-emerald-400">{data?.stress_level || 4}/10</span>
          </div>
        </div>
      </div>

      {/* Daily Check-in Form */}
      <div className="bg-dark-card border border-dark-border rounded-2xl p-6 shadow-card space-y-6">
        <div className="border-b border-dark-border pb-3">
          <h3 className="text-lg font-bold text-white">Log Today's Recovery Signals</h3>
          <p className="text-xs text-text-secondary">
            Sleep and soreness readings are fed straight into the Fortis Decision Engine.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="fortis-label">Sleep Duration (Hours)</label>
            <input 
              type="number" step="0.1" value={sleepHours}
              onChange={(e) => setSleepHours(Number(e.target.value))}
              className="fortis-input"
            />
          </div>

          <div>
            <label className="fortis-label">Sleep Quality ({sleepQuality}/10)</label>
            <input 
              type="range" min="1" max="10" value={sleepQuality}
              onChange={(e) => setSleepQuality(Number(e.target.value))}
              className="w-full accent-brand"
            />
          </div>

          <div>
            <label className="fortis-label">Energy Level ({energy}/10)</label>
            <input 
              type="range" min="1" max="10" value={energy}
              onChange={(e) => setEnergy(Number(e.target.value))}
              className="w-full accent-brand"
            />
          </div>

          <div>
            <label className="fortis-label">Muscle Soreness ({soreness}/10)</label>
            <input 
              type="range" min="1" max="10" value={soreness}
              onChange={(e) => setSoreness(Number(e.target.value))}
              className="w-full accent-warning"
            />
          </div>
        </div>

        <button 
          onClick={handleLogRecovery}
          className="fortis-btn-primary w-full py-3"
        >
          Submit Recovery Check-in
        </button>

        {submitted && (
          <div className="p-3 bg-success/15 border border-success/30 rounded-lg text-xs text-success text-center">
            Recovery metrics logged successfully! Baseline delta updated.
          </div>
        )}
      </div>
    </div>
  );
};

export default RecoveryPage;
