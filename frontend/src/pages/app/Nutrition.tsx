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
import api from '../../services/api';

export const NutritionPage: React.FC = () => {
  const [summary, setSummary] = useState<any>(null);
  const [budget, setBudget] = useState(150);
  const [region, setRegion] = useState('Kerala');
  const [ingredientsInput, setIngredientsInput] = useState('Rice, Eggs, Banana, Dal');
  const [mealPlan, setMealPlan] = useState<any>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [groceryList, setGroceryList] = useState<any>(null);

  useEffect(() => {
    api.get('/api/nutrition/today')
      .then((res) => setSummary(res.data))
      .catch((err) => {
        console.error('Failed to load nutrition summary:', err);
      });
  }, []);

  const handleOptimizeBudget = () => {
    setOptimizing(true);
    api.post('/api/diet/generate', {
      daily_budget_inr: budget,
      goal: 'GENERAL_FITNESS',
      regional_preference: region,
      diet_type: 'non_vegetarian'
    })
      .then((res) => setMealPlan(res.data))
      .catch((err) => {
        console.error('Failed to generate diet plan:', err);
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

      {/* Daily Progress Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-dark-card border border-dark-border rounded-xl p-4 shadow-card">
          <span className="text-xs text-text-muted font-medium block">Total Calories</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-white">{summary?.total_calories || 0}</span>
            <span className="text-xs text-text-secondary">/ {summary?.target_calories || 2200} kcal</span>
          </div>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-xl p-4 shadow-card">
          <span className="text-xs text-text-muted font-medium block">Protein Intake</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-brand-light">{summary?.total_protein_g || 0}g</span>
            <span className="text-xs text-text-secondary">/ {summary?.target_protein_g || 130}g target</span>
          </div>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-xl p-4 shadow-card">
          <span className="text-xs text-text-muted font-medium block">Daily Target Budget</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-emerald-400">₹{summary?.budget_inr || 150}</span>
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
            <label className="fortis-label">Daily Budget (₹ INR)</label>
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

        {/* Optimized Plan Output */}
        {mealPlan && (
          <div className="bg-dark-surface border border-emerald-500/30 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-dark-border pb-3">
              <div>
                <h3 className="font-bold text-white text-base">Cost-Optimal Daily Schedule</h3>
                <span className="text-xs text-text-secondary">
                  Total Cost: <span className="text-emerald-400 font-bold">₹{mealPlan.total_cost_inr}</span> | Calories: {mealPlan.total_calories} kcal | Protein: {mealPlan.total_protein_g}g
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

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {Object.entries(mealPlan.meals || {}).map(([mealType, items]: [string, any]) => (
                <div key={mealType} className="bg-dark-card p-3 rounded-lg border border-dark-border">
                  <span className="font-bold text-brand-light block uppercase tracking-wider mb-2">{mealType}</span>
                  {items.map((it: any, idx: number) => (
                    <div key={idx} className="space-y-1">
                      <span className="font-semibold text-white block">{it.name}</span>
                      <div className="flex justify-between text-text-muted">
                        <span>{it.quantity_g}g</span>
                        <span className="text-emerald-400">₹{it.estimated_cost_inr}</span>
                      </div>
                      <div className="text-[10px] text-text-secondary">
                        {it.calories} kcal • {it.protein_g}g protein
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
              <h3 className="font-bold text-sm text-white">Weekly Grocery Estimate (₹{groceryList.total_estimated_cost})</h3>
              <span className="text-xs text-text-muted">Calculated from Kerala regional staples</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {groceryList.items?.map((item: any, i: number) => (
                <div key={i} className="flex justify-between p-2 bg-dark-surface rounded border border-dark-border/60">
                  <span className="font-medium text-white">{item.name} ({item.quantity} {item.unit})</span>
                  <span className="text-emerald-400 font-semibold">₹{item.estimated_cost_inr}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Today's Logged Items */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5 shadow-card">
        <h3 className="font-bold text-sm text-white mb-3">Today's Nutrition Logs</h3>
        <div className="space-y-2">
          {summary?.logs?.map((log: any) => (
            <div key={log.id} className="flex items-center justify-between p-3 bg-dark-surface rounded-lg text-xs">
              <div>
                <span className="font-semibold text-white block text-sm">{log.food_name}</span>
                <span className="text-text-muted">{log.meal_type} • {log.quantity_g}g</span>
              </div>
              <div className="text-right">
                <span className="font-bold text-white block">{log.calories} kcal</span>
                <span className="text-brand-light font-medium">{log.protein_g}g protein</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NutritionPage;
