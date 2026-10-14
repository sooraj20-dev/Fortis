import React from 'react';

interface BrandLogoProps {
  className?: string;
}

const BrandLogo: React.FC<BrandLogoProps> = ({ className = '' }) => (
  <img
    src="/fortis-logo-trim.png"
    alt="Fortis Performance Systems"
    className={`object-contain ${className}`}
  />
);

export default BrandLogo;
