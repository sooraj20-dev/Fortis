import React from 'react';
import { FortisDecision as DecisionType } from '../../types/intelligence';
import { BrainCircuit, ChevronRight } from 'lucide-react';

interface FortisDecisionProps {
  decision: DecisionType;
}

export const FortisDecision: React.FC<FortisDecisionProps> = ({ decision }) => {
  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'PROGRESSIVE': return 'bg-success/20 text-success border-success/30';
      case 'NORMAL': return 'bg-brand/20 text-brand border-brand/30';
      case 'REDUCED': return 'bg-warning/20 text-warning border-warning/30';
      case 'RECOVERY': return 'bg-orange-500/20 text-orange-500 border-orange-500/30';
      case 'REST': return 'bg-danger/20 text-danger border-danger/30';
      default: return 'bg-dark-border text-white border-dark-border';
    }
  };

  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-5 shadow-card-hover transition-all group">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-brand" />
          <span className="font-semibold text-sm">FORTIS AI</span>
        </div>
        <div className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${getBadgeColor(decision.decision_type)}`}>
          {decision.decision_type}
        </div>
      </div>
      
      <div className="mb-4">
        <ul className="space-y-2">
          {decision.reasons.map((reason, i) => (
            <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
              <span className="text-brand mt-1">•</span>
              {reason}
            </li>
          ))}
        </ul>
      </div>

      <button className="w-full flex items-center justify-between bg-dark-bg hover:bg-dark-hover transition-colors rounded-lg p-3 text-sm font-medium border border-dark-border">
        <span>View Explainability Panel</span>
        <ChevronRight className="w-4 h-4 text-muted group-hover:text-brand transition-colors" />
      </button>
    </div>
  );
};
