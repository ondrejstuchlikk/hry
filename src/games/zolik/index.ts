import { lazy } from 'react'
import type { GameModule } from '../types'
import { ComparisonTable } from './ComparisonTable'
import { ZolikSessionScreen } from './SessionScreen'

// Charts are heavy; load them on demand.
const ZolikStatsView = lazy(() => import('./StatsView').then((m) => ({ default: m.ZolikStatsView })))

export const zolikModule: GameModule = {
  id: 'zolik',
  statsWithRounds: true,
  SessionScreen: ZolikSessionScreen,
  StatsView: ZolikStatsView,
  ComparisonTable,
}
