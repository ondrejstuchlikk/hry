import { lazy } from 'react'
import type { GameModule } from '../types'
import { ComparisonTable } from './ComparisonTable'
import { KostkySessionScreen } from './SessionScreen'

// Charts are heavy; load them on demand.
const KostkyStatsView = lazy(() => import('./StatsView').then((m) => ({ default: m.KostkyStatsView })))

export const kostkyModule: GameModule = {
  id: 'kostky',
  labels: {
    newSession: 'Nová hra',
    startSession: 'Začít hru',
    mySessions: 'Moje hry',
    noSessions: 'Zatím žádné hry – začni tlačítkem „Nová hra“',
  },
  SessionScreen: KostkySessionScreen,
  StatsView: KostkyStatsView,
  ComparisonTable,
}
