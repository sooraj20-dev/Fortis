import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  User, Target, Dumbbell, Utensils, Calendar, AlertTriangle, ShieldAlert, Check, X, Loader2,
  ChevronRight, LogOut, Activity, Heart, Camera, Upload, Trash2, Image as ImageIcon, Pencil, Plus,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { getProfile, updateProfile, uploadAvatar } from '../../services/profileApi';
import type { FullProfile, ProfileUpdateRequest } from '../../types';
import SplashScreen from '../../components/SplashScreen';

// ─── Public-folder & preset avatar images ─────────────────────
const PUBLIC_IMAGES = [
  '/landing_imgs/coach.png',
  '/landing_imgs/hero.png',
  '/landing_imgs/hero_pose.png',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80',
  'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=400&q=80',
  'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&q=80',
];

function useLoadableImages(list: string[]) {
  const [ok, setOk] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    list.forEach((src) => {
      const img = new Image();
      img.onload = () => alive && setOk((o) => (o.includes(src) ? o : [...o, src]));
      img.src = src;
    });
    return () => { alive = false; };
  }, [list]);
  return ok;
}

// ─── Labels ───────────────────────────────────────────────────
const GOALS: Record<string, string> = {
  STRENGTH: 'Strength', MUSCLE: 'Muscle building', GENERAL_FITNESS: 'General fitness', ENDURANCE: 'Endurance',
  WEIGHT_MANAGEMENT: 'Weight management', SPORTS: 'Sports performance', MOBILITY: 'Mobility',
};
const EXP: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };
const ACTIVITY: Record<string, string> = {
  SEDENTARY: 'Sedentary', LIGHTLY_ACTIVE: 'Lightly active', MODERATELY_ACTIVE: 'Moderately active',
  VERY_ACTIVE: 'Very active', EXTREMELY_ACTIVE: 'Extremely active',
};
const DIETS: Record<string, string> = {
  VEGETARIAN: 'Vegetarian', VEGAN: 'Vegan', NON_VEG: 'Non-vegetarian', EGGETARIAN: 'Eggetarian',
  KETO: 'Keto', PALEO: 'Paleo', MEDITERRANEAN: 'Mediterranean',
};
const GENDERS: Record<string, string> = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other', PREFER_NOT_TO_SAY: 'Prefer not to say' };
const TIMES: Record<string, string> = { MORNING: 'Morning', AFTERNOON: 'Afternoon', EVENING: 'Evening', NIGHT: 'Night' };
const PLACES: Record<string, string> = { HOME: 'Home', GYM: 'Gym', OUTDOOR: 'Outdoor' };

const fmt = (v: any, unit = '') => (v != null && v !== '' ? `${v}${unit}` : 'Add');
const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));

// ─── Image helpers ────────────────────────────────────────────
function resizeToSquare(file: File, size = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* storage full or blocked */ } },
};

// ─── Inline editable field: click, edit, Enter to save ────────
function Field({ label, value, display, onSave, type = 'text', options, unit, highlight, wide }: {
  label: string; value: any; display?: string; onSave: (v: any) => Promise<void>;
  type?: 'text' | 'number'; options?: { value: string; label: string }[]; unit?: string; highlight?: boolean; wide?: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<any>(value ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (edit) ref.current?.focus(); }, [edit]);

  const commit = async (v: any) => {
    const next = type === 'number' ? (v === '' ? undefined : Number(v)) : v;
    if (next === value || (next === undefined && (value == null || value === ''))) { setEdit(false); return; }
    setBusy(true); setErr(null);
    try { await onSave(next); setEdit(false); } catch { setErr('Could not save. Try again.'); } finally { setBusy(false); }
  };
  const open = () => { setDraft(value ?? ''); setErr(null); setEdit(true); };
  const shown = display ?? fmt(value, unit ? ` ${unit}` : '');

  return (
    <div className={`group bg-dark-surface border rounded-xl p-3 transition ${edit ? 'border-brand/60 shadow-glow' : 'border-dark-border hover:border-brand/30'} ${wide ? 'col-span-2' : ''}`}>
      <p className="text-[11px] text-text-muted font-bold mb-1">{label}</p>
      {!edit ? (
        <button onClick={open} className="w-full flex items-center justify-between gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded">
          <span className={`text-base font-black ${shown === 'Add' ? 'text-text-muted font-semibold' : highlight ? 'text-brand-light' : 'text-white'}`}>{shown}</span>
          <Pencil className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition" />
        </button>
      ) : options ? (
        <select autoFocus value={draft} disabled={busy} onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
          onBlur={() => !busy && setEdit(false)} className="fortis-input text-sm bg-dark-surface">
          {!value && <option value="">Select…</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <div className="flex items-center gap-1.5">
          <input ref={ref} type={type} value={draft} disabled={busy} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(draft); if (e.key === 'Escape') setEdit(false); }}
            className="fortis-input text-sm min-w-0" />
          {unit && <span className="text-xs text-text-muted">{unit}</span>}
          <button onClick={() => commit(draft)} disabled={busy} aria-label="Save" className="w-8 h-8 shrink-0 rounded-lg bg-brand text-white flex items-center justify-center active:scale-90 transition">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </button>
          <button onClick={() => setEdit(false)} aria-label="Cancel" className="w-8 h-8 shrink-0 rounded-lg border border-dark-border text-text-muted hover:text-white flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
      )}
      {err && <p className="text-[11px] text-red-400 mt-1">{err}</p>}
    </div>
  );
}

// ─── Tap-to-choose chips: saves immediately ───────────────────
function ChoiceChips({ label, value, options, onSave }: {
  label: string; value?: string; options: { value: string; label: string }[]; onSave: (v: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const pick = async (v: string) => {
    if (v === value) return;
    setBusy(v); setErr(false);
    try { await onSave(v); } catch { setErr(true); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-text-secondary">{label}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => pick(o.value)}
            className={`text-xs font-bold px-3.5 py-2 rounded-full border transition active:scale-95 flex items-center gap-1.5 ${value === o.value ? 'bg-brand text-white border-brand shadow-glow' : 'bg-dark-surface text-text-secondary border-dark-border hover:border-brand/40'}`}>
            {busy === o.value && <Loader2 className="w-3 h-3 animate-spin" />}{o.label}
          </button>
        ))}
      </div>
      {err && <p className="text-[11px] text-red-400">Could not save. Try again.</p>}
    </div>
  );
}

// ─── Chip list you can add to and remove from at any time ─────
function ChipEditor({ label, items = [], placeholder, suggestions = [], tone = 'brand', onSave }: {
  label: string; items?: string[]; placeholder: string; suggestions?: string[]; tone?: 'brand' | 'warn';
  onSave: (v: string[]) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const apply = async (next: string[]) => {
    setBusy(true); setErr(false);
    try { await onSave(next); } catch { setErr(true); } finally { setBusy(false); }
  };
  const add = (raw: string) => {
    const v = raw.trim();
    if (!v || items.some((i) => i.toLowerCase() === v.toLowerCase())) { setText(''); return; }
    setText(''); apply([...items, v]);
  };
  const cls = tone === 'warn' ? 'bg-warning/10 text-warning border-warning/25' : 'bg-brand/10 text-brand-light border-brand/20';
  const open = suggestions.filter((s) => !items.some((i) => i.toLowerCase() === s.toLowerCase()));

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-text-secondary">{label}</p>
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.length === 0 && <span className="text-xs text-text-muted">Nothing added yet.</span>}
        {items.map((t) => (
          <span key={t} className={`text-xs pl-2.5 pr-1 py-1 rounded-full border font-medium inline-flex items-center gap-1 ${cls}`}>
            {t}
            <button onClick={() => apply(items.filter((i) => i !== t))} aria-label={`Remove ${t}`} className="w-4 h-4 rounded-full hover:bg-white/10 flex items-center justify-center"><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text); } }} className="fortis-input text-sm" />
        <button onClick={() => add(text)} disabled={!text.trim()} aria-label={`Add to ${label}`} className="fortis-btn-secondary px-3 disabled:opacity-40"><Plus className="w-4 h-4" /></button>
      </div>
      {open.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {open.slice(0, 6).map((s) => (
            <button key={s} onClick={() => add(s)} className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-dark-border text-text-muted hover:text-brand-light hover:border-brand/40 transition">+ {s}</button>
          ))}
        </div>
      )}
      {err && <p className="text-[11px] text-red-400">Could not save. Try again.</p>}
    </div>
  );
}

// ─── BMI gauge ────────────────────────────────────────────────
function BmiGauge({ weight, height }: { weight?: number; height?: number }) {
  if (!weight || !height) return <p className="text-xs text-text-muted">Add height and weight to see your BMI.</p>;
  const v = weight / Math.pow(height / 100, 2);
  const pos = Math.min(100, Math.max(0, ((v - 15) / 25) * 100));
  const cat = v < 18.5 ? ['Underweight', 'text-warning'] : v < 25 ? ['Healthy', 'text-success'] : v < 30 ? ['Overweight', 'text-warning'] : ['Obese', 'text-danger'];
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-black text-white tabular-nums">{v.toFixed(1)}</span>
        <span className={`text-xs font-bold ${cat[1]}`}>{cat[0]}</span>
      </div>
      <div className="relative h-2.5 rounded-full overflow-hidden flex">
        <span className="bg-warning/60" style={{ width: '14%' }} /><span className="bg-success/70" style={{ width: '26%' }} />
        <span className="bg-warning/60" style={{ width: '20%' }} /><span className="bg-danger/60 flex-1" />
      </div>
      <div className="relative h-3">
        <span className="absolute -top-1 w-3 h-3 rounded-full bg-white border-2 border-brand shadow transition-all duration-700" style={{ left: `calc(${pos}% - 6px)` }} />
      </div>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-dark-card border border-dark-border rounded-2xl p-5 space-y-4 shadow-card">
      <h2 className="text-sm font-black text-white flex items-center gap-2"><span className="text-brand">{icon}</span>{title}</h2>
      {children}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────
type TabId = 'body' | 'goals' | 'training' | 'nutrition' | 'health';
const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'body', label: 'Body', icon: <User className="w-4 h-4" /> },
  { id: 'goals', label: 'Goals', icon: <Target className="w-4 h-4" /> },
  { id: 'training', label: 'Training', icon: <Calendar className="w-4 h-4" /> },
  { id: 'nutrition', label: 'Nutrition', icon: <Utensils className="w-4 h-4" /> },
  { id: 'health', label: 'Health', icon: <ShieldAlert className="w-4 h-4" /> },
];

export const ProfilePage: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('body');
  const [toast, setToast] = useState<string | null>(null);

  const updateUser = useAuthStore((s) => s.updateUser);
  const avatarKey = `fortis_avatar_${user?.email || 'me'}`;
  const bannerKey = `fortis_banner_${user?.email || 'me'}`;
  const [avatar, setAvatar] = useState<string | null>(() => user?.avatar_url || store.get(avatarKey));
  const [banner, setBanner] = useState<string | null>(() => store.get(bannerKey));
  const [customize, setCustomize] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const images = useLoadableImages(useMemo(() => PUBLIC_IMAGES, []));

  useEffect(() => {
    getProfile()
      .then((res) => {
        setProfile(res);
        const serverAvatar = res.avatar_url || res.profile?.avatar_url;
        if (serverAvatar) {
          setAvatar(serverAvatar);
          store.set(avatarKey, serverAvatar);
          updateUser({ avatar_url: serverAvatar });
        } else {
          const local = store.get(avatarKey);
          if (local) {
            setAvatar(local);
            updateUser({ avatar_url: local });
          }
        }
      })
      .catch(() => setError('Could not load profile. Please try again.'))
      .finally(() => setLoading(false));
  }, [avatarKey, updateUser]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // Every field/chip saves through here. Throws on failure so the control can show its own error.
  const save = async (patch: Record<string, any>) => {
    const updated = await updateProfile(patch as ProfileUpdateRequest);
    setProfile(updated);
    setToast('Saved');
  };
  const field = (key: string) => (v: any) => save({ [key]: v });

  const updateAvatarImage = async (urlOrData: string | null) => {
    setAvatar(urlOrData);
    store.set(avatarKey, urlOrData);
    updateUser({ avatar_url: urlOrData || undefined });
    try {
      await updateProfile({ avatar_url: urlOrData || '' });
    } catch (e) {
      console.warn('Backend avatar update notice:', e);
    }
  };

  const onPhoto = async (f?: File | null) => {
    if (!f) return;
    setPhotoErr(null);
    if (!f.type.startsWith('image/')) {
      setPhotoErr('Choose an image file.');
      return;
    }
    try {
      // 1. Try uploading to backend file storage first
      try {
        const res = await uploadAvatar(f);
        if (res.avatar_url) {
          await updateAvatarImage(res.avatar_url);
          setToast('Profile image updated');
          return;
        }
      } catch (uploadErr) {
        console.warn('Upload endpoint notice, storing resized image:', uploadErr);
      }

      // 2. Resized square base64 fallback
      const data = await resizeToSquare(f);
      await updateAvatarImage(data);
      setToast('Profile image updated');
    } catch {
      setPhotoErr('That image could not be read. Try another.');
    }
  };

  const setAvatarFromPublic = async (src: string) => {
    await updateAvatarImage(src);
    setToast('Profile image updated');
  };

  const setBannerFrom = (src: string | null) => {
    setBanner(src);
    store.set(bannerKey, src);
    setToast(src ? 'Cover updated' : 'Cover removed');
  };

  const removeAvatar = async () => {
    await updateAvatarImage(null);
    setToast('Profile image removed');
  };

  if (loading) {
    return <SplashScreen isLoader message="Loading your profile…" />;
  }
  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-8 text-center space-y-3 bg-dark-card border border-dark-border rounded-2xl">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
        <p className="text-sm text-text-secondary">{error}</p>
        <button onClick={() => window.location.reload()} className="fortis-btn-primary py-2 px-5 text-xs">Retry</button>
      </div>
    );
  }

  const p = profile?.profile, g = profile?.goal, eq = profile?.equipment, sched = profile?.schedule, nutr = profile?.nutrition_pref;
  const initials = (user?.name || 'U').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  // Profile completeness
  const checks = [p?.age, p?.height_cm, p?.weight_kg, p?.gender, p?.activity_level, g?.primary_goal, g?.experience_level,
    sched?.days_per_week, sched?.workout_duration_min, (eq?.equipment_list?.length ?? 0) > 0, nutr?.diet_type, nutr?.daily_budget_inr];
  const complete = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const ring = 2 * Math.PI * 46;

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-fade-in">
      <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />

      {/* ── Hero ── */}
      <div className="bg-dark-card border border-dark-border rounded-2xl overflow-hidden shadow-card">
        <div className="relative h-36 sm:h-44 bg-gradient-to-br from-brand/40 via-dark-surface to-dark-card">
          {banner && <img src={banner} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-dark-card via-dark-card/30 to-transparent" />
          <button onClick={() => setCustomize((c) => !c)} aria-expanded={customize}
            className="absolute top-3 right-3 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-dark-bg/70 border border-dark-border text-text-secondary hover:text-white hover:border-brand/50 backdrop-blur transition">
            <ImageIcon className="w-3.5 h-3.5" />{customize ? 'Done' : 'Customise'}
          </button>
        </div>

        <div className="px-5 pb-5 -mt-14 flex flex-col sm:flex-row sm:items-end gap-4">
          {/* Avatar with completeness ring */}
          <button onClick={() => setCustomize(true)} aria-label="Change profile photo" className="relative shrink-0 w-28 h-28 group self-center sm:self-auto rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="46" fill="none" stroke="#1e1e2e" strokeWidth="4" />
              <circle cx="50" cy="50" r="46" fill="none" stroke="#f97316" strokeWidth="4" strokeLinecap="round"
                strokeDasharray={ring} strokeDashoffset={ring - (complete / 100) * ring} style={{ transition: 'stroke-dashoffset 1s ease' }} />
            </svg>
            <div className="absolute inset-2.5 rounded-full overflow-hidden bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center shadow-glow">
              {avatar ? <img src={avatar} alt="Your profile" className="w-full h-full object-cover object-top" />
                : <span className="text-3xl font-black text-white select-none">{initials}</span>}
              <span className="absolute inset-0 bg-dark-bg/60 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition flex items-center justify-center"><Camera className="w-6 h-6 text-white" /></span>
            </div>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-black px-2 py-0.5 rounded-full bg-dark-card border border-brand/40 text-brand-light">{complete}%</span>
          </button>

          <div className="flex-1 min-w-0 text-center sm:text-left sm:pb-1">
            <h1 className="text-2xl font-black text-white truncate">{user?.name || 'Your profile'}</h1>
            <p className="text-sm text-text-muted truncate">{user?.email}</p>
            <div className="flex flex-wrap gap-2 mt-2.5 justify-center sm:justify-start">
              {g?.primary_goal && <span className="fortis-pill">{GOALS[g.primary_goal] || g.primary_goal}</span>}
              {g?.experience_level && <span className="text-xs font-bold px-3 py-1 rounded-full bg-dark-surface border border-dark-border text-text-secondary">{EXP[g.experience_level] || g.experience_level}</span>}
              {complete < 100 && <span className="text-xs text-text-muted px-1 py-1">Profile {complete}% complete</span>}
            </div>
          </div>

          <button onClick={() => { logout(); navigate('/landing', { replace: true }); }} className="fortis-btn-secondary text-xs flex items-center gap-2 self-center sm:self-end">
            <LogOut className="w-3.5 h-3.5" />Sign out
          </button>
        </div>

        {/* Customise drawer */}
        <div className={`grid transition-all duration-300 ${customize ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="overflow-hidden">
            <div className="px-5 pb-5 pt-1 space-y-4 border-t border-dark-border/60">
              <div className="pt-4 space-y-2">
                <p className="text-xs font-bold text-text-secondary">Profile photo</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => uploadRef.current?.click()} className="fortis-btn-primary text-xs py-2 px-4 flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" />Upload photo</button>
                  <button onClick={() => cameraRef.current?.click()} className="fortis-btn-secondary text-xs py-2 px-4 flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" />Take selfie</button>
                  {avatar && <button onClick={removeAvatar} className="text-xs py-2 px-4 rounded-xl border border-dark-border text-text-muted hover:text-danger hover:border-danger/40 transition flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />Remove</button>}
                </div>
                {photoErr && <p role="alert" className="text-xs text-red-400">{photoErr}</p>}
              </div>

              {images.length > 0 && (
                <>
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-text-secondary">Pick an avatar</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {images.map((src) => (
                        <button key={src} onClick={() => setAvatarFromPublic(src)} aria-label="Use this avatar"
                          className={`w-14 h-14 shrink-0 rounded-full overflow-hidden border-2 transition hover:scale-105 ${avatar === src ? 'border-brand shadow-glow' : 'border-dark-border'}`}>
                          <img src={src} alt="" className="w-full h-full object-cover object-top" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-text-secondary">Cover image</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {images.map((src) => (
                        <button key={src} onClick={() => setBannerFrom(src)} aria-label="Use as cover"
                          className={`w-24 h-14 shrink-0 rounded-lg overflow-hidden border-2 transition hover:scale-105 ${banner === src ? 'border-brand shadow-glow' : 'border-dark-border'}`}>
                          <img src={src} alt="" className="w-full h-full object-cover object-top" />
                        </button>
                      ))}
                      {banner && <button onClick={() => setBannerFrom(null)} className="w-24 h-14 shrink-0 rounded-lg border border-dashed border-dark-border text-[11px] text-text-muted hover:text-white">No cover</button>}
                    </div>
                  </div>
                </>
              )}
              <p className="text-[11px] text-text-muted">Your custom profile photo will appear across your dashboard, navigation, and workouts.</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section tabs ── */}
      <div role="tablist" className="flex gap-1.5 overflow-x-auto p-1 rounded-2xl bg-dark-card border border-dark-border">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`flex-1 shrink-0 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold px-3 py-2.5 rounded-xl transition ${tab === t.id ? 'bg-brand text-white shadow-glow' : 'text-text-secondary hover:text-white hover:bg-dark-hover'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-text-muted -mt-2 px-1">Tap any value to edit it. Changes save as soon as you confirm.</p>

      {/* ── Body ── */}
      {tab === 'body' && (
        <div className="space-y-5 animate-fade-in">
          <Card title="Body metrics" icon={<User className="w-4 h-4" />}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Age" type="number" unit="yrs" value={p?.age} onSave={field('age')} />
              <Field label="Height" type="number" unit="cm" value={p?.height_cm} onSave={field('height_cm')} />
              <Field label="Weight" type="number" unit="kg" value={p?.weight_kg} onSave={field('weight_kg')} />
              <Field label="Gender" value={p?.gender} display={p?.gender ? GENDERS[p.gender] || p.gender : 'Add'} options={opts(GENDERS)} onSave={field('gender')} />
            </div>
            <div className="p-4 rounded-xl bg-dark-surface border border-dark-border">
              <p className="text-[11px] text-text-muted font-bold mb-2">Body mass index</p>
              <BmiGauge weight={p?.weight_kg} height={p?.height_cm} />
            </div>
            <ChoiceChips label="Activity level" value={p?.activity_level} options={opts(ACTIVITY)} onSave={field('activity_level')} />
          </Card>
        </div>
      )}

      {/* ── Goals ── */}
      {tab === 'goals' && (
        <div className="space-y-5 animate-fade-in">
          <Card title="Fitness goal" icon={<Target className="w-4 h-4" />}>
            <ChoiceChips label="What are you training for?" value={g?.primary_goal} options={opts(GOALS)} onSave={field('primary_goal')} />
            <ChoiceChips label="Experience" value={g?.experience_level} options={opts(EXP)} onSave={field('experience_level')} />
          </Card>
        </div>
      )}

      {/* ── Training ── */}
      {tab === 'training' && (
        <div className="space-y-5 animate-fade-in">
          <Card title="Schedule" icon={<Calendar className="w-4 h-4" />}>
            <div className="space-y-2">
              <p className="text-xs font-bold text-text-secondary">Days per week</p>
              <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Days per week">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <button key={d} role="radio" aria-checked={sched?.days_per_week === d}
                    onClick={() => save({ days_per_week: d }).catch(() => setToast('Could not save'))}
                    className={`h-11 rounded-xl text-sm font-black border transition active:scale-90 ${(sched?.days_per_week ?? 0) >= d ? 'bg-brand/20 border-brand/50 text-brand-light' : 'bg-dark-surface border-dark-border text-text-muted hover:border-brand/30'} ${sched?.days_per_week === d ? 'ring-2 ring-brand' : ''}`}>{d}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Session length" type="number" unit="min" value={sched?.workout_duration_min} onSave={field('workout_duration_min')} />
              <Field label="Preferred time" value={sched?.preferred_time} display={sched?.preferred_time ? TIMES[sched.preferred_time] || sched.preferred_time : 'Add'} options={opts(TIMES)} onSave={field('preferred_time')} />
            </div>
            <ChoiceChips label="Where do you train?" value={p?.workout_location} options={opts(PLACES)} onSave={field('workout_location')} />
          </Card>

          <Card title="Equipment" icon={<Dumbbell className="w-4 h-4" />}>
            <ChipEditor label="What you have access to" items={eq?.equipment_list} placeholder="Add equipment, then press Enter"
              suggestions={['Dumbbells', 'Resistance bands', 'Pull-up bar', 'Kettlebell', 'Barbell', 'Bench']} onSave={(v) => save({ equipment_list: v })} />
          </Card>
        </div>
      )}

      {/* ── Nutrition ── */}
      {tab === 'nutrition' && (
        <div className="space-y-5 animate-fade-in">
          <Card title="Nutrition preferences" icon={<Utensils className="w-4 h-4" />}>
            <ChoiceChips label="Diet type" value={nutr?.diet_type} options={opts(DIETS)} onSave={field('diet_type')} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Daily budget" type="number" unit="₹" value={nutr?.daily_budget_inr} display={nutr?.daily_budget_inr ? `₹${nutr.daily_budget_inr}/day` : 'Add'} onSave={field('daily_budget_inr')} />
              <Field label="Meals per day" type="number" value={nutr?.meals_per_day} onSave={field('meals_per_day')} />
              <Field wide label="Regional preference" value={nutr?.regional_preference} onSave={async (v) => save({ regional_preference: v || undefined })} />
            </div>
            <ChipEditor label="Allergies" tone="warn" items={nutr?.allergies} placeholder="Add an allergy, then press Enter"
              suggestions={['Gluten', 'Lactose', 'Nuts', 'Soy', 'Eggs', 'Shellfish']} onSave={(v) => save({ allergies: v })} />
          </Card>
        </div>
      )}

      {/* ── Health ── */}
      {tab === 'health' && (
        <div className="space-y-5 animate-fade-in">
          <Card title="Injuries & avoidances" icon={<ShieldAlert className="w-4 h-4" />}>
            <Field wide label="Injury notes" value={p?.injury_notes} display={p?.injury_notes || 'Add'} onSave={async (v) => save({ injury_notes: v || undefined })} />
            <ChipEditor label="Exercises to avoid" tone="warn" items={p?.exercises_to_avoid} placeholder="e.g. burpees, then press Enter"
              suggestions={['Burpees', 'Deadlifts', 'Jump squats', 'Overhead press']} onSave={(v) => save({ exercises_to_avoid: v })} />
            <ChipEditor label="Preferred exercise types" items={p?.preferred_exercise_types} placeholder="e.g. yoga, then press Enter"
              suggestions={['Strength', 'Yoga', 'Cardio', 'HIIT', 'Mobility']} onSave={(v) => save({ preferred_exercise_types: v })} />
          </Card>
        </div>
      )}

      {/* ── Quick nav ── */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'View progress', path: '/progress', icon: <Activity className="w-4 h-4" /> },
          { label: "Today's workout", path: '/workout', icon: <Dumbbell className="w-4 h-4" /> },
          { label: 'Recovery log', path: '/recovery', icon: <Heart className="w-4 h-4" /> },
          { label: 'Nutrition', path: '/nutrition', icon: <Utensils className="w-4 h-4" /> },
        ].map(({ label, path, icon }) => (
          <button key={path} onClick={() => navigate(path)}
            className="bg-dark-card border border-dark-border rounded-xl p-4 flex items-center justify-between hover:border-brand/30 hover:bg-dark-hover transition-all group text-left">
            <span className="flex items-center gap-3"><span className="text-brand">{icon}</span><span className="text-sm font-semibold text-text-primary">{label}</span></span>
            <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-brand transition-colors" />
          </button>
        ))}
      </div>

      {/* Toast */}
      <div aria-live="polite" className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`}>
        <span className="flex items-center gap-2 px-4 py-2 rounded-full bg-dark-card border border-success/30 text-sm text-success shadow-glow-success">
          <Check className="w-4 h-4" />{toast}
        </span>
      </div>
    </div>
  );
};

export default ProfilePage;
