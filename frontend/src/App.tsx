import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import SplashScreen from './components/SplashScreen';
import Landing from './pages/Landing';
import AuthPage from './pages/auth/AuthPage';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/app/Dashboard';
import WorkoutPage from './pages/app/Workout';
import NutritionPage from './pages/app/Nutrition';
import RecoveryPage from './pages/app/Recovery';
import ProgressPage from './pages/app/Progress';
import VisionPage from './pages/app/Vision';
import CoachPage from './pages/app/Coach';
import ScanOnboarding from './pages/app/scan/ScanOnboarding';
import ScanCamera from './pages/app/scan/ScanCamera';
import ScanProcessing from './pages/app/scan/ScanProcessing';
import ScanResult from './pages/app/scan/ScanResult';
import ScanBlueprint from './pages/app/scan/ScanBlueprint';
import ScanHistory from './pages/app/scan/ScanHistory';
import ScanComparison from './pages/app/scan/ScanComparison';
import { useAuthStore } from './stores/authStore';
import api from './services/api';

/** Wrap authenticated routes — redirect to /landing if not logged in */
const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/landing" replace />;
};

/** Redirect authenticated users away from auth / landing pages directly to dashboard */
const RedirectIfAuthed: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <>{children}</>;
  return <Navigate to="/dashboard" replace />;
};

function App() {
  const [splashDone, setSplashDone] = useState(false);

  // Sync latest persisted onboarding status on mount
  useEffect(() => {
    if (useAuthStore.getState().isAuthenticated) {
      api.get('/api/auth/me')
        .then((res) => {
          if (res.data?.onboarding_complete !== undefined) {
            useAuthStore.getState().setOnboardingComplete(res.data.onboarding_complete);
          }
        })
        .catch(() => {});
    }
  }, []);

  return (
    <>
      {/* Splash screen — shown until auth state is restored & min time passes */}
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}

      <Router>
        <Routes>
          {/* ── Public routes ───────────────────────────── */}
          <Route
            path="/landing"
            element={
              <RedirectIfAuthed>
                <Landing />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/auth/login"
            element={
              <RedirectIfAuthed>
                <AuthPage />
              </RedirectIfAuthed>
            }
          />

          {/* ── Onboarding wizard (full-screen, no sidebar) ── */}
          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <Onboarding />
              </RequireAuth>
            }
          />

          {/* ── Protected app routes (RequireAuth) ──── */}
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <AppLayout>
                  <Dashboard />
                </AppLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/workout"
            element={
              <RequireAuth>
                <AppLayout>
                  <WorkoutPage />
                </AppLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/nutrition"
            element={
              <RequireAuth>
                <AppLayout>
                  <NutritionPage />
                </AppLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/recovery"
            element={
              <RequireAuth>
                <AppLayout>
                  <RecoveryPage />
                </AppLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/progress"
            element={
              <RequireAuth>
                <AppLayout>
                  <ProgressPage />
                </AppLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/vision"
            element={
              <RequireAuth>
                <AppLayout>
                  <VisionPage />
                </AppLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/coach"
            element={
              <RequireAuth>
                <AppLayout>
                  <CoachPage />
                </AppLayout>
              </RequireAuth>
            }
          />

          {/* ── Scan routes ────────────────────────────── */}
          <Route
            path="/scan"
            element={
              <RequireAuth>
                <AppLayout>
                  <ScanOnboarding />
                </AppLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/scan/camera"
            element={
              <RequireAuth>
                <AppLayout>
                  <ScanCamera />
                </AppLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/scan/processing"
            element={
              <RequireAuth>
                <AppLayout>
                  <ScanProcessing />
                </AppLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/scan/result"
            element={
              <RequireAuth>
                <AppLayout>
                  <ScanResult />
                </AppLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/scan/blueprint"
            element={
              <RequireAuth>
                <AppLayout>
                  <ScanBlueprint />
                </AppLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/scan/history"
            element={
              <RequireAuth>
                <AppLayout>
                  <ScanHistory />
                </AppLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/scan/comparison"
            element={
              <RequireAuth>
                <AppLayout>
                  <ScanComparison />
                </AppLayout>
              </RequireAuth>
            }
          />

          {/* ── Root & Wildcard redirects ──────────────── */}
          <Route
            path="/"
            element={
              <RedirectIfAuthed>
                <Navigate to="/landing" replace />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="*"
            element={
              <RedirectIfAuthed>
                <Navigate to="/landing" replace />
              </RedirectIfAuthed>
            }
          />
        </Routes>
      </Router>
    </>
  );
}

export default App;
