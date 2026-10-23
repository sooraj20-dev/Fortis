import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, Compass } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center p-6">
      <div className="text-center max-w-md w-full space-y-6">
        {/* Numeric error */}
        <div className="relative inline-block">
          <span
            className="text-[9rem] sm:text-[11rem] font-black leading-none tracking-tighter select-none"
            style={{
              background: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #1e1e2e 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
            aria-hidden="true"
          >
            404
          </span>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black text-text-primary">Page not found</h1>
          <p className="text-text-secondary text-sm leading-relaxed">
            This page doesn't exist or has been moved. Let's get you back on track.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="fortis-btn-secondary flex items-center gap-2 py-2.5 px-5 text-sm w-full sm:w-auto justify-center"
          >
            <ArrowLeft className="w-4 h-4" />
            Go back
          </button>

          <Link
            to={isAuthenticated ? '/dashboard' : '/landing'}
            className="fortis-btn-primary flex items-center gap-2 py-2.5 px-5 text-sm w-full sm:w-auto justify-center"
          >
            <Home className="w-4 h-4" />
            {isAuthenticated ? 'Dashboard' : 'Home'}
          </Link>
        </div>

        {isAuthenticated && (
          <Link
            to="/coach"
            className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-brand-light transition-colors"
          >
            <Compass className="w-3.5 h-3.5" />
            Ask Coach Fortis for directions
          </Link>
        )}
      </div>
    </div>
  );
};

export default NotFoundPage;
