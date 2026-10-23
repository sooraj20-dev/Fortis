import React from 'react';
import { clsx } from 'clsx';

type BadgeVariant = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  icon?: React.ElementType;
  dot?: boolean;
}

const VARIANTS: Record<BadgeVariant, string> = {
  brand:   'bg-brand/15 text-brand-light border-brand/25',
  success: 'bg-success/15 text-success border-success/25',
  warning: 'bg-warning/15 text-warning border-warning/25',
  danger:  'bg-danger/15 text-danger border-danger/25',
  info:    'bg-blue-500/15 text-blue-400 border-blue-500/25',
  muted:   'bg-dark-surface text-text-muted border-dark-border',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'muted',
  children,
  className,
  icon: Icon,
  dot = false,
}) => (
  <span
    className={clsx(
      'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border',
      VARIANTS[variant],
      className
    )}
  >
    {dot && (
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full',
          variant === 'success' ? 'bg-success' :
          variant === 'danger'  ? 'bg-danger' :
          variant === 'warning' ? 'bg-warning' :
          variant === 'brand'   ? 'bg-brand' :
          'bg-current'
        )}
      />
    )}
    {Icon && <Icon className="w-3 h-3" />}
    {children}
  </span>
);

export default Badge;
