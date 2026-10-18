import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import SplashScreen from './components/SplashScreen';
import { useAuthStore } from './stores/authStore';
import { getCached } from './services/api';

// â”€â”€ Lazy-loaded pages (each becomes its own JS chunk) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const Landing        = lazy(() => import('./pages/Landing'));
const AuthPage       = lazy(() => import('./pages/auth/AuthPage'));
const Onboarding     = lazy(() => import('./pages/Onboarding'));
const Dashboard      = lazy(() => import('./pages/app/Dashboard'));
const WorkoutPage    = lazy(() => import('./pages/app/Workout'));
const NutritionPage  = lazy(() => import('./pages/app/Nutrition'));
const RecoveryPage   = lazy(() => import('./pages/app/Recovery'));
const ProgressPage   = lazy(() => import('./pages/app/Progress'));
const VisionPage     = lazy(() => import('./pages/app/Vision'));
const CoachPage      = lazy(() => import('./pages/app/Coach'));
const ProfilePage    = lazy(() => import('./pages/app/Profile'));
const ScanOnboarding = lazy(() => import('./pages/app/scan/ScanOnboarding'));
const ScanCamera     = lazy(() => import('./pages/app/scan/ScanCamera'));
const ScanProcessing = lazy(() => import('./pages/app/scan/ScanProcessing'));
const ScanResult     = lazy(() => import('./pages/app/scan/ScanResult'));
const ScanBlueprint  = lazy(() => import('./pages/app/scan/ScanBlueprint'));
const ScanHistory    = lazy(() => import('./pages/app/scan/ScanHistory'));
const ScanComparison = lazy(() => import('./pages/app/scan/ScanComparison'));

// â”€â”€ Page transition loader â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PageLoader = () => <SplashScreen isLoader message="Loading your Fortis workspace…" />;

/** Wrap authenticated routes â€” redirect to /landing if not logged in */
const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/landing" replace />;
};

const RequireOnboarding: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const complete = useAuthStore((s) => s.onboardingComplete);
  if (!authenticated) return <Navigate to="/landing" replace />;
  return complete ? <>{children}</> : <Navigate to="/onboarding" replace />;
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
      getCached<{ onboarding_complete?: boolean; avatar_url?: string }>('/api/auth/me')
        .then((res) => {
          if (res.data?.onboarding_complete !== undefined) {
            useAuthStore.getState().setOnboardingComplete(res.data.onboarding_complete);
          }
          if (res.data?.avatar_url) {
            useAuthStore.getState().updateUser({ avatar_url: res.data.avatar_url });
          }
        })
        .catch(() => {});
    }
  }, []);

  return (
    <>
      {/* Splash screen â€” shown until auth state is restored & min time passes */}
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}

      <Router>
        <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* â”€â”€ Public routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

          {/* â”€â”€ Onboarding wizard (full-screen, no sidebar) â”€â”€ */}
          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <Onboarding />
              </RequireAuth>
            }
          />

          {/* â”€â”€ Protected app routes (RequireAuth) â”€â”€â”€â”€ */}
          <Route
            path="/dashboard"
            element={
              <RequireOnboarding>
                <AppLayout>
                  <Dashboard />
                </AppLayout>
              </RequireOnboarding>
            }
          />
          <Route
            path="/workout"
            element={
              <RequireOnboarding>
                <AppLayout>
                  <WorkoutPage />
                </AppLayout>
              </RequireOnboarding>
            }
          />
          <Route
            path="/nutrition"
            element={
              <RequireOnboarding>
                <AppLayout>
                  <NutritionPage />
                </AppLayout>
              </RequireOnboarding>
            }
          />
          <Route
            path="/recovery"
            element={
              <RequireOnboarding>
                <AppLayout>
                  <RecoveryPage />
                </AppLayout>
              </RequireOnboarding>
            }
          />
          <Route
            path="/progress"
            element={
              <RequireOnboarding>
                <AppLayout>
                  <ProgressPage />
                </AppLayout>
              </RequireOnboarding>
            }
          />
          <Route
            path="/vision"
            element={
              <RequireOnboarding>
                <AppLayout>
                  <VisionPage />
                </AppLayout>
              </RequireOnboarding>
            }
          />
          <Route
            path="/coach"
            element={
              <RequireOnboarding>
                <AppLayout>
                  <CoachPage />
                </AppLayout>
              </RequireOnboarding>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireOnboarding>
                <AppLayout>
                  <ProfilePage />
                </AppLayout>
              </RequireOnboarding>
            }
          />

          {/* â”€â”€ Scan routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <Route
            path="/scan"
            element={
              <RequireOnboarding>
                <AppLayout>
                  <ScanOnboarding />
                </AppLayout>
              </RequireOnboarding>
            }
          />
          <Route
            path="/scan/camera"
            element={
              <RequireOnboarding>
                <AppLayout>
                  <ScanCamera />
                </AppLayout>
              </RequireOnboarding>
            }
          />
          <Route
            path="/scan/processing"
            element={
              <RequireOnboarding>
                <AppLayout>
                  <ScanProcessing />
                </AppLayout>
              </RequireOnboarding>
            }
          />
          <Route
            path="/scan/result"
            element={
              <RequireOnboarding>
                <AppLayout>
                  <ScanResult />
                </AppLayout>
              </RequireOnboarding>
            }
          />
          <Route
            path="/scan/blueprint"
            element={
              <RequireOnboarding>
                <AppLayout>
                  <ScanBlueprint />
                </AppLayout>
              </RequireOnboarding>
            }
          />
          <Route
            path="/scan/history"
            element={
              <RequireOnboarding>
                <AppLayout>
                  <ScanHistory />
                </AppLayout>
              </RequireOnboarding>
            }
          />
          <Route
            path="/scan/comparison"
            element={
              <RequireOnboarding>
                <AppLayout>
                  <ScanComparison />
                </AppLayout>
              </RequireOnboarding>
            }
          />

          {/* â”€â”€ Root & Wildcard redirects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
        </Suspense>
      </Router>
    </>
  );
}

export default App;
