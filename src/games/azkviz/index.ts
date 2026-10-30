import { lazy } from 'react'
import type { GameModule } from '../types'
import { ComparisonTable } from './ComparisonTable'
import { AzkvizSessionScreen } from './SessionScreen'

// Charts are heavy; load them on demand.
const AzkvizStatsView = lazy(() => import('./StatsView').then((m) => ({ default: m.AzkvizStatsView })))

export const azkvizModule: GameModule = {
  id: 'azkviz',
  statsWithRounds: true,
  labels: { newSession: 'Nová epizoda', startSession: 'Začít epizodu' },
  offerLastLineup: true,
  SessionScreen: AzkvizSessionScreen,
  StatsView: AzkvizStatsView,
  ComparisonTable,
}
