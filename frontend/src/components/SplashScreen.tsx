import React, { useEffect, useState } from 'react';
import BrandLogo from './BrandLogo';

/**
 * SplashScreen — shown on first mount while auth state is being restored from localStorage.
 * Fades out automatically after `minMs` milliseconds.
 */
const SplashScreen: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Start fade after 1.4 s, call onDone 400 ms later (after fade)
    const fadeTimer = setTimeout(() => setFading(true), 1400);
    const doneTimer = setTimeout(onDone, 1800);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-dark-bg flex flex-col items-center justify-center transition-opacity duration-400 ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Glow background */}
      <div className="absolute inset-0 bg-radial-orange pointer-events-none" />

      {/* Ghost letter */}
      <div
        className="absolute font-black text-brand pointer-events-none select-none"
        style={{ fontSize: 'clamp(10rem, 40vw, 24rem)', opacity: 0.04, lineHeight: 1 }}
      >
        F
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6">
        <BrandLogo className="h-40 max-h-[45vh] w-auto max-w-[80vw] animate-pulse" />

        {/* Loading bar */}
        <div className="w-48 h-1 bg-dark-border rounded-full overflow-hidden mt-2">
          <div
            className="h-full bg-brand rounded-full transition-all"
            style={{
              width: fading ? '100%' : '70%',
              transitionDuration: '1.2s',
              transitionTimingFunction: 'ease-out',
            }}
          />
        </div>

        <p className="text-xs text-text-muted">Synthesizing your fitness state…</p>
      </div>
    </div>
  );
};

export default SplashScreen;
