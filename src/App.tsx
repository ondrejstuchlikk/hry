import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import { AuthProvider, useAuth } from './lib/AuthProvider'
import { isSupabaseConfigured } from './lib/supabase'
import { GamesPage } from './pages/GamesPage'
import { LoginPage } from './pages/LoginPage'
import { SessionPage } from './pages/SessionPage'
import { SettingsPage } from './pages/SettingsPage'
import { SetupPage } from './pages/SetupPage'

// The statistics page pulls in the charting library; load it on demand.
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
          path="celkove"
          element={
            <Suspense fallback={<Spinner />}>
              <OverallStatsPage />
            </Suspense>
          }
        />
        <Route path="nastaveni" element={<SettingsPage />} />
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
