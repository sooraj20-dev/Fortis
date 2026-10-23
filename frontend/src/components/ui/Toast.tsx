import React, { useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useUIStore, type Toast } from '../../stores/uiStore';

const ICONS = {
  success: { Icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10 border-success/30' },
  error:   { Icon: XCircle,      color: 'text-danger',  bg: 'bg-danger/10 border-danger/30' },
  warning: { Icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10 border-warning/30' },
  info:    { Icon: Info,          color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
};

const ToastItem: React.FC<{ toast: Toast }> = ({ toast }) => {
  const removeToast = useUIStore((s) => s.removeToast);
  const { Icon, color, bg } = ICONS[toast.variant ?? 'info'];

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm
        text-sm font-medium text-text-primary min-w-[280px] max-w-sm
        animate-slide-up ${bg}`}
    >
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
      <span className="flex-1 break-words">{toast.message}</span>
      <button
        onClick={() => removeToast(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 text-text-muted hover:text-text-primary transition-colors mt-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const toasts = useUIStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-20 md:bottom-6 right-4 z-[100] flex flex-col gap-2 items-end"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
};

export default ToastContainer;
