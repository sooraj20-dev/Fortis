import React from 'react';
import { clsx } from 'clsx';

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  className,
  size = 'md',
}) => {
  const sizes = {
    sm: { wrapper: 'py-8', icon: 'w-8 h-8', title: 'text-sm', desc: 'text-xs' },
    md: { wrapper: 'py-12', icon: 'w-10 h-10', title: 'text-base', desc: 'text-sm' },
    lg: { wrapper: 'py-16', icon: 'w-12 h-12', title: 'text-lg', desc: 'text-sm' },
  }[size];

  return (
    <div
      className={clsx(
        'text-center flex flex-col items-center border border-dashed border-dark-border rounded-2xl',
        sizes.wrapper,
        'px-6',
        className
      )}
    >
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-dark-surface border border-dark-border flex items-center justify-center mb-4">
          <Icon className={clsx(sizes.icon, 'text-text-muted opacity-60')} />
        </div>
      )}
      <p className={clsx('font-bold text-text-primary mb-1', sizes.title)}>{title}</p>
      {description && (
        <p className={clsx('text-text-muted max-w-xs leading-relaxed', sizes.desc)}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

export default EmptyState;
