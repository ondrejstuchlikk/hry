import type { ComponentType } from 'react'
import type { StatsData } from '../lib/api'
import type { SessionDetail } from '../lib/types'

export interface SessionScreenProps {
  detail: SessionDetail
  /** Show the draw animation of the current turn order right away (new game). */
  showDraw: boolean
  onDrawShown: () => void
}

export interface StatsViewProps {
  data: StatsData
  /** Players to show, in a stable order (colors follow this order). */
  playerIds: string[]
  names: Map<string, string>
  /** 'group' = stats of one group (game page), 'player' = one player across all sessions. */
  mode: 'group' | 'player'
}

export interface ComparisonTableProps {
  data: StatsData
  playerIds: string[]
  names: Map<string, string>
}

/**
 * Everything game-specific lives behind this interface: turn handling, entry UI,
 * winner rules and the statistics set. Add a new game in src/games/<id>/ and register it.
 */
export interface GameModule {
  id: string
  /** Game-specific wording on the games page and in the new-session dialog. */
  labels: {
    /** „Nová hra“ */
    newSession: string
    /** „Začít hru“ */
    startSession: string
    /** „Moje hry“ */
    mySessions: string
    /** Empty „Moje hry“ list. */
    noSessions: string
  }
  /** Statistics need the rounds (loadStatsData withRounds). */
  statsWithRounds?: boolean
  /** Scoring screen of an (endless) session, incl. its statistics. */
  SessionScreen: ComponentType<SessionScreenProps>
  StatsView: ComponentType<StatsViewProps>
  /** Comparison of many players (overall statistics). */
  ComparisonTable: ComponentType<ComparisonTableProps>
}
