import React from 'react';
import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';
import { clsx } from 'clsx';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  offline?: boolean;
  className?: string;
  compact?: boolean;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  retrying = false,
  offline = false,
  className,
  compact = false,
}) => {
  const Icon = offline ? WifiOff : AlertCircle;

  if (compact) {
    return (
      <div
        role="alert"
        className={clsx(
          'flex items-center gap-3 p-3 rounded-xl border bg-danger/10 border-danger/30 text-sm',
          className
        )}
      >
        <Icon className="w-4 h-4 text-danger shrink-0" />
        <span className="text-danger flex-1">{message}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={retrying}
            className="shrink-0 text-xs font-semibold text-danger hover:text-danger/80 underline disabled:opacity-50 flex items-center gap-1"
          >
            {retrying && <RefreshCw className="w-3 h-3 animate-spin" />}
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={clsx(
        'flex flex-col items-center text-center p-8 bg-dark-card border border-dark-border rounded-2xl space-y-4',
        className
      )}
    >
      <div className="w-14 h-14 rounded-2xl bg-danger/10 border border-danger/30 flex items-center justify-center">
        <Icon className="w-7 h-7 text-danger" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-bold text-text-primary">{title}</p>
        <p className="text-sm text-text-secondary max-w-xs">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={retrying}
          className="fortis-btn-secondary flex items-center gap-2 py-2 px-5 text-sm disabled:opacity-50"
        >
          <RefreshCw className={clsx('w-4 h-4', retrying && 'animate-spin')} />
          {retrying ? 'Retrying…' : 'Try again'}
        </button>
      )}
    </div>
  );
};

export default ErrorState;
