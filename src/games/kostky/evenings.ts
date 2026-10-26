// Games never end, so wins and per-game stats are computed per "evening":
// a pause of at least EVENING_BREAK_MS between throws starts a new evening.
import type { StatsData } from '../../lib/api'
import type { ScoredEntry, SessionWithPlayers } from '../../lib/types'
import { kostkyWinners, orderForRound, type DrawOrder } from './logic'

export const EVENING_BREAK_MS = 60 * 60 * 1000

/**
 * Splits one session's entries (sorted by seq) into evenings. A whole round belongs to
 * the evening of its first throw, so complete rounds never span two evenings.
 */
export function splitEvenings<T extends Pick<ScoredEntry, 'round_no' | 'created_at'>>(entries: T[]): T[][] {
  const evenings: T[][] = []
  const roundEvening = new Map<number, number>()
  let previous: number | null = null
  for (const e of entries) {
    const time = Date.parse(e.created_at)
    if (previous === null || time - previous >= EVENING_BREAK_MS) evenings.push([])
    previous = time
    let index = roundEvening.get(e.round_no)
    if (index === undefined) {
      index = evenings.length - 1
      roundEvening.set(e.round_no, index)
    }
    evenings[index].push(e)
  }
  return evenings.filter((evening) => evening.length > 0)
}

/** Entries of the evening in progress (empty after a long enough pause). */
export function currentEvening<T extends Pick<ScoredEntry, 'round_no' | 'created_at'>>(
  entries: T[],
  now = Date.now(),
): T[] {
  const last = entries[entries.length - 1]
  if (!last || now - Date.parse(last.created_at) >= EVENING_BREAK_MS) return []
  const evenings = splitEvenings(entries)
  return evenings[evenings.length - 1]
}

/**
 * Turns endless sessions into one pseudo-session per evening, so the statistics can treat
 * evenings like finished games: the turn order is the draw of the evening's first round,
 * winners come from its complete rounds, and the evening still in progress has no result.
 */
export function eveningStats(data: StatsData, now = Date.now()): StatsData {
  const sessions: SessionWithPlayers[] = []
  const entries: ScoredEntry[] = []

  for (const session of data.sessions) {
    const sessionEntries = data.entries.filter((e) => e.session_id === session.id)
    const ownDraws = data.draws.filter((d) => d.session_id === session.id).sort((a, b) => a.from_round - b.from_round)
    const draws: DrawOrder[] = ownDraws.length
      ? ownDraws
      : [{ from_round: 1, player_ids: [...session.players].sort((a, b) => a.turn_order - b.turn_order).map((p) => p.player_id) }]

    splitEvenings(sessionEntries).forEach((evening, i, all) => {
      const id = `${session.id}#${i + 1}`
      const firstRound = Math.min(...evening.map((e) => e.round_no))
      const order = orderForRound(draws, firstRound)
      const startedAt = evening[0].created_at
      const lastAt = evening.reduce((max, e) => (e.created_at > max ? e.created_at : max), startedAt)
      const inProgress = i === all.length - 1 && now - Date.parse(lastAt) < EVENING_BREAK_MS
      sessions.push({
        ...session,
        id,
        status: inProgress ? 'active' : 'ended',
        started_at: startedAt,
        last_activity_at: lastAt,
        ended_at: inProgress ? null : lastAt,
        winner_player_ids: inProgress ? null : kostkyWinners(order, evening),
        players: order.map((player_id, turn_order) => ({ session_id: id, player_id, turn_order })),
      })
      for (const e of evening) entries.push({ ...e, session_id: id })
    })
  }

  sessions.sort((a, b) => a.started_at.localeCompare(b.started_at))
  const index = new Map(sessions.map((s, i) => [s.id, i]))
  entries.sort((a, b) => index.get(a.session_id)! - index.get(b.session_id)! || a.seq - b.seq)
  return { sessions, entries, draws: [] }
}
