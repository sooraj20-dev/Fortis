import React, { useEffect, useState } from 'react';
import { 
  Utensils, 
  Wallet, 
  Sparkles, 
  Search, 
  Plus, 
  Check, 
  ListPlus,
  AlertCircle
} from 'lucide-react';
import api, { getCached } from '../../services/api';

export const NutritionPage: React.FC = () => {
  const [summary, setSummary] = useState<any>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [budget, setBudget] = useState(150);
  const [region, setRegion] = useState('Kerala');
  const [ingredientsInput, setIngredientsInput] = useState('Rice, Eggs, Banana, Dal');
  const [mealPlan, setMealPlan] = useState<any>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optError, setOptError] = useState<string | null>(null);
  const [groceryList, setGroceryList] = useState<any>(null);

  useEffect(() => {
    getCached<any>('/api/nutrition/today')
      .then((res) => {
        setSummary(res.data);
        if (res.data?.budget_inr != null) {
          setBudget(res.data.budget_inr);
        }
        if (res.data?.regional_preference) setRegion(res.data.regional_preference);
      })
      .catch((err) => {
        console.error('Failed to load nutrition summary:', err);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleOptimizeBudget = () => {
    setOptimizing(true);
    setOptError(null);
    api.post('/api/diet/generate', {
      daily_budget_inr: budget,
      goal: summary?.goal,
      regional_preference: region,
      diet_type: summary?.diet_type,
      allergies: summary?.allergies || [],
    })
      .then((res) => setMealPlan(res.data))
      .catch((err) => {
        console.error('Failed to generate diet plan:', err);
        setOptError('Failed to generate optimal plan. Please adjust your budget or region and try again.');
      })
      .finally(() => setOptimizing(false));
  };

  const handleGenerateGrocery = () => {
    api.post('/api/grocery-list/generate')
      .then((res) => setGroceryList(res.data))
      .catch((err) => {
        console.error('Failed to generate grocery list:', err);
      });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
          Regional Nutrition Intelligence
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Constraint-based optimization prioritizing authentic Kerala & Indian diets within budget.
        </p>
      </div>

      {loadError && <div role="alert" className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-300">Nutrition data could not be loaded. <button className="underline" onClick={() => { setLoading(true); setLoadError(false); getCached<any>('/api/nutrition/today').then((res) => setSummary(res.data)).catch(() => setLoadError(true)).finally(() => setLoading(false)); }}>Retry</button></div>}
      {loading && <div className="text-sm text-text-muted" aria-live="polite">Loading nutrition dataâ€¦</div>}

      {/* Daily Progress Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-dark-card border border-dark-border rounded-xl p-4 shadow-card">
          <span className="text-xs text-text-muted font-medium block">Total Calories</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-white">{summary?.total_calories ?? 'â€”'}</span>
            <span className="text-xs text-text-secondary">/ {summary?.target_calories ?? 'â€”'} kcal target</span>
          </div>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-xl p-4 shadow-card">
          <span className="text-xs text-text-muted font-medium block">Protein Intake</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-brand-light">{summary?.total_protein_g ?? 'â€”'}{summary ? 'g' : ''}</span>
            <span className="text-xs text-text-secondary">/ {summary?.target_protein_g ?? 'â€”'}g target</span>
          </div>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-xl p-4 shadow-card">
          <span className="text-xs text-text-muted font-medium block">Daily Target Budget</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-emerald-400">â‚¹{summary?.budget_inr ?? 'â€”'}</span>
            <span className="text-xs text-text-secondary">per day</span>
          </div>
        </div>
      </div>

      {/* Budget Optimizer Section */}
      <div className="bg-dark-card border border-dark-border rounded-2xl p-6 shadow-card space-y-6">
        <div className="flex items-center gap-2 border-b border-dark-border pb-3">
          <Wallet className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-bold text-white">Smart Budget Nutrition Optimizer</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="fortis-label">Daily Budget (â‚¹ INR)</label>
            <input 
              type="number" 
              value={budget} 
              onChange={(e) => setBudget(Number(e.target.value))}
              className="fortis-input"
            />
          </div>
          <div>
            <label className="fortis-label">Regional Profile</label>
            <select 
              value={region} 
              onChange={(e) => setRegion(e.target.value)}
              className="fortis-input"
            >
              <option value="Kerala">Kerala (Puttu, Fish, Matta Rice)</option>
              <option value="South India">Tamil Nadu / South Indian</option>
              <option value="General">Pan-Indian (Dal, Roti, Paneer)</option>
            </select>
          </div>
          <div className="flex items-end">
            <button 
              onClick={handleOptimizeBudget}
              disabled={optimizing}
              className="fortis-btn-primary w-full py-2.5 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>{optimizing ? 'Calculating...' : 'Optimize Daily Meal Plan'}</span>
            </button>
          </div>
        </div>

        {optError && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{optError}</span>
          </div>
        )}

        {/* Optimized Plan Output */}
        {mealPlan && (
          <div className="bg-dark-surface border border-emerald-500/30 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-dark-border pb-3">
              <div>
                <h3 className="font-bold text-white text-base">Cost-Optimal Daily Schedule</h3>
                <span className="text-xs text-text-secondary">
                  Budget: <span className="text-white font-medium">â‚¹{mealPlan.target_budget_inr ?? budget}</span> | Total Cost: <span className="text-emerald-400 font-bold">â‚¹{mealPlan.total_cost_inr}</span> | Calories: {mealPlan.total_calories} / {mealPlan.target_calories} kcal | Protein: {mealPlan.total_protein_g} / {mealPlan.target_protein_g}g
                </span>
              </div>
              <button 
                onClick={handleGenerateGrocery}
                className="fortis-btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 self-start"
              >
                <ListPlus className="w-3.5 h-3.5" />
                <span>Build Weekly Grocery List</span>
              </button>
            </div>

            {mealPlan.explanation && (
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{mealPlan.explanation}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {Object.entries(mealPlan.meals || {}).map(([mealType, items]: [string, any]) => (
                <div key={mealType} className="bg-dark-card p-3 rounded-lg border border-dark-border">
                  <span className="font-bold text-brand-light block uppercase tracking-wider mb-2">{mealType}</span>
                  {items.map((it: any, idx: number) => (
                    <div key={idx} className="space-y-1">
                      <span className="font-semibold text-white block">{it.name}</span>
                      <div className="flex justify-between text-text-muted">
                        <span>{it.quantity_g}g</span>
                        <span className="text-emerald-400">â‚¹{it.estimated_cost_inr}</span>
                      </div>
                      <div className="text-[10px] text-text-secondary">
                        {it.calories} kcal â€¢ {it.protein_g}g protein
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weekly Grocery List Display */}
        {groceryList && (
          <div className="bg-dark-card border border-brand/30 rounded-xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm text-white">Weekly Grocery Estimate (â‚¹{groceryList.total_estimated_cost})</h3>
              <span className="text-xs text-text-muted">Calculated from Kerala regional staples</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {groceryList.items?.map((item: any, i: number) => (
                <div key={i} className="flex justify-between p-2 bg-dark-surface rounded border border-dark-border/60">
                  <span className="font-medium text-white">{item.name} ({item.quantity} {item.unit})</span>
                  <span className="text-emerald-400 font-semibold">â‚¹{item.estimated_cost_inr}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Today's Logged Items */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5 shadow-card">
        <h3 className="font-bold text-sm text-white mb-3">Today's Nutrition Logs</h3>
        {summary?.logs && summary.logs.length > 0 ? (
          <div className="space-y-2">
            {summary.logs.map((log: any) => (
              <div key={log.id} className="flex items-center justify-between p-3 bg-dark-surface rounded-lg text-xs">
                <div>
                  <span className="font-semibold text-white block text-sm">{log.food_name}</span>
                  <span className="text-text-muted">{log.meal_type} â€¢ {log.quantity_g}g</span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-white block">{log.calories} kcal</span>
                  <span className="text-brand-light font-medium">{log.protein_g}g protein</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 border border-dashed border-dark-border rounded-lg">
            <Utensils className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-50" />
            <p className="text-xs text-text-muted">No meals logged yet today.</p>
            <p className="text-[11px] text-text-secondary mt-1">Scan a meal using Food Vision or log from the meal plan to track actual nutrition intake.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NutritionPage;
