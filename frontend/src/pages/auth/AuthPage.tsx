import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import BrandLogo from '../../components/BrandLogo';
import type { TokenResponse } from '../../types';

type Tab = 'login' | 'register';
type VerificationState = 'checking' | 'verified' | 'failed' | null;
type RegistrationResponse = { message: string; email: string; verification_required: boolean };

const BG_IMAGE = '/landing_imgs/footer.png';

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
  const [registrationPending, setRegistrationPending] = useState(false);
  const [verificationState, setVerificationState] = useState<VerificationState>(null);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [resendingVerification, setResendingVerification] = useState(false);

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

  const verificationToken = searchParams.get('verify');
  useEffect(() => {
    if (!verificationToken) return;
    let active = true;
    setVerificationState('checking');
    api.post<{ verified: boolean; message: string; email: string }>('/api/auth/verify-email', { token: verificationToken })
      .then((res) => {
        if (!active) return;
        setVerificationState('verified'); setVerificationMessage(res.data.message); setEmail(res.data.email || '');
        setRegistrationPending(true); setTab('login');
        sessionStorage.setItem('fortis_new_registration', 'true');
      })
      .catch((err: any) => {
        if (!active) return;
        setVerificationState('failed'); setVerificationMessage(parseError(err, 'This verification link is invalid or expired. Request a new link.'));
      })
      .finally(() => { if (active) navigate('/auth/login?tab=login', { replace: true }); });
    return () => { active = false; };
  }, [verificationToken, navigate]);

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
      const res = await api.post<TokenResponse>('/api/auth/login', { email, password });
      handleSuccess(res.data);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = String(err?.response?.data?.detail || '');
      if (status === 403 && detail.toLowerCase().includes('verify your email')) {
        setRegistrationPending(true);
        showError(detail, ['email']);
      } else if (status === 401 || status === 403) {
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
    if (password.length < 8 || new TextEncoder().encode(password).length > 72) {
      showError('Password must be at least 8 characters and no more than 72 UTF-8 bytes.', ['password']);
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<TokenResponse>('/api/auth/register', { name, email, password });
      handleSuccess(res.data);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409 || status === 400) {
        showError('If this address belongs to an account, sign in or request a verification link.', ['email']);
      } else if (status === 422) {
        showError(parseError(err, 'Please check your details and try again.'));
      } else {
        showError(parseError(err, 'Registration failed. Please try again in a moment.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    if (!email) { showError('Enter the email address you registered with.', ['email']); return; }
    setResendingVerification(true); setError('');
    try {
      const res = await api.post<RegistrationResponse>('/api/auth/verification/resend', { email });
      setVerificationMessage(res.data.message); setRegistrationPending(true);
    } catch (err: any) {
      setVerificationMessage(parseError(err, 'Could not send a verification link. Please try again later.'));
    } finally { setResendingVerification(false); }
  };

  // 16px text on phones stops iOS Safari from zooming into the field on focus
  const inputBase = '!text-base sm:!text-sm transition-colors';

  return (
    <div className="relative isolate min-h-[100svh] bg-dark-bg flex items-center justify-center px-4 py-8 sm:py-12 overflow-hidden">
      {/* ── Background: footer image ── */}
      <img
        src={BG_IMAGE}
        alt=""
        aria-hidden
        className="auth-bg absolute inset-0 -z-10 w-full h-full object-cover object-[72%_50%] lg:object-[70%_50%] select-none"
        draggable={false}
      />
      {/* Readability overlays: even dim on phones, left-heavy on desktop so the coach stays visible */}
      <div className="absolute inset-0 -z-10 pointer-events-none bg-gradient-to-b from-dark-bg/85 via-dark-bg/65 to-dark-bg/90 lg:bg-gradient-to-r lg:from-dark-bg lg:via-dark-bg/65 lg:to-dark-bg/5" />
      <div className="absolute inset-0 -z-10 pointer-events-none bg-radial-orange opacity-40" />

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
        @keyframes fortis-bg-drift {
          from { transform: scale(1.04); }
          to   { transform: scale(1.12) translate3d(-1.5%, 0, 0); }
        }
        .fortis-shake { animation: fortis-shake 0.55s ease; }
        .auth-bg { animation: fortis-bg-drift 22s ease-in-out infinite alternate; }
        @media (prefers-reduced-motion: reduce) {
          .fortis-shake, .auth-bg { animation: none !important; }
        }
      `}</style>

      <div className="relative z-10 w-full max-w-md lg:max-w-6xl lg:grid lg:grid-cols-2 lg:items-center lg:gap-10">
        {/* ── Form column ── */}
        <div className="w-full lg:max-w-md">
          {/* Logo */}
          <Link to="/landing" className="flex justify-center lg:justify-start mb-5 sm:mb-8 group">
            <BrandLogo className="h-14 sm:h-20 w-auto transition-transform group-hover:scale-105" />
          </Link>

          {/* Card — shake on error */}
          <div
            className={`bg-dark-card/85 backdrop-blur-md border border-dark-border rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-card ${
              shake ? 'fortis-shake' : ''
            }`}
          >
            {/* Tab switcher */}
            <div className="flex gap-1 bg-dark-surface rounded-xl p-1 mb-6 sm:mb-7" role="tablist">
              {(['login', 'register'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => { setTab(t); setError(''); setFieldErrors({}); }}
                  className={`flex-1 py-2.5 sm:py-2 rounded-lg text-xs font-bold transition-all capitalize ${
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
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 bg-danger/10 border border-danger/40 rounded-xl p-3.5 animate-fade-in"
              >
                <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                <p className="text-sm text-danger flex-1 leading-snug break-words min-w-0">{error}</p>
                <button
                  type="button"
                  onClick={() => { setError(''); setFieldErrors({}); }}
                  className="text-danger/60 hover:text-danger transition-colors shrink-0 -m-2 p-2"
                  aria-label="Dismiss error"
                >
                  ✕
                </button>
              </div>
            )}

            {(registrationPending || verificationState) && (
              <div className={`mb-5 rounded-xl border p-3.5 text-sm ${verificationState === 'failed' ? 'border-danger/40 bg-danger/10 text-danger' : 'border-brand/40 bg-brand/10 text-text-primary'}`} role="status" aria-live="polite">
                <p>{verificationState === 'checking' ? 'Verifying your email link…' : verificationMessage || 'Check your email for a verification link before signing in.'}</p>
                {tab === 'login' && (registrationPending || verificationState === 'failed') && verificationState !== 'checking' && (
                  <button type="button" onClick={resendVerification} disabled={resendingVerification} className="mt-2 text-brand-light font-semibold underline underline-offset-2 disabled:opacity-60">
                    {resendingVerification ? 'Sending…' : 'Resend verification email'}
                  </button>
                )}
              </div>
            )}

            {/* ── Sign In ── */}
            {tab === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4" noValidate>
                <div>
                  <label className="fortis-label" htmlFor="login-email">Email</label>
                  <input
                    id="login-email"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className={`fortis-input ${inputBase} ${fieldErrors.email ? 'border-danger focus:border-danger' : ''}`}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                    required
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="fortis-label" htmlFor="login-password">Password</label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPass ? 'text' : 'password'}
                      className={`fortis-input pr-12 ${inputBase} ${fieldErrors.password ? 'border-danger focus:border-danger' : ''}`}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 text-text-muted hover:text-text-primary"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading} className="fortis-btn-primary w-full py-3.5 sm:py-3 mt-2">
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
                  <label className="fortis-label" htmlFor="reg-name">Full Name</label>
                  <input
                    id="reg-name"
                    type="text"
                    className={`fortis-input ${inputBase} ${fieldErrors.name ? 'border-danger focus:border-danger' : ''}`}
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => { setName(e.target.value); clearFieldError('name'); }}
                    required
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label className="fortis-label" htmlFor="reg-email">Email</label>
                  <input
                    id="reg-email"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className={`fortis-input ${inputBase} ${fieldErrors.email ? 'border-danger focus:border-danger' : ''}`}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                    required
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="fortis-label" htmlFor="reg-password">Password</label>
                  <div className="relative">
                    <input
                      id="reg-password"
                      type={showPass ? 'text' : 'password'}
                      className={`fortis-input pr-12 ${inputBase} ${fieldErrors.password ? 'border-danger focus:border-danger' : ''}`}
                      placeholder="Create a strong password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
                      required
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 text-text-muted hover:text-text-primary"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-text-muted mt-1">Use at least 8 characters with uppercase and lowercase letters, a number, and a symbol.</p>
                  {fieldErrors.password && (
                    <p className="text-[11px] text-danger mt-1">Use 8+ characters with uppercase and lowercase letters, a number, and a symbol.</p>
                  )}
                </div>
                <button type="submit" disabled={loading} className="fortis-btn-primary w-full py-3.5 sm:py-3 mt-2">
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
          <p className="text-center lg:text-left text-xs text-text-muted mt-5 sm:mt-6">
            <Link to="/landing" className="inline-block py-2 hover:text-text-secondary transition-colors">
              ← Back to Home
            </Link>
          </p>
        </div>

        {/* ── Coach quote (desktop only, sits over the sunset on the right) ── */}
        <div className="hidden lg:flex flex-col justify-end items-end min-h-[520px] pb-4">
          <blockquote className="max-w-sm text-right">
            <p className="font-black text-white text-3xl leading-tight tracking-tight drop-shadow-lg">
              Beat the man you were yesterday.
            </p>
            <footer className="mt-3 text-sm text-brand-light font-bold">Coach Fortis</footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
