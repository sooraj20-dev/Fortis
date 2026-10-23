import React from 'react';
import { clsx } from 'clsx';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

const SIZES = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  className,
  label = 'Loading…',
}) => (
  <span
    role="status"
    aria-label={label}
    className={clsx('inline-block animate-spin rounded-full border-2 border-current border-t-transparent', SIZES[size], className)}
  />
);

export const FullPageSpinner: React.FC<{ message?: string }> = ({ message }) => (
  <div
    role="status"
    className="min-h-[40vh] flex flex-col items-center justify-center gap-3 text-text-muted"
  >
    <Spinner size="lg" className="text-brand" />
    {message && <p className="text-sm text-text-secondary">{message}</p>}
  </div>
);

export default Spinner;
