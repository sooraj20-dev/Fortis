import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import BrandLogo from '../../components/BrandLogo';
import type { TokenResponse } from '../../types';

type Tab = 'login' | 'register';

/** Extract a readable message from any backend error shape */
function parseError(err: any, fallback: string): string {
  const detail = err?.response?.data?.detail;
  if (!detail) return fallback;
  // FastAPI validation errors come as an array of objects
  if (Array.isArray(detail)) {
    return detail.map((d: any) => d.msg || d.message || String(d)).join(' · ');
  }
  return String(detail);
}

const AuthPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'login';
  const [tab, setTab] = useState<Tab>(initialTab === 'register' ? 'register' : 'login');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  // Which fields have errors (for red border)
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const onboardingComplete = useAuthStore((s) => s.onboardingComplete);

  // If already logged in, redirect directly to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Sync tab from URL param
  useEffect(() => {
    const t = searchParams.get('tab') as Tab;
    if (t === 'register' || t === 'login') setTab(t);
  }, [searchParams]);

  const showError = (msg: string, fields: string[] = []) => {
    setError(msg);
    setFieldErrors(Object.fromEntries(fields.map((f) => [f, true])));
    // Trigger shake
    setShake(true);
    setTimeout(() => setShake(false), 600);
    // Auto-dismiss after 8 seconds
    setTimeout(() => setError(''), 8000);
  };

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => ({ ...prev, [field]: false }));
    setError('');
  };

  const handleSuccess = (data: TokenResponse) => {
    login(
      data.access_token,
      { id: data.user_id, email: data.email, name: data.name, is_admin: data.is_admin },
      data.onboarding_complete,
    );
    navigate('/dashboard', { replace: true });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setLoading(true);
    try {
      sessionStorage.removeItem('fortis_new_registration');
      const res = await api.post<TokenResponse>('/api/auth/login', { email, password });
      handleSuccess(res.data);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        showError('Incorrect email or password. Please try again.', ['email', 'password']);
      } else if (status === 404) {
        showError('No account found with this email. Did you mean to register?', ['email']);
      } else if (status === 422) {
        showError(parseError(err, 'Please fill in all required fields correctly.'));
      } else {
        showError(parseError(err, 'Sign in failed. Please check your connection and try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    // Client-side validation
    if (!name.trim()) {
      showError('Please enter your full name.', ['name']);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('Please enter a valid email address.', ['email']);
      return;
    }
    if (password.length < 6) {
      showError('Password must be at least 6 characters long.', ['password']);
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<TokenResponse>('/api/auth/register', { name, email, password });
      sessionStorage.setItem('fortis_new_registration', 'true');
      handleSuccess(res.data);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409 || status === 400) {
        showError('An account with this email already exists. Try signing in instead.', ['email']);
      } else if (status === 422) {
        showError(parseError(err, 'Please check your details and try again.'));
      } else {
        showError(parseError(err, 'Registration failed. Please try again in a moment.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-radial-orange pointer-events-none" />
      <div
        className="absolute bottom-0 right-0 font-black text-brand pointer-events-none select-none"
        style={{ fontSize: 'clamp(6rem, 20vw, 14rem)', opacity: 0.04, lineHeight: 1 }}
      >
        F
      </div>

      <style>{`
        @keyframes fortis-shake {
          0%, 100% { transform: translateX(0); }
          15%       { transform: translateX(-6px); }
          30%       { transform: translateX(6px); }
          45%       { transform: translateX(-5px); }
          60%       { transform: translateX(5px); }
          75%       { transform: translateX(-3px); }
          90%       { transform: translateX(3px); }
        }
        .fortis-shake { animation: fortis-shake 0.55s ease; }
      `}</style>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <Link to="/landing" className="flex justify-center mb-8 group">
          <BrandLogo className="h-20 w-auto transition-transform group-hover:scale-105" />
        </Link>

        {/* Card — shake on error */}
        <div className={`bg-dark-card border border-dark-border rounded-3xl p-8 shadow-card ${shake ? 'fortis-shake' : ''}`}>
          {/* Tab switcher */}
          <div className="flex gap-1 bg-dark-surface rounded-xl p-1 mb-7">
            {(['login', 'register'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(''); setFieldErrors({}); }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all capitalize ${
                  tab === t
                    ? 'bg-brand text-white shadow-glow'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {t === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* ── Error Banner ── */}
          {error && (
            <div className="mb-5 flex items-start gap-2.5 bg-danger/10 border border-danger/40 rounded-xl p-3.5 animate-fade-in">
              <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <p className="text-sm text-danger flex-1 leading-snug">{error}</p>
              <button
                type="button"
                onClick={() => { setError(''); setFieldErrors({}); }}
                className="text-danger/60 hover:text-danger transition-colors shrink-0 mt-0.5"
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}

          {/* ── Sign In ── */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4" noValidate>
              <div>
                <label className="fortis-label">Email</label>
                <input
                  type="email"
                  className={`fortis-input transition-colors ${fieldErrors.email ? 'border-danger focus:border-danger' : ''}`}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="fortis-label">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    className={`fortis-input pr-11 transition-colors ${fieldErrors.password ? 'border-danger focus:border-danger' : ''}`}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="fortis-btn-primary w-full py-3 mt-2">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
                  </span>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          )}

          {/* ── Register ── */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4" noValidate>
              <div>
                <label className="fortis-label">Full Name</label>
                <input
                  type="text"
                  className={`fortis-input transition-colors ${fieldErrors.name ? 'border-danger focus:border-danger' : ''}`}
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); clearFieldError('name'); }}
                  required
                />
              </div>
              <div>
                <label className="fortis-label">Email</label>
                <input
                  type="email"
                  className={`fortis-input transition-colors ${fieldErrors.email ? 'border-danger focus:border-danger' : ''}`}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="fortis-label">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    className={`fortis-input pr-11 transition-colors ${fieldErrors.password ? 'border-danger focus:border-danger' : ''}`}
                    placeholder="Min 6 characters"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="text-[11px] text-danger mt-1">Must be at least 6 characters</p>
                )}
              </div>
              <button type="submit" disabled={loading} className="fortis-btn-primary w-full py-3 mt-2">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Creating account…
                  </span>
                ) : (
                  'Create Account'
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer link */}
        <p className="text-center text-xs text-text-muted mt-6">
          <Link to="/landing" className="hover:text-text-secondary transition-colors">
            ← Back to Home
          </Link>
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
