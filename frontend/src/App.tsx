import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import SplashScreen from './components/SplashScreen';
import { useAuthStore } from './stores/authStore';
import { getCached } from './services/api';

// â”€â”€ Lazy-loaded pages (each becomes its own JS chunk) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const Landing        = lazy(() => import('./pages/Landing'));
const AuthPage       = lazy(() => import('./pages/auth/AuthPage'));
const AdminLoginPage = lazy(() => import('./pages/auth/AdminLoginPage'));
const Onboarding     = lazy(() => import('./pages/Onboarding'));
const PlanCreating   = lazy(() => import('./pages/PlanCreating'));
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
const UsagePage      = lazy(() => import('./pages/app/Usage'));
const StorePage      = lazy(() => import('./pages/store/StorePage'));
const AdminShell     = lazy(() => import('./layouts/AdminLayout').then(m => ({ default: m.AdminLayout })));
const AdminRouteGuard = lazy(() => import('./layouts/AdminLayout').then(m => ({ default: m.AdminRouteGuard })));
const AdminAccessDenied = lazy(() => import('./layouts/AdminLayout').then(m => ({ default: m.AdminAccessDeniedPage })));
const AdminDashboard = lazy(() => import('./pages/admin/AdminPages').then(m => ({ default: m.AdminDashboardPage })));
const AdminProducts  = lazy(() => import('./pages/admin/AdminPages').then(m => ({ default: m.AdminProductsPage })));
const AdminCategories = lazy(() => import('./pages/admin/AdminPages').then(m => ({ default: m.AdminCategoriesPage })));
const AdminInventory = lazy(() => import('./pages/admin/AdminPages').then(m => ({ default: m.AdminInventoryPage })));
const AdminOrders    = lazy(() => import('./pages/admin/AdminPages').then(m => ({ default: m.AdminOrdersPage })));
const AdminSettings  = lazy(() => import('./pages/admin/AdminPages').then(m => ({ default: m.AdminSettingsPage })));

// â”€â”€ Page transition loader â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PageLoader = () => <SplashScreen isLoader message="Loading your Fortis workspace…" />;

/** Wrap authenticated routes â€” redirect to /landing if not logged in */
const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  if (isAuthenticated && user?.is_admin) return <Navigate to="/admin/dashboard" replace />;
  return isAuthenticated ? <>{children}</> : <Navigate to="/landing" replace />;
};

const RequireOnboarding: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const complete = useAuthStore((s) => s.onboardingComplete);
  const user = useAuthStore((s) => s.user);
  if (!authenticated) return <Navigate to="/landing" replace />;
  if (user?.is_admin) return <Navigate to="/admin/dashboard" replace />;
  return complete ? <>{children}</> : <Navigate to="/onboarding" replace />;
};

/** Redirect authenticated users away from auth / landing pages directly to dashboard */
const RedirectIfAuthed: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  if (!isAuthenticated) return <>{children}</>;
  return <Navigate to={user?.is_admin ? '/admin/dashboard' : '/dashboard'} replace />;
};

function App() {
  const [splashDone, setSplashDone] = useState(false);

  // Sync latest persisted onboarding status on mount
  useEffect(() => {
    if (useAuthStore.getState().isAuthenticated) {
      getCached<{ onboarding_complete?: boolean; avatar_url?: string; user_id?: number; name?: string; email?: string; is_admin?: boolean }>('/api/auth/me')
        .then((res) => {
          if (res.data?.onboarding_complete !== undefined) {
            useAuthStore.getState().setOnboardingComplete(res.data.onboarding_complete);
          }
          if (res.data?.avatar_url) {
            useAuthStore.getState().updateUser({ avatar_url: res.data.avatar_url });
          }
          if (res.data?.user_id) {
            useAuthStore.getState().updateUser({ id: res.data.user_id, name: res.data.name, email: res.data.email, is_admin: !!res.data.is_admin });
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
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin/access-denied" element={<AdminAccessDenied />} />
          <Route path="/admin" element={<AdminRouteGuard />}>
            <Route element={<AdminShell />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="products" element={<AdminProducts />} />
              <Route path="products/new" element={<AdminProducts />} />
              <Route path="products/:productId/edit" element={<AdminProducts />} />
              <Route path="categories" element={<AdminCategories />} />
              <Route path="inventory" element={<AdminInventory />} />
              <Route path="orders" element={<AdminOrders />} />
              <Route path="orders/:orderId" element={<AdminOrders />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>
          </Route>

          {/* â”€â”€ Onboarding wizard (full-screen, no sidebar) â”€â”€ */}
          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <Onboarding />
              </RequireAuth>
            }
          />
          <Route
            path="/plan-creating"
            element={
              <RequireAuth>
                <PlanCreating />
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
            path="/usage"
            element={
              <RequireOnboarding>
                <AppLayout>
                  <UsagePage />
                </AppLayout>
              </RequireOnboarding>
            }
          />

          <Route path="/store/admin" element={<Navigate to="/admin/products" replace />} />
          <Route path="/store/*" element={<StorePage />} />

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
