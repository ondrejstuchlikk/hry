export type Scoring = 'higher_better' | 'lower_better'

export interface GameConfig {
  max_warning?: number
  round_complete?: 'all_players' | 'round_winner'
  /** Žolík: most jokers the hand winner may keep. */
  max_jokers?: number
  /** Žolík: smallest value a loser can record. */
  min_loser_value?: number
}

export interface GameType {
  id: string
  name: string
  scoring: Scoring
  config: GameConfig
}

export interface Profile {
  id: string
  username: string
}

export interface Player {
  id: string
  user_id: string | null
  display_name: string
  created_by: string | null
}

export type SessionStatus = 'active' | 'ended'

export interface Session {
  id: string
  game_type_id: string
  created_by: string
  group_key: string
  status: SessionStatus
  ended_reason: 'manual' | 'inactivity' | null
  started_at: string
  last_activity_at: string
  ended_at: string | null
  winner_player_ids: string[] | null
}

export interface SessionPlayerRow {
  session_id: string
  player_id: string
  turn_order: number
}

export interface Round {
  id: string
  session_id: string
  round_no: number
  winner_player_id: string | null
  /** Žolík: who dealt the hand. */
  dealer_player_id: string | null
  /** Žolík: jokers the hand winner keeps for the next hand. */
  jokers_kept: number | null
  /** Žolík: „Pro dnešek konec“ — the partie ends after this hand. */
  ends_partie: boolean
  created_at: string
}

export interface Entry {
  id: string
  round_id: string
  session_id: string
  player_id: string
  value: number
  seq: number
  created_at: string
}

/** An entry enriched with its round number — the shape game logic works with. */
export interface ScoredEntry {
  id: string
  session_id: string
  player_id: string
  round_no: number
  value: number
  seq: number
  created_at: string
}

export interface SessionPlayer {
  id: string
  name: string
  turnOrder: number
  userId: string | null
}

/** Session with its players (sorted by turn order), as used by lists and stats. */
export interface SessionWithPlayers extends Session {
  players: SessionPlayerRow[]
}

/** A turn-order draw; applies from round from_round until the next draw. */
export interface Draw {
  session_id: string
  from_round: number
  /** Turn order, first = starts. */
  player_ids: string[]
  drawn_at: string
}

export interface SessionDetail {
  session: Session
  gameType: GameType
  /** Sorted by the original turn order (stable column order). */
  players: SessionPlayer[]
  rounds: Round[]
  /** Sorted by seq. */
  entries: ScoredEntry[]
  /** Sorted by from_round. */
  draws: Draw[]
}
