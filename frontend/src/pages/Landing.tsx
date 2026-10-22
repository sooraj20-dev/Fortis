import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import {
  ArrowRight,
  Zap,
  Brain,
  ScanLine,
  TrendingUp,
  Shield,
  Dumbbell,
  ChevronLeft,
  ChevronRight,
  Flame,
  Star,
} from 'lucide-react';

/* ───────────────────────── Content ───────────────────────── */

const IMG = {
  hero: '/landing_imgs/hero.png',
  pose: '/landing_imgs/hero_pose.png',
  footer: '/landing_imgs/footer.png',
};

const features = [
  { icon: Brain, title: 'Adaptive Intelligence', desc: 'FORTIS PULSE — a single composite score that evolves with your body every single day.' },
  { icon: ScanLine, title: 'Body Scan', desc: 'AI-powered movement analysis measures mobility, stability & posture via your camera.' },
  { icon: TrendingUp, title: 'Personal Baseline', desc: 'Compares you against your own history — not population norms. Truly personalised.' },
  { icon: Dumbbell, title: 'Smart Workouts', desc: 'Plans auto-adjust intensity based on your realtime fatigue and readiness score.' },
  { icon: Shield, title: 'Injury Prevention', desc: 'Decision engine flags high fatigue risk before you overtrain and break down.' },
  { icon: Zap, title: 'AI Coach', desc: 'Context-aware coach that knows your data — ask anything, get real answers.' },
];

const quotes = [
  { text: "The iron doesn't care about your excuses. Your body does — so listen to it.", tag: 'On listening' },
  { text: 'Rest is not weakness. It is where the strength actually gets built.', tag: 'On recovery' },
  { text: 'Beat the man you were yesterday. Nobody else is on your scoreboard.', tag: 'On progress' },
  { text: 'Heavy days make you strong. Smart days keep you standing.', tag: 'On training' },
  { text: 'Show up tired. Leave proud. That is the whole secret.', tag: 'On showing up' },
];

// Placeholder quotes: replace with each person's real words before launch.
// Put each profile photo in /public/testimonials/ and match the file name in `avatar`.
const testimonials = [
  {
    name: 'Aswin Krishna',
    role: 'Gym Trainer',
    avatar: '/testimonials/aswin.png',
    quote:
      "I coach people for a living and still ignored my own recovery. Fortis flagged my fatigue before a heavy block, and now I check the Pulse score before I program my clients too.",
    from: 54,
    to: 81,
    chips: ['Deadlift +20 kg', 'Sleep 6.1 → 7.4 h'],
    hue: 'from-brand to-amber-400',
  },
  {
    name: 'Ahmmed Niyas',
    role: 'Game Developer',
    avatar: '/testimonials/ahmmed.png',
    quote:
      "Crunch weeks used to wreck my sleep and my lifts. Fortis scales the session to how drained I am after a long build, so I stay consistent without it becoming another deadline.",
    from: 48,
    to: 73,
    chips: ['4/4 weeks on plan', 'Fatigue risk: low'],
    hue: 'from-sky-400 to-brand',
  },
  {
    name: 'Ajith',
    role: 'Director',
    avatar: '/testimonials/ajith.png',
    quote:
      "On set days I get maybe five hours of sleep. The plan drops to short mobility work then, and pushes hard when I'm rested. It's the first app that fits a schedule like mine.",
    from: 61,
    to: 84,
    chips: ['0 missed sessions', 'Posture score +18%'],
    hue: 'from-amber-400 to-rose-500',
  },
];

/* ───────────────────────── Small pieces ───────────────────────── */

const SpotlightCard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className="fortis-card group relative overflow-hidden p-4 sm:p-5 hover:border-brand/40 transition-colors"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background:
            'radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(255,90,31,0.18), transparent 70%)',
        }}
      />
      <div className="relative flex gap-4">{children}</div>
    </div>
  );
};

const Avatar: React.FC<{ name: string; hue: string; src?: string }> = ({ name, hue, src }) => {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2);
  return (
    <div
      className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br ${hue} p-[3px] shadow-xl shadow-brand/20`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="w-full h-full rounded-full object-cover object-top bg-dark-bg border-2 border-dark-bg"
        />
      ) : (
        <div
          className="w-full h-full rounded-full bg-dark-bg flex items-center justify-center text-xl font-black text-white"
          aria-hidden
        >
          {initials}
        </div>
      )}
    </div>
  );
};

const TestimonialCard: React.FC<{ t: (typeof testimonials)[number]; featured?: boolean }> = ({ t, featured }) => {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return (
    <div className="relative pt-10 sm:pt-12">
      {/* avatar overlaps the top edge of the card */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10">
        <Avatar name={t.name} hue={t.hue} src={t.avatar} />
      </div>
      <div
        ref={ref}
        onPointerMove={onMove}
        className={`fortis-card group relative h-full text-center px-5 sm:px-6 pt-14 sm:pt-16 pb-6 transition-all duration-300 hover:border-brand/40 ${
          featured ? 'lg:-translate-y-3 border-brand/40 shadow-2xl shadow-brand/10' : ''
        }`}
      >
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden">
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background:
                'radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(255,90,31,0.18), transparent 70%)',
            }}
          />
        </div>
        <div className="relative flex flex-col h-full">
          <h3 className="font-bold text-white text-base">{t.name}</h3>
          <p className="text-[11px] text-brand-light font-semibold mt-0.5">{t.role}</p>
          <p className="text-sm text-text-secondary leading-relaxed mt-4 mb-5 flex-1">“{t.quote}”</p>
          <div className="text-[11px] text-text-muted mb-3">
            Pulse score <span className="text-white font-bold tabular-nums">{t.from}</span>{' '}
            <span>→</span> <span className="text-brand-light font-bold tabular-nums">{t.to}</span>
          </div>
          <div className="flex justify-center gap-1" aria-label="5 out of 5 stars">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="w-4 h-4 fill-brand-light text-brand-light" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const PulseRing: React.FC<{ value: number }> = ({ value }) => {
  const r = 70;
  const c = 2 * Math.PI * r;
  const color = value >= 75 ? '#ff5a1f' : value >= 50 ? '#ffb020' : '#5aa9ff';
  return (
    <div className="relative w-36 h-36 sm:w-44 sm:h-44 shrink-0 mx-auto">
      <svg viewBox="0 0 180 180" className="w-full h-full -rotate-90">
        <circle cx="90" cy="90" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
        <circle
          cx="90"
          cy="90"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * value) / 100}
          style={{ transition: 'stroke-dashoffset .5s ease, stroke .5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl sm:text-5xl font-black text-white tabular-nums leading-none">{value}</span>
        <span className="text-[11px] text-text-muted mt-1">Pulse score</span>
      </div>
    </div>
  );
};

const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 1, unit = '', onChange }) => (
  <label className="block">
    <div className="flex justify-between text-sm mb-2">
      <span className="text-text-secondary">{label}</span>
      <span className="text-white font-bold tabular-nums">
        {value}
        {unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-6 accent-[#ff5a1f] cursor-pointer"
    />
  </label>
);

/* ───────────────────────── Page ───────────────────────── */

const Landing: React.FC = () => {
  /* ── Hero background interaction ──
     Pointer (mouse / touch-drag / pen) + scroll write CSS variables straight to the DOM,
     so nothing re-renders while the user moves. */
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        // 0 at top of page → 1 when hero has fully scrolled away
        const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)));
        el.style.setProperty('--sy', String(p));
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const onHeroMove = (e: React.PointerEvent<HTMLElement>) => {
    const el = heroRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width; // 0..1
    const ny = (e.clientY - r.top) / r.height;
    el.style.setProperty('--px', ((nx - 0.5) * 2).toFixed(3)); // -1..1
    el.style.setProperty('--py', ((ny - 0.5) * 2).toFixed(3));
    el.style.setProperty('--gx', `${(nx * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${(ny * 100).toFixed(1)}%`);
  };
  const onHeroLeave = () => {
    const el = heroRef.current;
    if (!el) return;
    el.style.setProperty('--px', '0');
    el.style.setProperty('--py', '0');
    el.style.setProperty('--gx', '70%');
    el.style.setProperty('--gy', '35%');
  };

  /* Quote rotator */
  const [q, setQ] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setQ((i) => (i + 1) % quotes.length), 6000);
    return () => clearInterval(id);
  }, [paused]);
  const go = (d: number) => setQ((i) => (i + d + quotes.length) % quotes.length);

  /* Pulse simulator */
  const [sleep, setSleep] = useState(7);
  const [sore, setSore] = useState(4);
  const [stress, setStress] = useState(4);
  const pulse = Math.round(
    Math.min(100, Math.max(0, ((sleep - 4) / 6) * 40 + ((10 - sore) / 10) * 30 + ((10 - stress) / 10) * 30))
  );
  const plan =
    pulse >= 75
      ? { title: 'Push day', body: 'Heavy compound lifts. Your body is ready to take load.', coach: "You're primed. Go earn it." }
      : pulse >= 50
      ? { title: 'Steady day', body: 'Moderate volume, controlled tempo, one hard set per lift.', coach: 'Smart work today. Save the fire for later.' }
      : { title: 'Recovery day', body: 'Mobility, light movement and an early night.', coach: 'Rest is part of the program. Respect it.' };

  return (
    <div className="min-h-screen bg-dark-bg text-text-primary flex flex-col overflow-x-hidden">
      <style>{`
        @keyframes fortis-rise { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
        @keyframes fortis-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes fortis-ember { 0% { transform: translateY(0) scale(1); opacity: 0; } 15% { opacity: .9; } 100% { transform: translateY(-460px) scale(.3); opacity: 0; } }
        @keyframes fortis-quote { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: none; } }
        @keyframes fortis-breathe { 0%,100% { opacity: .55; } 50% { opacity: .85; } }
        .hero-rise { opacity: 0; animation: fortis-rise .8s cubic-bezier(.2,.7,.2,1) forwards; }
        .chip-float { animation: fortis-float 5s ease-in-out infinite; }
        .ember { position: absolute; bottom: -10px; border-radius: 9999px; background: #ff5a1f; filter: blur(1px); animation: fortis-ember linear infinite; }
        .quote-swap { animation: fortis-quote .5s ease both; }
        .hero-glow { animation: fortis-breathe 6s ease-in-out infinite; }

        /* Hero background layer: moves with pointer + scroll. Scaled up so edges never show. */
        .hero-bg-img {
          transform:
            translate3d(calc(var(--px, 0) * -14px), calc(var(--py, 0) * -10px + var(--sy, 0) * 60px), 0)
            scale(calc(1.08 + var(--sy, 0) * 0.05));
          transition: transform .25s ease-out;
          will-change: transform;
        }
        .hero-chip { transform: translate3d(calc(var(--px, 0) * 22px), calc(var(--py, 0) * 14px), 0); transition: transform .25s ease-out; }
        .hero-word { transform: translate3d(calc(var(--px, 0) * -24px), calc(var(--py, 0) * -10px + var(--sy, 0) * -40px), 0); transition: transform .3s ease-out; }

        /* Fade the photo into the page: bottom everywhere, and left edge on wide screens */
        .hero-mask { -webkit-mask-image: linear-gradient(to bottom, #000 70%, transparent 100%); mask-image: linear-gradient(to bottom, #000 70%, transparent 100%); }
        @media (min-width: 1024px) {
          .hero-mask {
            -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 38%), linear-gradient(to bottom, #000 82%, transparent 100%);
            mask-image: linear-gradient(to right, transparent 0%, #000 38%), linear-gradient(to bottom, #000 82%, transparent 100%);
            -webkit-mask-composite: source-in; mask-composite: intersect;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-rise, .chip-float, .ember, .quote-swap, .hero-glow { animation: none !important; opacity: 1 !important; }
          .hero-bg-img, .hero-chip, .hero-word { transform: scale(1.04) !important; transition: none !important; }
        }
      `}</style>

      {/* ── Navbar ───────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 h-14 border-b border-dark-border bg-dark-bg/80 backdrop-blur px-4 sm:px-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <BrandLogo className="h-9 sm:h-12 w-auto shrink-0" />
          <span className="hidden min-[400px]:inline text-[9px] text-brand-light font-bold tracking-[0.18em] uppercase mt-0.5">
            Adaptive AI
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <Link to="/auth/login" className="fortis-btn-ghost text-sm">
            Sign In
          </Link>
          <Link to="/auth/login?tab=register" className="fortis-btn-primary text-xs sm:text-sm py-2 px-3 sm:px-4 whitespace-nowrap">
            Get Started
          </Link>
        </div>
      </nav>

      {/* ── Hero: photo is the background ─────────────────── */}
      <section
        ref={heroRef}
        onPointerMove={onHeroMove}
        onPointerLeave={onHeroLeave}
        className="relative isolate overflow-hidden min-h-[calc(100svh-3.5rem)] flex"
        style={{ touchAction: 'pan-y', ['--gx' as any]: '70%', ['--gy' as any]: '35%' }}
      >
        {/* Giant faint wordmark */}
        <div
          className="hero-word absolute bottom-0 left-1/2 -translate-x-1/2 font-black text-brand pointer-events-none select-none whitespace-nowrap -z-10"
          style={{ fontSize: 'clamp(5rem, 24vw, 20rem)', opacity: 0.06, lineHeight: 0.9 }}
          aria-hidden
        >
          FORTIS
        </div>

        {/* Photo layer */}
        <div className="absolute inset-y-0 right-0 w-full lg:w-[64%] -z-10 overflow-hidden hero-mask">
          <img
            src={IMG.hero}
            alt="Coach Fortis standing in front of a wall of red fire"
            className="hero-bg-img absolute inset-0 w-full h-full object-cover object-[50%_12%] sm:object-[50%_18%] lg:object-[50%_22%] select-none"
            draggable={false}
            fetchPriority="high"
          />
          {/* pointer-following light */}
          <div
            className="hero-glow absolute inset-0 pointer-events-none mix-blend-screen"
            style={{
              background:
                'radial-gradient(380px circle at var(--gx) var(--gy), rgba(255,90,31,0.35), transparent 65%)',
            }}
          />
        </div>

        {/* Readability overlay: bottom-up on phones, left-to-right on desktop */}
        <div className="absolute inset-0 -z-10 pointer-events-none bg-gradient-to-t from-dark-bg via-dark-bg/70 via-35% to-dark-bg/10 lg:bg-gradient-to-r lg:from-dark-bg lg:via-dark-bg/60 lg:via-40% lg:to-transparent" />
        <div className="absolute inset-0 -z-10 pointer-events-none bg-radial-orange opacity-50" />

        {/* Embers */}
        <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden" aria-hidden>
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className={`ember ${i >= 7 ? 'hidden sm:block' : ''}`}
              style={{
                left: `${(i * 73) % 100}%`,
                width: 3 + (i % 3) * 2,
                height: 3 + (i % 3) * 2,
                animationDuration: `${6 + (i % 5) * 1.6}s`,
                animationDelay: `${(i % 7) * 0.9}s`,
              }}
            />
          ))}
        </div>

        {/* Floating info chips (tablet and up, so they never cover the face on phones) */}
        <div className="hidden sm:block absolute right-[6%] top-[18%] hero-chip">
          <div className="chip-float fortis-card px-3.5 py-2.5 flex items-center gap-2.5 backdrop-blur">
            <Flame className="w-4 h-4 text-brand-light" />
            <div className="leading-tight">
              <div className="text-white font-black text-lg tabular-nums">87</div>
              <div className="text-[10px] text-text-muted">Pulse today</div>
            </div>
          </div>
        </div>
        <div className="hidden md:block absolute right-[10%] bottom-[22%] hero-chip">
          <div className="chip-float fortis-card px-3.5 py-2.5 backdrop-blur" style={{ animationDelay: '1.4s' }}>
            <div className="text-white font-bold text-sm">Heavy day unlocked</div>
            <div className="text-[10px] text-text-muted">Recovery 92% · fatigue low</div>
          </div>
        </div>

        {/* Copy */}
        <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 flex flex-col justify-end lg:justify-center pt-[48vw] sm:pt-[38vw] lg:pt-0 pb-10 sm:pb-14 lg:pb-0">
          <div className="max-w-xl text-center lg:text-left mx-auto lg:mx-0">
            <p className="overline-brand mb-3 tracking-[0.25em] sm:tracking-[0.3em] hero-rise" style={{ animationDelay: '.05s' }}>
              Adaptive Fitness Intelligence
            </p>
            <h1
              className="font-black tracking-tighter text-white leading-[0.95] mb-5 hero-rise"
              style={{ fontSize: 'clamp(2.4rem, 8.5vw, 5rem)', animationDelay: '.15s' }}
            >
              Train Smarter.
              <br />
              <span className="text-gradient">Recover Better.</span>
              <br />
              Adapt Daily.
            </h1>
            <p
              className="text-text-secondary text-base sm:text-lg leading-relaxed max-w-md sm:max-w-lg mx-auto lg:mx-0 mb-7 hero-rise"
              style={{ animationDelay: '.3s' }}
            >
              Fortis watches your body, computes your Personal Fitness State, and adapts every workout in real time. Coach
              Fortis built it. Your data runs it.
            </p>
            <div
              className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3 sm:gap-4 hero-rise"
              style={{ animationDelay: '.45s' }}
            >
              <Link
                to="/auth/login?tab=register"
                className="fortis-btn-primary inline-flex items-center justify-center gap-2 py-3.5 px-8 text-base font-black tracking-wide"
              >
                Start Free <ArrowRight className="w-5 h-5" />
              </Link>
              <a href="#pulse" className="fortis-btn-ghost text-sm text-center py-2">
                Try your Pulse score
              </a>
            </div>
            <p className="text-xs text-text-muted mt-4 hero-rise" style={{ animationDelay: '.55s' }}>
              No credit card required
            </p>
          </div>
        </div>
      </section>

      {/* ── Coach's corner ─────────────────────────────── */}
      <section
        className="px-4 sm:px-6 py-14 sm:py-20 max-w-6xl mx-auto w-full"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
      >
        <div className="grid lg:grid-cols-[minmax(0,380px)_1fr] gap-8 lg:gap-16 items-center">
          <div className="relative mx-auto w-full max-w-[280px] sm:max-w-[340px] lg:max-w-none">
            <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-brand/40 to-transparent blur-xl" />
            <img
              src={IMG.pose}
              alt="Coach Fortis curling a heavy dumbbell"
              loading="lazy"
              className="relative rounded-[1.5rem] sm:rounded-[1.75rem] border border-brand/30 w-full aspect-[9/14] object-cover object-top shadow-2xl transition-transform duration-500 hover:scale-[1.02] hover:-rotate-1"
            />
            <div className="absolute left-3 right-3 bottom-3 sm:left-4 sm:right-4 sm:bottom-4 fortis-card px-4 py-3 backdrop-blur">
              <div className="text-white font-bold text-sm">Coach Fortis</div>
              <div className="text-[11px] text-text-muted">Your adaptive training coach</div>
            </div>
          </div>

          <div className="min-w-0">
            <p className="overline mb-3 text-center lg:text-left">Words from the coach</p>
            <div className="relative min-h-[220px] sm:min-h-[240px]">
              <span
                className="absolute -top-6 -left-1 font-black text-brand/20 select-none leading-none"
                style={{ fontSize: 'clamp(5rem, 14vw, 9rem)' }}
                aria-hidden
              >
                “
              </span>
              <blockquote key={q} className="quote-swap relative text-center lg:text-left">
                <p
                  className="font-black text-white tracking-tight leading-tight"
                  style={{ fontSize: 'clamp(1.5rem, 4.4vw, 2.8rem)' }}
                >
                  {quotes[q].text}
                </p>
                <footer className="mt-4 sm:mt-5 text-sm text-brand-light font-bold">
                  Coach Fortis <span className="text-text-muted font-normal">· {quotes[q].tag}</span>
                </footer>
              </blockquote>
            </div>

            <div className="flex items-center justify-center lg:justify-start gap-3 sm:gap-4 mt-4 sm:mt-6">
              <button
                onClick={() => go(-1)}
                aria-label="Previous quote"
                className="w-11 h-11 rounded-full border border-dark-border hover:border-brand/50 flex items-center justify-center transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => go(1)}
                aria-label="Next quote"
                className="w-11 h-11 rounded-full border border-dark-border hover:border-brand/50 flex items-center justify-center transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="flex gap-2 ml-1">
                {quotes.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setQ(i)}
                    aria-label={`Quote ${i + 1}`}
                    className="py-3"
                  >
                    <span
                      className={`block h-1.5 rounded-full transition-all ${
                        i === q ? 'w-7 bg-brand' : 'w-3 bg-dark-border'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pulse simulator ───────────────────────────────── */}
      <section id="pulse" className="px-4 sm:px-6 pb-14 sm:pb-20 max-w-5xl mx-auto w-full scroll-mt-20">
        <div className="relative bg-dark-card border border-brand/20 rounded-2xl sm:rounded-3xl p-5 sm:p-10 overflow-hidden">
          <div className="absolute inset-0 bg-radial-orange pointer-events-none opacity-60" />
          <div className="relative">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">How ready are you today?</h2>
            <p className="text-text-secondary text-sm mb-7 sm:mb-8 max-w-lg">
              Move the sliders. This is a simplified preview of how Fortis turns your day into a training decision.
            </p>

            <div className="grid md:grid-cols-[1fr_auto] gap-8 md:gap-10 items-center">
              <div className="space-y-5 sm:space-y-6 order-2 md:order-1">
                <Slider label="Sleep last night" value={sleep} min={4} max={10} step={0.5} unit=" h" onChange={setSleep} />
                <Slider label="Muscle soreness" value={sore} min={0} max={10} unit=" / 10" onChange={setSore} />
                <Slider label="Stress level" value={stress} min={0} max={10} unit=" / 10" onChange={setStress} />
              </div>
              <div className="order-1 md:order-2">
                <PulseRing value={pulse} />
              </div>
            </div>

            <div className="mt-7 sm:mt-8 grid sm:grid-cols-[1fr_auto] gap-4 sm:items-center border-t border-dark-border pt-6">
              <div>
                <div className="text-white font-black text-xl">{plan.title}</div>
                <p className="text-text-secondary text-sm mt-1">{plan.body}</p>
                <p className="text-brand-light text-sm font-bold mt-3">“{plan.coach}”</p>
              </div>
              <Link
                to="/auth/login?tab=register"
                className="fortis-btn-primary inline-flex items-center justify-center gap-2 py-3 px-6 text-sm font-black"
              >
                Get my real score <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────── */}
      <section className="px-4 sm:px-6 pb-14 sm:pb-20 max-w-6xl mx-auto w-full">
        <p className="overline text-center mb-3">What Makes Fortis Different</p>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white text-center mb-8 sm:mb-10 tracking-tight">
          Built around <span className="text-gradient">your data</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <SpotlightCard key={f.title}>
                <div className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/20 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-brand-light" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-white text-sm mb-1">{f.title}</h3>
                  <p className="text-xs text-text-secondary leading-relaxed">{f.desc}</p>
                </div>
              </SpotlightCard>
            );
          })}
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────── */}
      <section className="px-4 sm:px-6 pb-16 sm:pb-24 max-w-6xl mx-auto w-full">
        <p className="overline text-center mb-3">Testimonials</p>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white text-center mb-10 sm:mb-14 tracking-tight max-w-md mx-auto">
          People who train on <span className="text-gradient">the right day</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-8 lg:gap-x-6 items-stretch">
          {testimonials.map((t, i) => (
            <TestimonialCard key={t.name} t={t} featured={i === 1} />
          ))}
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="relative mt-auto overflow-hidden border-t border-dark-border">
        <img
          src={IMG.footer}
          alt=""
          aria-hidden
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover object-[72%_50%] md:object-[75%_50%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-dark-bg/95 via-dark-bg/70 to-dark-bg/30 md:bg-gradient-to-r md:from-dark-bg md:via-dark-bg/70 md:to-transparent" />
        <div className="absolute inset-x-0 top-0 h-24 sm:h-32 bg-gradient-to-b from-dark-bg to-transparent" />

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-8 sm:pb-10">
          <div className="max-w-xl text-center md:text-left mx-auto md:mx-0">
            <h2
              className="font-black text-white tracking-tighter leading-[0.95] mb-4"
              style={{ fontSize: 'clamp(1.9rem, 6vw, 3.6rem)' }}
            >
              The summit doesn't move.
              <br />
              <span className="text-gradient">You do.</span>
            </h2>
            <p className="text-text-secondary mb-6 sm:mb-7 text-sm sm:text-base">
              Join Fortis and start your first adaptive session today. Coach Fortis will meet you where you are.
            </p>
            <Link
              to="/auth/login?tab=register"
              className="fortis-btn-primary inline-flex items-center justify-center gap-2 py-3 px-8 text-sm font-black w-full sm:w-auto"
            >
              Create Account <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="mt-16 sm:mt-20 pt-5 border-t border-white/10 flex flex-col sm:flex-row gap-1.5 sm:gap-2 justify-between text-center sm:text-left text-xs text-text-muted">
            <span>© {new Date().getFullYear()} Fortis AI Fitness</span>
            <span>Adaptive Intelligence Platform</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;