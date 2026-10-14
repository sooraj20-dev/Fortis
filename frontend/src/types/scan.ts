// Fortis Scan TypeScript Types

export interface ScanMetric {
  metric_name: string;
  value: number;
  unit: string;
  confidence: number;
  category: string;
}

export interface ScanObservation {
  category: string;
  finding: string;
  severity: string; // 'good' | 'moderate' | 'attention'
  recommendation: string;
}

export interface ScanResult {
  scan_id: number;
  user_id: number;
  scan_date: string;
  status: string;
  movement_quality: number;
  mobility_score: number;
  stability_score: number;
  movement_consistency: number;
  scan_confidence: number;
  posture_score: number;
  squat_score: number;
  primary_movement_pattern: string;
  metrics: ScanMetric[];
  observations: ScanObservation[];
  fortis_pulse_updated: number | null;
  decision_updated: boolean;
  disclaimer: string;
}

export interface ScanListItem {
  scan_id: number;
  scan_date: string;
  movement_quality: number;
  mobility_score: number;
  stability_score: number;
  scan_confidence: number;
  status: string;
}

export interface ScanComparison {
  current_scan_id: number;
  previous_scan_id: number;
  current_date: string;
  previous_date: string;
  deltas: Record<string, number>;
  improvements: string[];
  regressions: string[];
  stable: string[];
  summary: string;
  disclaimer: string;
}

export interface WeeklyPlanDay {
  day: string;
  focus: string;
  exercises: string[];
  emphasis: string;
}

export interface MealPreview {
  meal: string;
  recommendation: string;
}

export interface NutritionApproach {
  region: string;
  daily_budget_inr: number;
  diet_type: string;
  target_calories: number;
  highlights: string[];
  meals_preview: MealPreview[];
}

export interface CurrentState {
  movement_quality: number;
  mobility: number;
  stability: number;
  recovery_score: number;
  fortis_pulse: number;
}

export interface Blueprint {
  blueprint_title: string;
  generated_at: string;
  current_state: CurrentState;
  training_focus: Array<{ area: string; reason: string; priority: string }>;
  weekly_plan: WeeklyPlanDay[];
  nutrition_approach: NutritionApproach;
  disclaimer: string;
}

export interface BMIResult {
  bmi: number;
  category: string;
  healthy_bmi_range: string;
  disclaimer: string;
}

export interface ScanStartResponse {
  scan_id: number;
  message: string;
  status: string;
}
