import React from 'react';

type Reason = { rule_id: string; label: string; detail: string };
type Draft = { title: string; summary: string; reasons: Reason[]; original_duration_min: number; target_duration_min: number; estimated_duration_min: number; exercises: Array<{exercise_id:number;name:string;planned_sets:number;planned_reps:number;change?:string|null}>; changes: string[] };

export const DecisionExplanationCard: React.FC<{ draft: Draft; onAccept: () => void; onKeep: () => void; busy?: boolean }> = ({ draft, onAccept, onKeep, busy }) => (
  <section className="rounded-2xl border border-brand/30 bg-dark-card p-5 space-y-4" aria-labelledby="adapt-title">
    <div><p className="text-[11px] font-black tracking-widest text-brand-light">PROPOSED ALTERNATIVE</p><h2 id="adapt-title" className="text-lg font-black text-white">{draft.title}</h2><p className="text-sm text-text-secondary mt-1">{draft.summary}</p></div>
    <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-dark-surface p-2"><b className="block text-white">{draft.original_duration_min}m</b><span className="text-text-muted">Original</span></div><div className="rounded-lg bg-dark-surface p-2"><b className="block text-white">{draft.target_duration_min}m</b><span className="text-text-muted">Available</span></div><div className="rounded-lg bg-dark-surface p-2"><b className="block text-white">~{draft.estimated_duration_min}m</b><span className="text-text-muted">Estimate</span></div></div>
    <div><h3 className="text-sm font-bold text-white">Why this recommendation?</h3><ul className="mt-2 space-y-2">{draft.reasons.map((r) => <li key={r.rule_id} className="text-xs text-text-secondary"><b className="text-brand-light">{r.label}:</b> {r.detail}</li>)}</ul></div>
    <ol className="space-y-1.5">{draft.exercises.map((e) => <li key={`${e.exercise_id}-${e.name}`} className="flex justify-between gap-3 text-sm"><span className="text-white">{e.name}{e.change && <small className="block text-text-muted">{e.change}</small>}</span><span className="shrink-0 text-text-secondary">{e.planned_sets} × {e.planned_reps}</span></li>)}</ol>
    {draft.changes.length > 0 && <ul className="text-xs text-text-muted list-disc pl-4">{draft.changes.map((c) => <li key={c}>{c}</li>)}</ul>}
    <div className="flex gap-2"><button onClick={onAccept} disabled={busy} className="fortis-btn-primary flex-1 py-2.5 text-sm">{busy ? 'Saving…' : 'Accept and start'}</button><button onClick={onKeep} disabled={busy} className="fortis-btn-secondary flex-1 py-2.5 text-sm">Keep original</button></div>
  </section>
);
