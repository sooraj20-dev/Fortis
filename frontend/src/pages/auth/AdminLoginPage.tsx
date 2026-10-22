import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Dumbbell, LockKeyhole } from 'lucide-react';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import type { TokenResponse } from '../../types';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  const login = useAuthStore((state) => state.login);

  useEffect(() => {
    if (authenticated && user?.is_admin) navigate('/admin/dashboard', { replace: true });
  }, [authenticated, user?.is_admin, navigate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const { data } = await api.post<TokenResponse>('/api/auth/login', { email, password });
      if (!data.is_admin) {
        setError('This account does not have store administrator access.');
        return;
      }
      login(data.access_token, { id: data.user_id, email: data.email, name: data.name, is_admin: true }, data.onboarding_complete);
      const next = new URLSearchParams(window.location.search).get('next');
      navigate(next?.startsWith('/admin/') && next !== '/admin/login' ? next : '/admin/dashboard', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not sign in. Check your email and password.');
    } finally { setBusy(false); }
  };

  return <main className="grid min-h-screen place-items-center bg-[#0b0b0e] px-4 py-10 text-white">
    <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[.035] p-7 shadow-2xl sm:p-9">
      <div className="mb-7 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/15 text-brand-light"><Dumbbell /></span><div><p className="text-xs font-bold uppercase tracking-[.2em] text-brand-light">FORTIS Store</p><h1 className="mt-1 text-2xl font-black">Administrator sign in</h1></div></div>
      <p className="mb-6 text-sm leading-6 text-text-secondary">Sign in with an account that has store administrator access to manage products and inventory.</p>
      <form onSubmit={submit} className="space-y-4">
        <label className="fortis-label">Email<input required type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className="fortis-input mt-1" /></label>
        <label className="fortis-label">Password<input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="fortis-input mt-1" /></label>
        {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
        <button disabled={busy} className="fortis-btn-primary flex w-full items-center justify-center gap-2"><LockKeyhole size={16} />{busy ? 'Signing in…' : 'Sign in to catalog'}</button>
      </form>
      <Link to="/store" className="mt-6 block text-center text-sm text-text-muted hover:text-white">Return to the store</Link>
    </section>
  </main>;
}
