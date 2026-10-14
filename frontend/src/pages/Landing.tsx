import React from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import { ArrowRight, Zap, Brain, ScanLine, TrendingUp, Shield, Dumbbell } from 'lucide-react';

const features = [
  {
    icon: Brain,
    title: 'Adaptive Intelligence',
    desc: 'FORTIS PULSE — a single composite score that evolves with your body every single day.',
  },
  {
    icon: ScanLine,
    title: 'Body Scan',
    desc: 'AI-powered movement analysis measures mobility, stability & posture via your camera.',
  },
  {
    icon: TrendingUp,
    title: 'Personal Baseline',
    desc: 'Compares you against your own history — not population norms. Truly personalised.',
  },
  {
    icon: Dumbbell,
    title: 'Smart Workouts',
    desc: 'Plans auto-adjust intensity based on your realtime fatigue and readiness score.',
  },
  {
    icon: Shield,
    title: 'Injury Prevention',
    desc: 'Decision engine flags high fatigue risk before you overtrain and break down.',
  },
  {
    icon: Zap,
    title: 'AI Coach',
    desc: 'Context-aware coach that knows your data — ask anything, get real answers.',
  },
];

const Landing: React.FC = () => {
  return (
    <div className="min-h-screen bg-dark-bg text-text-primary flex flex-col">
      {/* ── Navbar ───────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 h-14 border-b border-dark-border bg-dark-bg/80 backdrop-blur px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-12 w-auto" />
          <span className="text-[9px] text-brand-light font-bold tracking-[0.18em] uppercase mt-0.5">
            Adaptive AI
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/auth/login" className="fortis-btn-ghost text-sm">
            Sign In
          </Link>
          <Link to="/auth/login?tab=register" className="fortis-btn-primary text-sm py-2 px-4">
            Get Started
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-radial-orange pointer-events-none" />
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 font-black text-brand pointer-events-none select-none"
          style={{ fontSize: 'clamp(6rem, 25vw, 18rem)', opacity: 0.04, lineHeight: 1 }}
        >
          FORTIS
        </div>

        <div className="relative z-10 max-w-3xl mx-auto">
          <p className="overline-brand mb-4 tracking-[0.3em]">Adaptive Fitness Intelligence</p>

          <h1
            className="font-black tracking-tighter text-white leading-none mb-6"
            style={{ fontSize: 'clamp(3rem, 8vw, 5.5rem)' }}
          >
            Train Smarter.<br />
            <span className="text-gradient">Recover Better.</span><br />
            Adapt Daily.
          </h1>

          <p className="text-text-secondary text-lg leading-relaxed max-w-xl mx-auto mb-10">
            Fortis is the only fitness platform that continuously observes your body,
            computes your Personal Fitness State, and adapts every workout — in real time.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/auth/login?tab=register"
              className="fortis-btn-primary inline-flex items-center gap-2 py-3.5 px-8 text-base font-black tracking-wide"
            >
              Start Free <ArrowRight className="w-5 h-5" />
            </Link>
          </div>

          <p className="text-xs text-text-muted mt-4">No credit card required ·</p>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────── */}
      <section className="px-6 py-16 max-w-6xl mx-auto w-full">
        <p className="overline text-center mb-3">What Makes Fortis Different</p>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white text-center mb-10 tracking-tight">
          Built around <span className="text-gradient">your data</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="fortis-card p-5 flex gap-4 hover:border-brand/30"
              >
                <div className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/20 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-brand-light" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm mb-1">{f.title}</h3>
                  <p className="text-xs text-text-secondary leading-relaxed">{f.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────────── */}
      <section className="px-6 py-12">
        <div className="max-w-2xl mx-auto text-center bg-dark-card border border-brand/20 rounded-3xl p-10 relative overflow-hidden">
          <div className="absolute inset-0 bg-radial-orange pointer-events-none" />
          <div className="relative z-10">
            <h2 className="text-2xl font-black text-white mb-3 tracking-tight">
              Ready to unlock your true potential?
            </h2>
            <p className="text-text-secondary text-sm mb-6">
              Join Fortis and start your first adaptive session today.
            </p>
            <Link
              to="/auth/login?tab=register"
              className="fortis-btn-primary inline-flex items-center gap-2 py-3 px-8 text-sm font-black"
            >
              Create Account <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="border-t border-dark-border px-6 py-6 text-center text-xs text-text-muted">
        © {new Date().getFullYear()} Fortis AI Fitness · Adaptive Intelligence Platform
      </footer>
    </div>
  );
};

export default Landing;
