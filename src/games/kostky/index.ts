import { lazy } from 'react'
import type { GameModule } from '../types'
import { ComparisonTable } from './ComparisonTable'
import { KostkySessionScreen } from './SessionScreen'

// Charts are heavy; load them on demand.
const KostkyStatsView = lazy(() => import('./StatsView').then((m) => ({ default: m.KostkyStatsView })))

export const kostkyModule: GameModule = {
  id: 'kostky',
  SessionScreen: KostkySessionScreen,
  StatsView: KostkyStatsView,
  ComparisonTable,
}
