import React from 'react';
import { motion } from 'framer-motion';

interface FortisPulseProps {
  score?: number | null;
  size?: 'sm' | 'md' | 'lg';
  subscores?: {
    strength?: number;
    recovery?: number;
    consistency?: number;
    nutrition?: number;
    fatigueRisk?: number;
  };
}

export const FortisPulse: React.FC<FortisPulseProps> = ({ score, size = 'lg', subscores }) => {
  const hasValidScore = score !== null && score !== undefined && score > 0;
  const displayScore = hasValidScore ? Math.round(score) : 0;

  const getScoreColor = (val: number) => {
    if (!hasValidScore) return 'text-text-muted stroke-dark-border';
    if (val >= 75) return 'text-success stroke-success';
    if (val >= 55) return 'text-brand stroke-brand';
    return 'text-warning stroke-warning';
  };

  const getLabel = (val: number) => {
    if (!hasValidScore) return 'CALIBRATING';
    if (val >= 75) return 'READY';
    if (val >= 55) return 'MODERATE';
    return 'LOW';
  };

  const radius = size === 'lg' ? 80 : size === 'md' ? 60 : 40;
  const strokeWidth = size === 'lg' ? 12 : size === 'md' ? 8 : 6;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = hasValidScore
    ? circumference - (displayScore / 100) * circumference
    : circumference;

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-dark-card rounded-2xl shadow-card">
      <div className="relative flex items-center justify-center mb-6">
        <svg
          className="transform -rotate-90 w-48 h-48"
          viewBox="0 0 200 200"
        >
          {/* Background circle */}
          <circle
            className="text-dark-border stroke-current"
            strokeWidth={strokeWidth}
            fill="transparent"
            r={radius}
            cx="100"
            cy="100"
          />
          {/* Animated progress circle */}
          <motion.circle
            className={getScoreColor(displayScore)}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="transparent"
            r={radius}
            cx="100"
            cy="100"
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            style={{
              strokeDasharray: circumference,
            }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <motion.span 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`text-4xl font-bold ${hasValidScore ? getScoreColor(displayScore).split(' ')[0] : 'text-text-muted'}`}
          >
            {hasValidScore ? displayScore : '—'}
          </motion.span>
          <span className="text-[10px] font-semibold tracking-widest text-text-muted mt-1 uppercase text-center max-w-[120px]">
            {hasValidScore ? getLabel(displayScore) : 'Baseline Pending'}
          </span>
        </div>
      </div>

      {subscores ? (
        <div className="w-full grid grid-cols-2 gap-4 mt-4">
          {Object.entries(subscores).map(([key, val]) => {
            const hasVal = val !== undefined && val !== null;
            const numericVal = hasVal ? Math.round(val) : 0;
            return (
              <div key={key} className="flex flex-col">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                  <span className="font-medium text-white">{hasVal ? numericVal : '—'}</span>
                </div>
                <div className="w-full bg-dark-border h-1.5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${hasVal ? numericVal : 0}%` }}
                    transition={{ duration: 1, delay: 0.5 }}
                    className={`h-full ${!hasVal ? 'bg-dark-border' : key === 'fatigueRisk' ? (numericVal > 60 ? 'bg-danger' : 'bg-success') : (numericVal > 60 ? 'bg-success' : 'bg-brand')}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-text-muted text-center mt-2">
          Log workouts and sleep to establish your baseline pulse
        </p>
      )}
    </div>
  );
};
