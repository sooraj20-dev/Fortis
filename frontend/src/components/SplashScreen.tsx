import React, { useEffect, useState } from 'react';
import BrandLogo from './BrandLogo';

/**
 * Branded intro & loader: the logo lights up over the sunset while a heartbeat line draws itself
 * (a nod to Fortis Pulse), then the screen fades out (or stays active when used as a loader).
 */
const FADE_AT_MS = 1000;
const DONE_AT_MS = 1400;
const SEEN_KEY = 'fortis_splash_seen';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const alreadySeen = () => {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
};

interface SplashScreenProps {
  onDone?: () => void;
  isLoader?: boolean;
  message?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onDone,
  isLoader = false,
  message = 'Synthesizing your Personal Fitness State…',
}) => {
  const [skip] = useState(() => (isLoader ? false : alreadySeen()));
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (isLoader) return;
    if (skip) {
      onDone?.();
      return;
    }
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* storage unavailable, splash will simply play again next time */
    }
    const quick = prefersReducedMotion();
    const fadeTimer = setTimeout(() => setFading(true), quick ? 100 : FADE_AT_MS);
    const doneTimer = setTimeout(() => onDone?.(), quick ? 300 : DONE_AT_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone, skip, isLoader]);

  if (skip) return null;

  return (
    <div
      role="status"
      aria-label="Loading Fortis"
      className={`fixed inset-0 z-[9999] bg-dark-bg flex flex-col items-center justify-center overflow-hidden transition-all duration-[400ms] ease-out ${
        fading ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      <style>{`
        @keyframes sp-zoom   { from { transform: scale(1.02); } to { transform: scale(1.14); } }
        @keyframes sp-logo   { 0% { opacity: 0; transform: scale(.86); filter: blur(10px); } 60% { opacity: 1; filter: blur(0); } 100% { opacity: 1; transform: scale(1); filter: blur(0); } }
        @keyframes sp-draw   { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes sp-ember  { 0% { transform: translateY(0) scale(1); opacity: 0; } 20% { opacity: .9; } 100% { transform: translateY(-70vh) scale(.3); opacity: 0; } }
        @keyframes sp-text   { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .sp-bg    { animation: sp-zoom 1.6s ease-out forwards; }
        .sp-logo  { animation: sp-logo .8s cubic-bezier(.2,.7,.2,1) both; }
        .sp-line  { stroke-dasharray: 1; stroke-dashoffset: 1; animation: sp-draw .9s .35s ease-in-out forwards; }
        .sp-ember { position: absolute; bottom: -8px; border-radius: 9999px; background: #ff5a1f; filter: blur(1px); animation: sp-ember linear infinite; }
        .sp-text  { opacity: 0; animation: sp-text .5s .7s ease forwards; }
        @media (prefers-reduced-motion: reduce) {
          .sp-bg, .sp-logo, .sp-ember, .sp-text { animation: none !important; opacity: 1; }
          .sp-line { animation: none !important; stroke-dashoffset: 0; }
        }
      `}</style>

      {/* Sunset backdrop */}
      <img
        src="/landing_imgs/footer.png"
        alt=""
        aria-hidden
        className="sp-bg absolute inset-0 w-full h-full object-cover object-[72%_50%] opacity-30"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-dark-bg via-dark-bg/70 to-dark-bg pointer-events-none" />
      <div className="absolute inset-0 bg-radial-orange pointer-events-none" />

      {/* Embers */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="sp-ember"
            style={{
              left: `${(i * 83 + 7) % 100}%`,
              width: 3 + (i % 3) * 2,
              height: 3 + (i % 3) * 2,
              animationDuration: `${1.8 + (i % 5) * 0.5}s`,
              animationDelay: `${(i % 6) * 0.2}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center gap-5 px-6 text-center">
        <BrandLogo glow shine className="sp-logo h-32 sm:h-40 max-h-[38vh] w-auto max-w-[80vw]" />

        {/* Heartbeat line (draws itself) */}
        <svg viewBox="0 0 220 60" className="w-56 sm:w-64 h-auto overflow-visible" aria-hidden>
          <path
            d="M0 30 H66 L78 30 L90 8 L104 52 L117 18 L126 30 H220"
            pathLength={1}
            fill="none"
            stroke="#ff5a1f"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="sp-line"
            style={{ filter: 'drop-shadow(0 0 6px rgba(255,90,31,0.8))' }}
          />
        </svg>

        <p className="sp-text text-sm font-medium text-text-secondary">{message}</p>
      </div>
    </div>
  );
};

export default SplashScreen;