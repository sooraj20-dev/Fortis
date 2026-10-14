import React, { useState } from 'react';
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
} from 'lucide-react';
import { completeOnboarding } from '../services/profileApi';
import { useAuthStore } from '../stores/authStore';
import BrandLogo from '../components/BrandLogo';
import type { OnboardingData } from '../types';

export interface OnboardingProps {
  onComplete?: () => void;
  isModal?: boolean;
  onClose?: () => void;
}

const TOTAL_STEPS = 6;

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete, isModal, onClose }) => {
  const navigate = useNavigate();
  const setOnboardingComplete = useAuthStore((s) => s.setOnboardingComplete);
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
  });

  // Custom text input for exercises to avoid tag creation
  const [avoidInput, setAvoidInput] = useState('');
  const [allergyInput, setAllergyInput] = useState('');

  // Navigation handlers
  const handleNext = () => {
    setError(null);
    if (!validateCurrentStep()) return;
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    setError(null);
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSkip = () => {
    setError(null);
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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
    return true;
  };

  // Submission
  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const response = await completeOnboarding(formData);
      if (response.success || response.onboarding_complete) {
        sessionStorage.removeItem('fortis_new_registration');
        setOnboardingComplete(true);
        if (onComplete) {
          onComplete();
        } else {
          navigate('/dashboard', { replace: true });
        }
      } else {
        setError(response.message || 'Failed to complete onboarding. Please try again.');
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (typeof detail === 'string') {
        setError(detail);
      } else if (Array.isArray(detail)) {
        setError(detail.map((d: any) => d.msg || 'Validation error').join(', '));
      } else {
        setError('Unable to save onboarding profile. Please check your connection and retry.');
      }
    } finally {
      setSubmitting(false);
    }
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

  return (
    <div className={isModal ? "p-2 sm:p-4 text-text-primary" : "min-h-dvh bg-dark-bg text-text-primary flex flex-col justify-between py-6 px-4 sm:px-6 relative overflow-hidden"}>
      {/* Background Ambience */}
      {!isModal && (
        <>
          <div className="absolute inset-0 bg-radial-orange pointer-events-none" />
          <div
            className="absolute top-0 right-0 font-black text-brand pointer-events-none select-none"
            style={{ fontSize: 'clamp(5rem, 15vw, 12rem)', opacity: 0.03, lineHeight: 1 }}
          >
            FORTIS
          </div>
        </>
      )}

      {/* Header Container */}
      <div className="max-w-2xl mx-auto w-full relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <BrandLogo className="h-12 w-auto" />
            <div>
              <span className="text-[9px] text-brand-light font-bold tracking-[0.16em] uppercase">
                Personalized Onboarding
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="fortis-pill">
              Step {currentStep} of {TOTAL_STEPS}
            </span>
            {isModal && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-dark-surface border border-dark-border text-text-muted hover:text-white flex items-center justify-center text-base font-bold transition-colors ml-1"
                title="Close"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-dark-surface h-2 rounded-full overflow-hidden border border-dark-border mb-6">
          <div
            className="bg-brand h-full rounded-full transition-all duration-300"
            style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {/* Wizard Content Card */}
      <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col justify-center relative z-10 my-4">
        <div className="fortis-card rounded-3xl p-6 sm:p-8">
          {/* Error Banner */}
          {error && (
            <div className="mb-6 flex items-start gap-2.5 bg-danger/10 border border-danger/20 rounded-xl p-3.5 text-xs text-danger">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* ───────────────── STEP 1: PERSONAL DETAILS ───────────────── */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-5 h-5 text-brand-light" />
                  <h2 className="text-xl sm:text-2xl font-black text-white">Personal Details</h2>
                </div>
                <p className="text-xs sm:text-sm text-text-secondary">
                  Welcome, <span className="text-white font-semibold">{userName}</span>! Tell us a bit about yourself so Fortis can calibrate your body metrics and recommendations.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="fortis-label">
                    Age <span className="text-brand">*</span>
                  </label>
                  <input
                    type="number"
                    min={12}
                    max={120}
                    value={formData.age || ''}
                    onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value) || 0 })}
                    className="fortis-input"
                    placeholder="e.g. 25"
                    required
                  />
                </div>

                <div>
                  <label className="fortis-label">Gender (Optional)</label>
                  <select
                    value={formData.gender || 'unspecified'}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="fortis-input"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Non-binary / Other</option>
                    <option value="unspecified">Prefer not to say</option>
                  </select>
                </div>

                <div>
                  <label className="fortis-label">
                    Height (cm) <span className="text-brand">*</span>
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={280}
                    value={formData.height_cm || ''}
                    onChange={(e) => setFormData({ ...formData, height_cm: parseFloat(e.target.value) || undefined })}
                    className="fortis-input"
                    placeholder="e.g. 175"
                    required
                  />
                </div>

                <div>
                  <label className="fortis-label">
                    Current Weight (kg) <span className="text-brand">*</span>
                  </label>
                  <input
                    type="number"
                    min={20}
                    max={350}
                    step="0.1"
                    value={formData.weight_kg || ''}
                    onChange={(e) => setFormData({ ...formData, weight_kg: parseFloat(e.target.value) || undefined })}
                    className="fortis-input"
                    placeholder="e.g. 70.5"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="regional-preference" className="fortis-label">
                  Region / Country <span className="text-brand">*</span>
                </label>
                <input
                  id="regional-preference"
                  type="text"
                  value={formData.regional_preference || ''}
                  onChange={(e) => setFormData({ ...formData, regional_preference: e.target.value })}
                  className="fortis-input"
                  placeholder="e.g. Kerala, India"
                  autoComplete="country-name"
                  required
                />
                <p className="text-[10px] text-text-muted mt-1">
                  Used to tailor local food suggestions and nutrition recommendations.
                </p>
              </div>
            </div>
          )}

          {/* ───────────────── STEP 2: FITNESS GOALS ───────────────── */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-5 h-5 text-brand-light" />
                  <h2 className="text-xl sm:text-2xl font-black text-white">Fitness Goals & Schedule</h2>
                </div>
                <p className="text-xs sm:text-sm text-text-secondary">
                  Choose your focus, training environment, and available commitment.
                </p>
              </div>

              {/* Primary Goal */}
              <div>
                <label className="fortis-label">Primary Fitness Goal</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { key: 'GENERAL_FITNESS', label: 'General Fitness', desc: 'Health & Balance' },
                    { key: 'STRENGTH', label: 'Strength', desc: 'Power & Core Lifts' },
                    { key: 'MUSCLE', label: 'Hypertrophy', desc: 'Muscle Building' },
                    { key: 'ENDURANCE', label: 'Endurance', desc: 'Stamina & Cardio' },
                  ].map((g) => (
                    <button
                      type="button"
                      key={g.key}
                      onClick={() => setFormData({ ...formData, primary_goal: g.key })}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        formData.primary_goal === g.key
                          ? 'border-brand bg-brand/15 text-white'
                          : 'border-dark-border bg-dark-surface text-text-secondary hover:text-white'
                      }`}
                    >
                      <div className="font-bold text-xs">{g.label}</div>
                      <div className="text-[10px] text-text-muted mt-0.5">{g.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Experience Level & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="fortis-label">Experience Level</label>
                  <div className="flex gap-2">
                    {['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].map((exp) => (
                      <button
                        type="button"
                        key={exp}
                        onClick={() => setFormData({ ...formData, experience_level: exp })}
                        className={`flex-1 py-2.5 rounded-xl border text-xs font-bold capitalize transition-all ${
                          formData.experience_level === exp
                            ? 'border-brand bg-brand/20 text-brand-light'
                            : 'border-dark-border bg-dark-surface text-text-muted hover:text-text-primary'
                        }`}
                      >
                        {exp.toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="fortis-label">Workout Location</label>
                  <div className="flex gap-2">
                    {[
                      { id: 'home', label: 'Home' },
                      { id: 'gym', label: 'Gym' },
                      { id: 'outdoors', label: 'Outdoors' },
                    ].map((loc) => (
                      <button
                        type="button"
                        key={loc.id}
                        onClick={() => setFormData({ ...formData, workout_location: loc.id })}
                        className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                          formData.workout_location === loc.id
                            ? 'border-brand bg-brand/20 text-brand-light'
                            : 'border-dark-border bg-dark-surface text-text-muted hover:text-text-primary'
                        }`}
                      >
                        {loc.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Equipment */}
              <div>
                <label className="fortis-label">Available Equipment (Select all that apply)</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'bodyweight', label: 'Bodyweight' },
                    { id: 'dumbbells', label: 'Dumbbells' },
                    { id: 'resistance_bands', label: 'Resistance Bands' },
                    { id: 'barbell', label: 'Barbell & Plates' },
                    { id: 'pull_up_bar', label: 'Pull-up Bar' },
                    { id: 'full_gym', label: 'Full Gym Machines' },
                  ].map((eq) => {
                    const selected = formData.equipment_list?.includes(eq.id);
                    return (
                      <button
                        type="button"
                        key={eq.id}
                        onClick={() => toggleArrayItem('equipment_list', eq.id)}
                        className={`p-2.5 rounded-xl border text-left text-xs font-semibold flex items-center justify-between transition-all ${
                          selected
                            ? 'border-brand bg-brand/10 text-white'
                            : 'border-dark-border bg-dark-surface text-text-muted hover:text-white'
                        }`}
                      >
                        <span>{eq.label}</span>
                        {selected && <Check className="w-3.5 h-3.5 text-brand-light shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Schedule: Days & Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="fortis-label">Workout Days Per Week ({formData.days_per_week || 3} days)</label>
                  <input
                    type="range"
                    min={1}
                    max={7}
                    value={formData.days_per_week || 3}
                    onChange={(e) => setFormData({ ...formData, days_per_week: parseInt(e.target.value) || 3 })}
                    className="w-full accent-brand cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-text-muted mt-1">
                    <span>1 day</span>
                    <span>3 days</span>
                    <span>5 days</span>
                    <span>7 days</span>
                  </div>
                </div>

                <div>
                  <label className="fortis-label">Session Duration</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[15, 30, 45, 60].map((dur) => (
                      <button
                        type="button"
                        key={dur}
                        onClick={() => setFormData({ ...formData, workout_duration_min: dur })}
                        className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                          formData.workout_duration_min === dur
                            ? 'border-brand bg-brand/20 text-brand-light'
                            : 'border-dark-border bg-dark-surface text-text-muted hover:text-white'
                        }`}
                      >
                        {dur}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ───────────────── STEP 3: NUTRITION PREFERENCES ───────────────── */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Utensils className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-xl sm:text-2xl font-black text-white">Nutrition Preferences</h2>
                </div>
                <p className="text-xs sm:text-sm text-text-secondary">
                  Fortis generates practical Indian & regional meal plans adapted to your dietary pattern and budget.
                </p>
              </div>

              {/* Diet Type */}
              <div>
                <label className="fortis-label">Dietary Pattern</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { id: 'vegetarian', label: 'Vegetarian' },
                    { id: 'eggetarian', label: 'Eggetarian' },
                    { id: 'non_vegetarian', label: 'Non-Vegetarian' },
                    { id: 'vegan', label: 'Vegan' },
                  ].map((d) => (
                    <button
                      type="button"
                      key={d.id}
                      onClick={() => setFormData({ ...formData, diet_type: d.id })}
                      className={`p-3 rounded-xl border text-xs font-bold text-center transition-all ${
                        formData.diet_type === d.id
                          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                          : 'border-dark-border bg-dark-surface text-text-muted hover:text-white'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preferred Cuisine & Daily Budget */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="fortis-label">Preferred Cuisine</label>
                  <select
                    value={formData.preferred_cuisine || 'Kerala/South Indian'}
                    onChange={(e) => setFormData({ ...formData, preferred_cuisine: e.target.value })}
                    className="fortis-input"
                  >
                    <option value="Kerala/South Indian">Kerala / South Indian</option>
                    <option value="North Indian">North Indian</option>
                    <option value="Continental/High-Protein">Continental / High-Protein</option>
                    <option value="Flexible Mixed">Flexible Mixed</option>
                  </select>
                </div>

                <div>
                  <label className="fortis-label">Daily Food Budget (₹ INR)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">₹</span>
                    <input
                      type="number"
                      min={30}
                      step="10"
                      value={formData.daily_budget_inr || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, daily_budget_inr: parseFloat(e.target.value) || 0 })
                      }
                      className="fortis-input pl-8"
                      placeholder="e.g. 150"
                    />
                  </div>
                  <span className="text-[10px] text-text-muted mt-1 block">
                    Recommended: ₹120 - ₹250 / day for balanced whole foods.
                  </span>
                </div>
              </div>

              {/* Meals per day & Cooking Access */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="fortis-label">Preferred Meals Per Day</label>
                  <div className="flex gap-2">
                    {[2, 3, 4, 5].map((m) => (
                      <button
                        type="button"
                        key={m}
                        onClick={() => setFormData({ ...formData, meals_per_day: m })}
                        className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${
                          formData.meals_per_day === m
                            ? 'border-brand bg-brand/20 text-brand-light'
                            : 'border-dark-border bg-dark-surface text-text-muted hover:text-white'
                        }`}
                      >
                        {m} meals
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="fortis-label">Cooking Access</label>
                  <div className="flex gap-2">
                    {[
                      { id: 'home', label: 'Home Kitchen' },
                      { id: 'hostel', label: 'Hostel / Mess' },
                      { id: 'mixed', label: 'Mixed / Dining Out' },
                    ].map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => setFormData({ ...formData, cooking_access: c.id })}
                        className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${
                          formData.cooking_access === c.id
                            ? 'border-brand bg-brand/20 text-brand-light'
                            : 'border-dark-border bg-dark-surface text-text-muted hover:text-white'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Food Allergies / Restrictions (Optional) */}
              <div>
                <label className="fortis-label">Food Allergies or Avoidances (Optional)</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={allergyInput}
                    onChange={(e) => setAllergyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (allergyInput.trim() && !formData.allergies?.includes(allergyInput.trim())) {
                          setFormData({ ...formData, allergies: [...(formData.allergies || []), allergyInput.trim()] });
                          setAllergyInput('');
                        }
                      }
                    }}
                    placeholder="e.g. Peanuts, Dairy, Seafood (Press Enter)"
                    className="fortis-input flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (allergyInput.trim() && !formData.allergies?.includes(allergyInput.trim())) {
                        setFormData({ ...formData, allergies: [...(formData.allergies || []), allergyInput.trim()] });
                        setAllergyInput('');
                      }
                    }}
                    className="fortis-btn-secondary text-xs px-3"
                  >
                    Add
                  </button>
                </div>
                {formData.allergies && formData.allergies.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {formData.allergies.map((alg) => (
                      <button
                        type="button"
                        key={alg}
                        aria-label={`Remove ${alg}`}
                        onClick={() =>
                          setFormData({ ...formData, allergies: formData.allergies?.filter((a) => a !== alg) })
                        }
                        className="fortis-pill"
                      >
                        {alg} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ───────────────── STEP 4: LIFESTYLE & RECOVERY ───────────────── */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Moon className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-xl sm:text-2xl font-black text-white">Lifestyle & Recovery</h2>
                </div>
                <p className="text-xs sm:text-sm text-text-secondary">
                  Your baseline sleep and energy patterns determine workout volume and Fortis Pulse readiness.
                </p>
              </div>

              {/* Sleep Duration */}
              <div>
                <label className="fortis-label">
                  Average Sleep Duration ({formData.typical_sleep_hours || 7.5} hours)
                </label>
                <input
                  type="range"
                  min={4}
                  max={12}
                  step={0.5}
                  value={formData.typical_sleep_hours || 7.5}
                  onChange={(e) => setFormData({ ...formData, typical_sleep_hours: parseFloat(e.target.value) || 7.5 })}
                  className="w-full accent-indigo-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-text-muted mt-1">
                  <span>4 hrs</span>
                  <span>7 hrs</span>
                  <span>9 hrs</span>
                  <span>12 hrs</span>
                </div>
              </div>

              {/* Activity Level */}
              <div>
                <label className="fortis-label">Daily Activity Level</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    { id: 'SEDENTARY', label: 'Sedentary', desc: 'Desk job, light walking' },
                    { id: 'MODERATELY_ACTIVE', label: 'Moderately Active', desc: 'On feet, moderate steps' },
                    { id: 'VERY_ACTIVE', label: 'Very Active', desc: 'Physical work, sports' },
                  ].map((act) => (
                    <button
                      type="button"
                      key={act.id}
                      onClick={() => setFormData({ ...formData, activity_level: act.id })}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        formData.activity_level === act.id
                          ? 'border-indigo-400 bg-indigo-500/15 text-white'
                          : 'border-dark-border bg-dark-surface text-text-muted hover:text-white'
                      }`}
                    >
                      <div className="font-bold text-xs">{act.label}</div>
                      <div className="text-[10px] text-text-muted mt-0.5">{act.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preferred Workout Time & Typical Energy */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="fortis-label">Preferred Workout Time</label>
                  <div className="flex gap-2">
                    {['morning', 'afternoon', 'evening'].map((time) => (
                      <button
                        type="button"
                        key={time}
                        onClick={() => setFormData({ ...formData, preferred_time: time })}
                        className={`flex-1 py-2 rounded-xl border text-xs font-bold capitalize transition-all ${
                          formData.preferred_time === time
                            ? 'border-brand bg-brand/20 text-brand-light'
                            : 'border-dark-border bg-dark-surface text-text-muted hover:text-white'
                        }`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="fortis-label">
                    Baseline Energy Level ({formData.typical_energy_level || 7} / 10)
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={formData.typical_energy_level || 7}
                    onChange={(e) => setFormData({ ...formData, typical_energy_level: parseInt(e.target.value) || 7 })}
                    className="w-full accent-brand cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-text-muted mt-1">
                    <span>Low (1)</span>
                    <span>Moderate (5)</span>
                    <span>High (10)</span>
                  </div>
                </div>
              </div>

              {/* Optional Stress & Soreness */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-dark-border/60">
                <div>
                  {formData.typical_stress_level === undefined ? (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, typical_stress_level: 5 })}
                      className="fortis-btn-ghost text-xs px-0"
                    >
                      + Add typical stress level (optional)
                    </button>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <label className="fortis-label text-xs mb-0">Typical Stress Level ({formData.typical_stress_level}/10)</label>
                        <button type="button" onClick={() => setFormData({ ...formData, typical_stress_level: undefined })} className="text-[10px] text-text-muted hover:text-white">
                          Clear
                        </button>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={formData.typical_stress_level}
                        onChange={(e) => setFormData({ ...formData, typical_stress_level: parseInt(e.target.value) })}
                        className="w-full accent-warning cursor-pointer"
                      />
                    </>
                  )}
                </div>
                <div>
                  {formData.typical_soreness_level === undefined ? (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, typical_soreness_level: 5 })}
                      className="fortis-btn-ghost text-xs px-0"
                    >
                      + Add typical soreness level (optional)
                    </button>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <label className="fortis-label text-xs mb-0">Typical Muscle Soreness ({formData.typical_soreness_level}/10)</label>
                        <button type="button" onClick={() => setFormData({ ...formData, typical_soreness_level: undefined })} className="text-[10px] text-text-muted hover:text-white">
                          Clear
                        </button>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={formData.typical_soreness_level}
                        onChange={(e) => setFormData({ ...formData, typical_soreness_level: parseInt(e.target.value) })}
                        className="w-full accent-warning cursor-pointer"
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ───────────────── STEP 5: EXERCISE READINESS ───────────────── */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="w-5 h-5 text-brand-light" />
                  <h2 className="text-xl sm:text-2xl font-black text-white">Exercise Readiness & Safety</h2>
                </div>
                <p className="text-xs sm:text-sm text-text-secondary">
                  Help Fortis safeguard your training. All fields in this step are optional.
                </p>
              </div>

              {/* Injury / Movement notes */}
              <div>
                <label className="fortis-label">Injuries or Movement Limitations (Optional)</label>
                <textarea
                  rows={2}
                  value={formData.injury_notes || ''}
                  onChange={(e) => setFormData({ ...formData, injury_notes: e.target.value })}
                  placeholder="e.g. Mild lower back sensitivity, recovering from right wrist sprain..."
                  className="fortis-input resize-none text-xs"
                />
              </div>

              {/* Exercises to avoid */}
              <div>
                <label className="fortis-label">Exercises or Movements to Avoid (Optional)</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={avoidInput}
                    onChange={(e) => setAvoidInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (avoidInput.trim() && !formData.exercises_to_avoid?.includes(avoidInput.trim())) {
                          setFormData({
                            ...formData,
                            exercises_to_avoid: [...(formData.exercises_to_avoid || []), avoidInput.trim()],
                          });
                          setAvoidInput('');
                        }
                      }
                    }}
                    placeholder="e.g. Overhead Press, Deep Squats (Press Enter)"
                    className="fortis-input flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (avoidInput.trim() && !formData.exercises_to_avoid?.includes(avoidInput.trim())) {
                        setFormData({
                          ...formData,
                          exercises_to_avoid: [...(formData.exercises_to_avoid || []), avoidInput.trim()],
                        });
                        setAvoidInput('');
                      }
                    }}
                    className="fortis-btn-secondary text-xs px-3"
                  >
                    Add
                  </button>
                </div>
                {formData.exercises_to_avoid && formData.exercises_to_avoid.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {formData.exercises_to_avoid.map((ex) => (
                      <button
                        type="button"
                        key={ex}
                        aria-label={`Remove ${ex}`}
                        onClick={() =>
                          setFormData({
                            ...formData,
                            exercises_to_avoid: formData.exercises_to_avoid?.filter((i) => i !== ex),
                          })
                        }
                        className="fortis-pill"
                      >
                        {ex} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Preferred Exercise Types */}
              <div>
                <label className="fortis-label">Preferred Exercise Styles</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['Full Body', 'Strength Splits', 'Cardio / HIIT', 'Mobility & Core'].map((style) => {
                    const selected = formData.preferred_exercise_types?.includes(style);
                    return (
                      <button
                        type="button"
                        key={style}
                        onClick={() => toggleArrayItem('preferred_exercise_types', style)}
                        className={`p-2.5 rounded-xl border text-left text-xs font-semibold flex items-center justify-between transition-all ${
                          selected
                            ? 'border-brand bg-brand/10 text-white'
                            : 'border-dark-border bg-dark-surface text-text-muted hover:text-white'
                        }`}
                      >
                        <span>{style}</span>
                        {selected && <Check className="w-3.5 h-3.5 text-brand-light shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="fortis-label">Strength Benchmarks (Optional, kg)</label>
                <p className="text-[10px] text-text-muted mb-2">
                  Add recent working weights if you know them. Leave blank if you are unsure.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { key: 'squat_kg', label: 'Squat' },
                    { key: 'bench_kg', label: 'Bench press' },
                    { key: 'deadlift_kg', label: 'Deadlift' },
                  ].map((lift) => (
                    <div key={lift.key}>
                      <label className="fortis-label text-xs" htmlFor={`benchmark-${lift.key}`}>
                        {lift.label} (kg)
                      </label>
                      <input
                        id={`benchmark-${lift.key}`}
                        type="number"
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
                          setFormData({ ...formData, strength_benchmarks: benchmarks });
                        }}
                        className="fortis-input"
                        placeholder="Not provided"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ───────────────── STEP 6: REVIEW & CREATE PLAN ───────────────── */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-5 h-5 text-brand" />
                  <h2 className="text-xl sm:text-2xl font-black text-white">Review & Generate Plans</h2>
                </div>
                <p className="text-xs sm:text-sm text-text-secondary">
                  Confirm your details below. Fortis will generate your personalized starter workout plan and nutrition blueprint.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <section className="fortis-card p-4 space-y-2">
                  <div className="flex items-center justify-between font-bold text-white">
                    <h3 className="text-brand-light">Personal Details</h3>
                    <button type="button" onClick={() => setCurrentStep(1)} className="text-[10px] text-brand hover:underline">
                      Edit
                    </button>
                  </div>
                  <p className="text-text-secondary">{formData.age} yrs · {formData.gender || 'Prefer not to say'}</p>
                  <p className="text-text-secondary">{formData.height_cm} cm · {formData.weight_kg} kg</p>
                  <p className="text-text-secondary">Region / country: <span className="text-white">{formData.regional_preference}</span></p>
                </section>

                <section className="fortis-card p-4 space-y-2">
                  <div className="flex items-center justify-between font-bold text-white">
                    <h3 className="text-brand-light">Fitness & Training</h3>
                    <button type="button" onClick={() => setCurrentStep(2)} className="text-[10px] text-brand hover:underline">
                      Edit
                    </button>
                  </div>
                  <p className="text-text-secondary">Goal: <span className="text-white">{formData.primary_goal?.replace(/_/g, ' ')}</span></p>
                  <p className="text-text-secondary">Experience: <span className="text-white">{formData.experience_level?.toLowerCase()}</span></p>
                  <p className="text-text-secondary">Location: <span className="text-white">{formData.workout_location}</span></p>
                  <p className="text-text-secondary">Equipment: <span className="text-white">{formData.equipment_list?.join(', ') || 'None selected'}</span></p>
                  <p className="text-text-secondary">{formData.days_per_week} days/week · {formData.workout_duration_min} min/session</p>
                </section>

                <section className="fortis-card p-4 space-y-2">
                  <div className="flex items-center justify-between font-bold text-white">
                    <h3 className="text-emerald-400">Nutrition</h3>
                    <button type="button" onClick={() => setCurrentStep(3)} className="text-[10px] text-emerald-400 hover:underline">
                      Edit
                    </button>
                  </div>
                  <p className="text-text-secondary">Diet: <span className="text-white">{formData.diet_type?.replace(/_/g, ' ')}</span></p>
                  <p className="text-text-secondary">Cuisine: <span className="text-white">{formData.preferred_cuisine}</span></p>
                  <p className="text-text-secondary">Allergies / restrictions: <span className="text-white">{formData.allergies?.join(', ') || 'None'}</span></p>
                  <p className="text-text-secondary">Budget: <span className="text-white">₹{formData.daily_budget_inr}/day</span> · {formData.meals_per_day} meals/day</p>
                  <p className="text-text-secondary">Cooking access: <span className="text-white">{formData.cooking_access}</span></p>
                </section>

                <section className="fortis-card p-4 space-y-2">
                  <div className="flex items-center justify-between font-bold text-white">
                    <h3 className="text-indigo-400">Lifestyle</h3>
                    <button type="button" onClick={() => setCurrentStep(4)} className="text-[10px] text-indigo-400 hover:underline">
                      Edit
                    </button>
                  </div>
                  <p className="text-text-secondary">Sleep: <span className="text-white">{formData.typical_sleep_hours} hours/night</span></p>
                  <p className="text-text-secondary">Activity: <span className="text-white">{formData.activity_level?.replace(/_/g, ' ')}</span></p>
                  <p className="text-text-secondary">Energy: <span className="text-white">{formData.typical_energy_level}/10</span> · Workout time: <span className="text-white">{formData.preferred_time}</span></p>
                  <p className="text-text-secondary">Stress: <span className="text-white">{formData.typical_stress_level ? `${formData.typical_stress_level}/10` : 'Not provided'}</span> · Soreness: <span className="text-white">{formData.typical_soreness_level ? `${formData.typical_soreness_level}/10` : 'Not provided'}</span></p>
                </section>

                <section className="fortis-card p-4 space-y-2 sm:col-span-2">
                  <div className="flex items-center justify-between font-bold text-white">
                    <h3 className="text-brand-light">Exercise Readiness</h3>
                    <button type="button" onClick={() => setCurrentStep(5)} className="text-[10px] text-brand hover:underline">
                      Edit
                    </button>
                  </div>
                  <p className="text-text-secondary">Injury / movement notes: <span className="text-white">{formData.injury_notes?.trim() || 'None provided'}</span></p>
                  <p className="text-text-secondary">Exercises to avoid: <span className="text-white">{formData.exercises_to_avoid?.join(', ') || 'None specified'}</span></p>
                  <p className="text-text-secondary">Preferred exercise types: <span className="text-white">{formData.preferred_exercise_types?.join(', ') || 'No preference'}</span></p>
                  <p className="text-text-secondary">
                    Strength benchmarks: <span className="text-white">
                      {Object.entries(formData.strength_benchmarks || {})
                        .filter(([, value]) => value !== undefined && value !== '')
                        .map(([lift, value]) => `${lift.replace('_kg', '').replace('_', ' ')} ${value} kg`)
                        .join(' · ') || 'Not provided'}
                    </span>
                  </p>
                </section>
              </div>

              {/* Disclaimer Note */}
              <div className="bg-brand/10 border border-brand/20 rounded-2xl p-4 text-xs text-text-secondary leading-relaxed flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-brand-light shrink-0 mt-0.5" />
                <span>
                  Your starter plans are generated from your saved profile without fabricating past history or scores. You can log real workouts and recovery to start building your actual Fortis Pulse.
                </span>
              </div>
            </div>
          )}

          {/* Footer Controls */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-dark-border">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                disabled={submitting}
                className="fortis-btn-secondary flex items-center gap-1.5 text-xs py-2.5 px-4"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-3">
              {currentStep === 5 && (
                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={submitting}
                  className="fortis-btn-ghost text-xs py-2.5 px-4"
                >
                  Skip for now
                </button>
              )}

              {currentStep < TOTAL_STEPS ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="fortis-btn-primary flex items-center gap-1.5 text-xs py-2.5 px-5"
                >
                  Continue
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="fortis-btn-primary flex items-center gap-2 text-sm py-3 px-6 shadow-glow"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating My Fitness Plan…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Create My Fitness Plan
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Branding */}
      {!isModal && (
        <div className="text-center text-xs text-text-muted mt-2 relative z-10">
          Fortis AI Adaptive Fitness System · Secure & Private
        </div>
      )}
    </div>
  );
};

export default Onboarding;
