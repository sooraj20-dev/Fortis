export interface FitnessState {
  id: number;
  date: string;
  strength_score: number;
  endurance_score: number;
  recovery_score: number;
  consistency_score: number;
  nutrition_score: number;
  mobility_score: number;
  readiness_score: number;
  fatigue_risk: number;
  fortis_pulse: number;
  computed_at: string;
}

export interface FortisDecision {
  id: number;
  date: string;
  decision_type: 'PROGRESSIVE' | 'NORMAL' | 'REDUCED' | 'RECOVERY' | 'REST';
  readiness_score: number;
  fatigue_risk: number;
  confidence: number;
  adjustment_factor: number;
  reasons: string[];
  recommendations: string[];
  baseline_deltas: Record<string, number>;
}
