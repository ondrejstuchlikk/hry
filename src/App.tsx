import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import { AuthProvider, useAuth } from './lib/AuthProvider'
import { isSupabaseConfigured } from './lib/supabase'
import { GamesPage } from './pages/GamesPage'
import { LoginPage } from './pages/LoginPage'
import { SessionPage } from './pages/SessionPage'
import { SetupPage } from './pages/SetupPage'

// Statistics pages pull in the charting library; load them on demand.
const StatsPage = lazy(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })))
const OverallStatsPage = lazy(() => import('./pages/OverallStatsPage').then((m) => ({ default: m.OverallStatsPage })))

function AppRoutes() {
  const { loading, authSession } = useAuth()
  if (loading) return <Spinner />
  if (!authSession) return <LoginPage />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<GamesPage />} />
        <Route path="hra/:sessionId" element={<SessionPage />} />
        <Route
          path="statistiky"
          element={
            <Suspense fallback={<Spinner />}>
              <StatsPage />
            </Suspense>
          }
        />
        <Route
          path="celkove"
          element={
            <Suspense fallback={<Spinner />}>
              <OverallStatsPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupPage />
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  )
}
