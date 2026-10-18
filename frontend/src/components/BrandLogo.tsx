import React from 'react';

interface BrandLogoProps {
  className?: string;
  /** Soft brand-orange glow behind the logo that intensifies on hover. */
  glow?: boolean;
  /** A light band sweeps across the logo shape every few seconds. */
  shine?: boolean;
}

const LOGO_SRC = '/fortis-logo-trim.png';

/**
 * Fortis logo.
 * With no extra props it renders exactly like before (a plain <img>), so every existing
 * usage keeps working. `glow` and `shine` are opt-in flourishes.
 */
const BrandLogo: React.FC<BrandLogoProps> = ({ className = '', glow = false, shine = false }) => {
  const glowCls = glow
    ? 'drop-shadow-[0_0_10px_rgba(255,90,31,0.35)] hover:drop-shadow-[0_0_22px_rgba(255,90,31,0.7)] transition-[filter] duration-300'
    : '';

  const img = (
    <img
      src={LOGO_SRC}
      alt="Fortis Performance Systems"
      draggable={false}
      className={`object-contain select-none ${glowCls} ${className}`}
    />
  );

  if (!shine) return img;

  // The sweep is masked by the logo's own pixels, so light only ever appears ON the logo.
  return (
    <span className="relative inline-flex align-middle">
      <style>{`
        @keyframes fortis-logo-shine {
          0%, 55% { background-position: 160% 0; }
          100%    { background-position: -60% 0; }
        }
        @media (prefers-reduced-motion: reduce) { .fortis-logo-shine { animation: none !important; opacity: 0; } }
      `}</style>
      {img}
      <span
        aria-hidden
        className="fortis-logo-shine pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.75) 50%, transparent 62%)',
          backgroundSize: '250% 100%',
          backgroundRepeat: 'no-repeat',
          WebkitMaskImage: `url(${LOGO_SRC})`,
          maskImage: `url(${LOGO_SRC})`,
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          mixBlendMode: 'overlay',
          animation: 'fortis-logo-shine 4.2s ease-in-out infinite',
        }}
      />
    </span>
  );
};

export default BrandLogo;