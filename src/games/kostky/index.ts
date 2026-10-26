import { lazy } from 'react'
import type { GameModule } from '../types'
import { ComparisonTable } from './ComparisonTable'
import { KostkySessionScreen } from './SessionScreen'
import { KostkySessionResult } from './SessionResult'

// Charts are heavy; load them only on the statistics pages.
const KostkyStatsView = lazy(() => import('./StatsView').then((m) => ({ default: m.KostkyStatsView })))

export const kostkyModule: GameModule = {
  id: 'kostky',
  SessionScreen: KostkySessionScreen,
  SessionResult: KostkySessionResult,
  StatsView: KostkyStatsView,
  ComparisonTable,
}
