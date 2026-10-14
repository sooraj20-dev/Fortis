import React, { useState, useRef, useCallback } from 'react';
import {
  Video,
  Camera,
  Upload,
  CheckCircle,
  AlertTriangle,
  Award,
  Sparkles,
  Info,
  Leaf,
  X,
  ImageIcon,
} from 'lucide-react';
import api from '../../services/api';

export const VisionPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'form' | 'food'>('form');
  const [selectedExercise, setSelectedExercise] = useState('squat');
  const [analyzing, setAnalyzing] = useState(false);
  const [formResult, setFormResult] = useState<any>(null);
  const [foodResult, setFoodResult] = useState<any>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [foodError, setFoodError] = useState<string | null>(null);
  const [foodPreview, setFoodPreview] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const foodInputRef = useRef<HTMLInputElement>(null);

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalyzing(true);
    setFormError(null);
    setFormResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('exercise_name', selectedExercise);

    try {
      const res = await api.post('/api/vision/exercise', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setFormResult(res.data);
    } catch (err: any) {
      setFormError(
        err?.response?.data?.detail ||
          'Failed to analyze exercise video. Please ensure a valid video file is uploaded.'
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const processFoodFile = async (file: File) => {
    setAnalyzing(true);
    setFoodError(null);
    setFoodResult(null);

    // Show preview immediately
    const previewUrl = URL.createObjectURL(file);
    setFoodPreview(previewUrl);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/api/vision/food', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setFoodResult(res.data);
    } catch (err: any) {
      setFoodError(
        err?.response?.data?.detail ||
          'Failed to classify food photograph. Please upload a clear JPG/PNG image.'
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFoodUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFoodFile(file);
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) {
        await processFoodFile(file);
      }
    },
    []
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const clearFood = () => {
    setFoodResult(null);
    setFoodError(null);
    setFoodPreview(null);
    if (foodInputRef.current) foodInputRef.current.value = '';
  };

  const confidencePct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Fortis Vision</h1>
        <p className="text-sm text-text-secondary mt-1">
          Pose estimation joint kinematics analysis &amp; AI-powered food recognition with nutritional analysis.
        </p>
      </div>

      {/* Mode Tabs */}
      <div className="flex gap-2 border-b border-dark-border pb-2">
        <button
          onClick={() => setActiveTab('form')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === 'form'
              ? 'bg-brand text-white shadow-glow'
              : 'text-text-secondary hover:text-white hover:bg-dark-hover'
          }`}
        >
          Exercise Form Pose Analysis
        </button>
        <button
          onClick={() => setActiveTab('food')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === 'food'
              ? 'bg-brand text-white shadow-glow'
              : 'text-text-secondary hover:text-white hover:bg-dark-hover'
          }`}
        >
          Food Vision AI
        </button>
      </div>

      {/* ── Exercise Form Tab ─────────────────────────────────────────── */}
      {activeTab === 'form' ? (
        <div className="bg-dark-card border border-dark-border rounded-2xl p-6 shadow-card space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="fortis-label">Select Exercise Model</label>
              <select
                value={selectedExercise}
                onChange={(e) => setSelectedExercise(e.target.value)}
                className="fortis-input"
              >
                <option value="squat">Bodyweight / Barbell Squat (Depth &amp; Knee Track)</option>
                <option value="pushup">Push-up (Body Alignment &amp; Elbow Angle)</option>
                <option value="curl">Bicep Curl (Elbow Pinning &amp; ROM)</option>
              </select>
            </div>

            <div className="flex items-end">
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                onChange={handleVideoUpload}
                className="hidden"
              />
              <button
                onClick={() => videoInputRef.current?.click()}
                disabled={analyzing}
                className="fortis-btn-primary w-full py-2.5 flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>{analyzing ? 'Extracting Pose Landmarks...' : 'Upload Video File for Analysis'}</span>
              </button>
            </div>
          </div>

          {formError && (
            <div className="p-3 bg-danger/10 border border-danger/30 rounded-xl text-danger text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {formResult && (
            <div className="bg-dark-surface border border-brand/30 rounded-xl p-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-dark-border pb-4">
                <div>
                  <span className="text-xs font-semibold text-brand-light uppercase tracking-wider">
                    Evaluation Result
                  </span>
                  <h3 className="text-xl font-bold text-white capitalize">
                    {formResult.exercise} Biomechanics
                  </h3>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-xs text-text-muted block">Form Score</span>
                    <span className="text-2xl font-black text-success">
                      {formResult.form_score} / 100
                    </span>
                  </div>
                  <Award className="w-8 h-8 text-success" />
                </div>
              </div>

              {/* Subscores Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {Object.entries(formResult.breakdown || {}).map(([k, v]: [string, any]) => (
                  <div key={k} className="p-3 bg-dark-card rounded-lg border border-dark-border">
                    <span className="text-text-muted capitalize block">{k.replace('_', ' ')}</span>
                    <span className="text-lg font-bold text-white">{v}</span>
                  </div>
                ))}
              </div>

              {/* Feedback */}
              <div className="space-y-2 text-xs">
                <h4 className="font-bold text-text-secondary uppercase tracking-wider">
                  Algorithmic Kinematic Feedback
                </h4>
                {formResult.feedback?.map((f: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-gray-300">
                    <span>{f}</span>
                  </div>
                ))}
              </div>

              {formResult.primary_improvement && (
                <div className="p-3 bg-dark-card border border-brand/20 rounded-lg text-xs text-text-secondary">
                  <span className="font-semibold text-brand-light block mb-0.5">
                    Primary Target for Form Correction:
                  </span>
                  {formResult.primary_improvement}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ── Food Vision Tab ────────────────────────────────────────────── */
        <div className="bg-dark-card border border-dark-border rounded-2xl p-6 shadow-card space-y-6">

          {/* Upload / Drop Zone */}
          {!foodPreview ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-xl p-10 text-center space-y-3 transition-colors cursor-pointer ${
                isDragOver
                  ? 'border-brand bg-brand/5'
                  : 'border-dark-border hover:border-brand/40'
              }`}
              onClick={() => foodInputRef.current?.click()}
            >
              <div className="w-14 h-14 rounded-full bg-dark-surface border border-dark-border flex items-center justify-center mx-auto text-brand-light">
                {isDragOver ? <Sparkles className="w-7 h-7" /> : <Camera className="w-7 h-7" />}
              </div>
              <h3 className="font-bold text-white text-base">
                {isDragOver ? 'Drop image to analyze' : 'Upload or Drop Food Photograph'}
              </h3>
              <p className="text-xs text-text-muted max-w-sm mx-auto">
                Powered by Google Gemini Vision AI. Supports Indian, Kerala, and global cuisine.
                Works with any food photo — rice, curry, snacks, beverages.
              </p>
              <input
                ref={foodInputRef}
                type="file"
                accept="image/*"
                onChange={handleFoodUpload}
                className="hidden"
              />
              <button
                disabled={analyzing}
                className="fortis-btn-secondary text-xs py-2 px-5 inline-flex items-center gap-2"
                onClick={(e) => { e.stopPropagation(); foodInputRef.current?.click(); }}
              >
                <Upload className="w-4 h-4" />
                <span>Select Image File</span>
              </button>
              <p className="text-[11px] text-text-muted">JPEG · PNG · WebP · max 10 MB</p>
            </div>
          ) : (
            /* ── Image Preview + Result ─────────────────────────────── */
            <div className="space-y-4">
              {/* Preview header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <ImageIcon className="w-4 h-4" />
                  <span>Uploaded food image</span>
                </div>
                <button
                  onClick={clearFood}
                  className="text-xs text-text-muted hover:text-white flex items-center gap-1 transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Clear &amp; upload new
                </button>
              </div>

              {/* Image Preview */}
              <div className="rounded-xl overflow-hidden border border-dark-border max-h-72 flex items-center justify-center bg-dark-surface">
                <img
                  src={foodPreview}
                  alt="Food preview"
                  className="max-h-72 object-contain w-full"
                />
              </div>

              {/* Analyzing spinner */}
              {analyzing && (
                <div className="flex items-center gap-3 p-4 bg-dark-surface border border-brand/20 rounded-xl">
                  <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-text-secondary">
                    Analyzing with Gemini Vision AI — identifying food and estimating nutrition...
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {foodError && (
            <div className="p-3 bg-danger/10 border border-danger/30 rounded-xl text-danger text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{foodError}</span>
            </div>
          )}

          {/* Result Card */}
          {foodResult && !analyzing && (
            <div className="bg-dark-surface border border-emerald-500/30 rounded-xl p-5 space-y-4">

              {/* Top Prediction */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-dark-border pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">
                      Gemini AI Identified
                    </span>
                    {foodResult.top_prediction?.is_healthy === true && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">
                        <Leaf className="w-3 h-3" /> Healthy
                      </span>
                    )}
                    {foodResult.top_prediction?.is_healthy === false && (
                      <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full">
                        Indulgent
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-white">
                    {foodResult.top_prediction?.name}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    <span>{foodResult.top_prediction?.region} Cuisine</span>
                    <span className="text-dark-border">·</span>
                    <span className="text-emerald-400 font-semibold">
                      {confidencePct(foodResult.top_prediction?.confidence || 0)} confidence
                    </span>
                  </div>
                  {foodResult.top_prediction?.note && (
                    <p className="text-xs text-text-secondary italic mt-1">
                      {foodResult.top_prediction.note}
                    </p>
                  )}
                </div>

                {/* Alternatives */}
                {foodResult.alternatives?.length > 0 && (
                  <div className="shrink-0 space-y-1">
                    <span className="text-[10px] text-text-muted uppercase font-semibold">Also possible</span>
                    {foodResult.alternatives.map((alt: any, i: number) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-text-secondary">{alt.name}</span>
                        <span className="text-text-muted">{confidencePct(alt.confidence)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Nutrition Estimate */}
              {foodResult.nutrition_estimate && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                      Nutritional Breakdown
                    </h4>
                    <span className="text-[11px] text-text-muted">
                      {foodResult.nutrition_estimate.serving_description || `~${foodResult.nutrition_estimate.serving_g}g serving`}
                    </span>
                  </div>

                  {/* Primary macros */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-dark-card rounded-lg border border-dark-border text-center">
                      <span className="text-text-muted block mb-0.5">Calories</span>
                      <span className="text-lg font-bold text-white">
                        {foodResult.nutrition_estimate.calories}
                      </span>
                      <span className="text-text-muted text-[10px]"> kcal</span>
                    </div>
                    <div className="p-3 bg-dark-card rounded-lg border border-dark-border text-center">
                      <span className="text-text-muted block mb-0.5">Protein</span>
                      <span className="text-lg font-bold text-brand-light">
                        {foodResult.nutrition_estimate.protein_g}g
                      </span>
                    </div>
                    <div className="p-3 bg-dark-card rounded-lg border border-dark-border text-center">
                      <span className="text-text-muted block mb-0.5">Carbs</span>
                      <span className="text-lg font-bold text-white">
                        {foodResult.nutrition_estimate.carbs_g}g
                      </span>
                    </div>
                    <div className="p-3 bg-dark-card rounded-lg border border-dark-border text-center">
                      <span className="text-text-muted block mb-0.5">Fat</span>
                      <span className="text-lg font-bold text-white">
                        {foodResult.nutrition_estimate.fat_g}g
                      </span>
                    </div>
                  </div>

                  {/* Secondary macros */}
                  {(foodResult.nutrition_estimate.fiber_g > 0 || foodResult.nutrition_estimate.sugar_g > 0) && (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {foodResult.nutrition_estimate.fiber_g > 0 && (
                        <div className="p-2.5 bg-dark-card rounded border border-dark-border flex items-center justify-between">
                          <span className="text-text-muted">Dietary Fiber</span>
                          <span className="font-semibold text-white">
                            {foodResult.nutrition_estimate.fiber_g}g
                          </span>
                        </div>
                      )}
                      {foodResult.nutrition_estimate.sugar_g > 0 && (
                        <div className="p-2.5 bg-dark-card rounded border border-dark-border flex items-center justify-between">
                          <span className="text-text-muted">Sugar</span>
                          <span className="font-semibold text-white">
                            {foodResult.nutrition_estimate.sugar_g}g
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Data source */}
                  <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Data source: <strong className="text-text-secondary">{foodResult.nutrition_estimate.source}</strong>.{' '}
                      {foodResult.disclaimer}
                    </span>
                  </div>
                </div>
              )}

              {/* Log CTA */}
              <div className="pt-2 border-t border-dark-border flex items-center justify-between gap-3">
                <p className="text-xs text-text-muted">{foodResult.confirm_prompt}</p>
                <button
                  className="fortis-btn-primary text-xs py-2 px-4 shrink-0 flex items-center gap-1.5"
                  onClick={() => {
                    // TODO: wire up to nutrition logging endpoint
                    alert('Food logging endpoint coming soon!');
                  }}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Log This Meal
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VisionPage;
