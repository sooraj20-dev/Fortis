// ─── Auth types ───────────────────────────────────────────────
export interface User {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  avatar_url?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: number;
  name: string;
  email: string;
  is_admin: boolean;
  onboarding_complete: boolean;
  avatar_url?: string;
}

// ─── Profile types ────────────────────────────────────────────
export interface Profile {
  id: number;
  user_id: number;
  age: number;
  height_cm: number;
  weight_kg: number;
  gender?: string;
  activity_level: string;
  workout_location?: string;
  injury_notes?: string;
  exercises_to_avoid?: string[];
  preferred_exercise_types?: string[];
  strength_benchmarks?: Record<string, any>;
  avatar_url?: string;
  created_at?: string;
}

export interface Goal {
  id: number;
  primary_goal: string;
  experience_level: string;
}

export interface Equipment {
  id: number;
  equipment_list: string[];
}

export interface Schedule {
  id: number;
  days_per_week: number;
  workout_duration_min: number;
  preferred_time: string;
}

export interface NutritionPref {
  id: number;
  diet_type: string;
  allergies: string[];
  regional_preference?: string;
  preferred_cuisine?: string;
  daily_budget_inr?: number;
  meals_per_day?: number;
  cooking_access?: string;
  cooking_available?: boolean;
}

export interface OnboardingData {
  age: number;
  height_cm?: number;
  weight_kg?: number;
  gender?: string;
  regional_preference?: string;
  primary_goal?: string;
  experience_level?: string;
  workout_location?: string;
  equipment_list?: string[];
  days_per_week?: number;
  workout_duration_min?: number;
  preferred_time?: string;
  diet_type?: string;
  allergies?: string[];
  preferred_cuisine?: string;
  daily_budget_inr?: number;
  meals_per_day?: number;
  cooking_access?: string;
  cooking_available?: boolean;
  activity_level?: string;
  typical_sleep_hours?: number;
  typical_sleep_quality?: number;
  typical_energy_level?: number;
  typical_soreness_level?: number;
  typical_stress_level?: number;
  injury_notes?: string;
  exercises_to_avoid?: string[];
  preferred_exercise_types?: string[];
  strength_benchmarks?: Record<string, any>;
}

export interface ProfileUpdateRequest {
  age?: number;
  height_cm?: number;
  weight_kg?: number;
  gender?: string;
  activity_level?: string;
  workout_location?: string;
  injury_notes?: string;
  exercises_to_avoid?: string[];
  preferred_exercise_types?: string[];
  strength_benchmarks?: Record<string, any>;
  primary_goal?: string;
  experience_level?: string;
  equipment_list?: string[];
  days_per_week?: number;
  workout_duration_min?: number;
  preferred_time?: string;
  diet_type?: string;
  allergies?: string[];
  regional_preference?: string;
  preferred_cuisine?: string;
  daily_budget_inr?: number;
  meals_per_day?: number;
  cooking_access?: string;
  cooking_available?: boolean;
  avatar_url?: string;
}

export interface FullProfile {
  profile?: Profile;
  goal?: Goal;
  equipment?: Equipment;
  schedule?: Schedule;
  nutrition_pref?: NutritionPref;
  name: string;
  email: string;
  avatar_url?: string;
  onboarding_complete: boolean;
}

// ─── Fitness State & Intelligence ─────────────────────────────
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

export type DecisionType = 'PROGRESSIVE' | 'NORMAL' | 'REDUCED' | 'RECOVERY' | 'REST';

export interface FortisDecision {
  id: number;
  date: string;
  decision_type: DecisionType;
  readiness_score: number;
  fatigue_risk: number;
  confidence: number;
  adjustment_factor: number;
  reasons: string[];
  recommendations: string[];
  baseline_deltas: Record<string, number>;
  created_at: string;
}

export interface ExplainFactor {
  metric: string;
  label: string;
  direction: 'up' | 'down' | 'stable';
  severity: 'positive' | 'negative' | 'warning' | 'neutral';
  note: string;
  baseline?: number;
  current?: number;
  delta: number;
}

export interface Explanation {
  decision_type: DecisionType;
  title: string;
  summary: string;
  volume_change: string;
  confidence: number;
  confidence_pct: number;
  factors: ExplainFactor[];
  reasons: string[];
  recommendations: string[];
  readiness_score: number;
  fatigue_risk: number;
  fortis_pulse: number;
}

// ─── Workout types ────────────────────────────────────────────
export interface Exercise {
  id: number;
  name: string;
  muscle_groups: string[];
  equipment_required: string[];
  difficulty: string;
  instructions: string;
  category: string;
}

export interface SetLog {
  set_number: number;
  reps_completed: number;
  weight_kg: number;
  rpe?: number;
}

export interface WorkoutExercise {
  id: number;
  exercise: Exercise;
  planned_sets: number;
  planned_reps: number;
  planned_weight_kg?: number;
  order_index: number;
  adaptation_note?: string;
  logs: SetLog[];
}

export interface Workout {
  id: number;
  workout_type: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
  date: string;
  estimated_duration_min?: number;
  decision_type?: DecisionType;
  adjustment_factor?: number;
  exercises: WorkoutExercise[];
}

export interface PostWorkoutFeedback {
  overall_rpe: number;
  energy_level: number;
  soreness_level: number;
  pain_flag: boolean;
  difficulty_notes?: string;
}

// ─── Nutrition types ──────────────────────────────────────────
export interface FoodItem {
  id: number;
  name: string;
  region: string;
  category: string;
  meal_type: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  typical_serving_g: number;
  estimated_cost_inr: number;
  dietary_tags: string[];
}

export interface FoodLogEntry {
  id: number;
  meal_type: string;
  food_name?: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  logged_at: string;
}

export interface NutritionSummary {
  date: string;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  target_calories: number;
  target_protein_g: number;
  calories_pct: number;
  protein_pct: number;
  budget_inr: number;
  logs: FoodLogEntry[];
  adherence_pct: number;
}

export interface MealItem {
  food_id?: number;
  name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  estimated_cost_inr: number;
}

export interface MealPlan {
  date: string;
  daily_budget_inr: number;
  meals: Record<string, MealItem[]>;
  total_calories: number;
  total_protein_g: number;
  total_cost_inr: number;
  budget_remaining_inr?: number;
  disclaimer?: string;
}

export interface GroceryItem {
  name: string;
  quantity: number;
  unit: string;
  estimated_cost_inr: number;
  checked?: boolean;
}

// ─── Recovery types ───────────────────────────────────────────
export interface RecoverySummary {
  date: string;
  recovery_score: number;
  sleep_hours?: number;
  sleep_quality?: number;
  energy_level?: number;
  soreness_level?: number;
  stress_level?: number;
  mood?: number;
  recommendation: string;
  logged_today: boolean;
}

// ─── Dashboard ────────────────────────────────────────────────
export interface DashboardData {
  greeting: string;
  date: string;
  fortis_pulse: number;
  fitness_state?: FitnessState;
  today_decision?: FortisDecision;
  today_workout?: {
    id: number;
    workout_type: string;
    status: string;
    exercise_count: number;
    estimated_duration_min: number;
  };
  nutrition_summary?: {
    total_calories: number;
    total_protein_g: number;
    target_calories: number;
    calories_pct: number;
    protein_pct: number;
    budget_remaining_inr: number;
    log_count: number;
  };
  recovery_summary?: {
    recovery_score: number;
    sleep_hours?: number;
    energy_level?: number;
    soreness_level?: number;
  };
  recent_decisions: FortisDecision[];
}

// ─── Progress ─────────────────────────────────────────────────
export interface ProgressData {
  summary: {
    days: number;
    workouts_completed: number;
    workouts_planned: number;
    consistency_pct: number;
    avg_rpe?: number;
    current_pulse: number;
  };
  fitness_state_history: Array<{
    date: string;
    fortis_pulse: number;
    strength_score: number;
    recovery_score: number;
    consistency_score: number;
    fatigue_risk: number;
  }>;
  workout_consistency: Array<{ date: string; status: string; workout_type: string; duration_min?: number }>;
  rpe_trend: Array<{ date: string; rpe: number; energy: number; soreness: number }>;
  forecast?: {
    trend_label: string;
    current_value: number;
    forecast_7d: number;
    forecast_14d: number;
    confidence: number;
    disclaimer: string;
  };
}

// ─── Chat ─────────────────────────────────────────────────────
export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ChatSession {
  id: number;
  title: string;
  created_at: string;
}
