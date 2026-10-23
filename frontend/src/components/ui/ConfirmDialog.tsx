import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { clsx } from 'clsx';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
  loading = false,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby={description ? 'confirm-desc' : undefined}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative z-10 bg-dark-card border border-dark-border rounded-2xl p-6 shadow-2xl max-w-sm w-full animate-slide-up">
        <button
          onClick={onCancel}
          aria-label="Close dialog"
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center space-y-3 mb-6">
          <div className={clsx(
            'w-12 h-12 rounded-xl flex items-center justify-center',
            variant === 'destructive' ? 'bg-danger/15 border border-danger/30' : 'bg-brand/15 border border-brand/30'
          )}>
            <AlertTriangle className={clsx('w-6 h-6', variant === 'destructive' ? 'text-danger' : 'text-brand')} />
          </div>
          <h2 id="confirm-title" className="font-bold text-base text-text-primary">{title}</h2>
          {description && (
            <p id="confirm-desc" className="text-sm text-text-secondary leading-relaxed">{description}</p>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={loading}
            className="fortis-btn-secondary flex-1 py-2.5 text-sm"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={clsx(
              'flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-150 active:scale-95 disabled:opacity-50',
              variant === 'destructive'
                ? 'bg-danger hover:bg-red-700 text-white'
                : 'fortis-btn-primary'
            )}
          >
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
