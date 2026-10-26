import type { ComponentType } from 'react'
import type { StatsData } from '../lib/api'
import type { SessionDetail } from '../lib/types'

export interface SessionScreenProps {
  detail: SessionDetail
  /** Called after the session was ended (manually or for inactivity); the page reloads it. */
  onEnded: () => void
}

export interface SessionResultProps {
  detail: SessionDetail
}

export interface StatsViewProps {
  data: StatsData
  /** Players to show, in a stable order (colors follow this order). */
  playerIds: string[]
  names: Map<string, string>
  /** 'group' = stats of one group, 'player' = one player across all sessions. */
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
  /** Live scoring screen for an active session. */
  SessionScreen: ComponentType<SessionScreenProps>
  /** Read-only view of an ended session, incl. the summary. */
  SessionResult: ComponentType<SessionResultProps>
  StatsView: ComponentType<StatsViewProps>
  /** Comparison of many players (overall statistics). */
  ComparisonTable: ComponentType<ComparisonTableProps>
}
