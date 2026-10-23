import React from 'react';
import { clsx } from 'clsx';

interface SkeletonProps {
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  width?: string;
  height?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  rounded = 'xl',
  width,
  height,
}) => (
  <div
    aria-hidden="true"
    className={clsx(
      'animate-pulse bg-dark-card border border-dark-border/50',
      `rounded-${rounded}`,
      className
    )}
    style={{ width, height }}
  />
);

export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({
  lines = 2,
  className,
}) => (
  <div className={clsx('space-y-2', className)} aria-hidden="true">
    {Array.from({ length: lines }).map((_, i) => (
      <div
        key={i}
        className="h-3 bg-dark-card border border-dark-border/50 rounded-lg animate-pulse"
        style={{ width: i === lines - 1 ? '65%' : '100%' }}
      />
    ))}
  </div>
);

export const CardSkeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div
    aria-hidden="true"
    className={clsx(
      'bg-dark-card border border-dark-border rounded-2xl p-4 space-y-3 animate-pulse',
      className
    )}
  >
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-lg bg-dark-surface" />
      <div className="h-3 bg-dark-surface rounded-lg w-24" />
    </div>
    <div className="h-5 bg-dark-surface rounded-lg w-32" />
    <div className="h-2 bg-dark-surface rounded-lg w-full" />
    <div className="h-2 bg-dark-surface rounded-lg w-3/4" />
  </div>
);

export const DashboardSkeleton: React.FC = () => (
  <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 pb-12" aria-busy="true" aria-label="Loading dashboard…">
    {/* Hero */}
    <Skeleton className="w-full h-48 sm:h-56" rounded="2xl" />
    {/* Stats strip */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[0, 1, 2, 3].map((i) => <CardSkeleton key={i} />)}
    </div>
    {/* Main grid */}
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
      <div className="lg:col-span-7">
        <Skeleton className="w-full h-80" rounded="2xl" />
      </div>
      <div className="lg:col-span-5 space-y-4">
        <Skeleton className="w-full h-36" rounded="2xl" />
        <Skeleton className="w-full h-28" rounded="2xl" />
        <Skeleton className="w-full h-24" rounded="2xl" />
      </div>
    </div>
    {/* Bottom grid */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
      <Skeleton className="w-full h-48" rounded="2xl" />
      <Skeleton className="w-full h-48" rounded="2xl" />
    </div>
  </div>
);

export default Skeleton;
