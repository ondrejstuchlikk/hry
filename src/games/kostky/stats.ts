// Pure statistics for Kostky. Inputs come from loadStatsData (chronological order).
import type { StatsData } from '../../lib/api'
import type { ScoredEntry, SessionWithPlayers } from '../../lib/types'
import { formatNumber } from '../../lib/format'
import { isBetter } from '../winners'
import { completeRoundNos, sessionTotals } from './logic'

// ---------------------------------------------------------------------------
// Histogram
// ---------------------------------------------------------------------------

/** Upper bucket edges (inclusive). Buckets: 0, 1–100, 101–300, …, 2 001–5 000, > 5 000. */
export const HISTOGRAM_EDGES = [0, 100, 300, 500, 1000, 2000, 5000] as const

export function histogramLabels(): string[] {
  const labels = ['0']
  for (let i = 1; i < HISTOGRAM_EDGES.length; i++) {
    labels.push(`${formatNumber(HISTOGRAM_EDGES[i - 1] + 1)}–${formatNumber(HISTOGRAM_EDGES[i])}`)
  }
  labels.push(`> ${formatNumber(HISTOGRAM_EDGES[HISTOGRAM_EDGES.length - 1])}`)
  return labels
}

export function bucketIndex(value: number): number {
  const i = HISTOGRAM_EDGES.findIndex((edge) => value <= edge)
  return i === -1 ? HISTOGRAM_EDGES.length : i
}

export function histogram(values: number[]): number[] {
  const counts = new Array<number>(HISTOGRAM_EDGES.length + 1).fill(0)
  for (const v of values) counts[bucketIndex(v)] += 1
  return counts
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Length of the longest run of consecutive items matching the predicate. */
export function longestRun<T>(items: T[], predicate: (item: T) => boolean): number {
  let best = 0
  let current = 0
  for (const item of items) {
    current = predicate(item) ? current + 1 : 0
    best = Math.max(best, current)
  }
  return best
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

function playerOrder(session: SessionWithPlayers): string[] {
  return [...session.players].sort((a, b) => a.turn_order - b.turn_order).map((p) => p.player_id)
}

/** Groups entries by session id (keeps chronological order). */
export function entriesBySession(entries: ScoredEntry[]): Map<string, ScoredEntry[]> {
  const map = new Map<string, ScoredEntry[]>()
  for (const e of entries) {
    if (!map.has(e.session_id)) map.set(e.session_id, [])
    map.get(e.session_id)!.push(e)
  }
  return map
}

export interface SessionScore {
  /** Complete-round totals per player. */
  totals: Map<string, number>
  completeRounds: number
}

/** Complete-round totals per session. */
export function scoresBySession(data: StatsData): Map<string, SessionScore> {
  const bySession = entriesBySession(data.entries)
  return new Map(
    data.sessions.map((s) => {
      const order = playerOrder(s)
      const entries = bySession.get(s.id) ?? []
      return [s.id, { totals: sessionTotals(order, entries), completeRounds: completeRoundNos(order, entries).size }]
    }),
  )
}

export type Outcome = 'win' | 'tie' | 'loss' | 'none'

/** Result of an ended session for a player (stored winners are authoritative). */
export function outcomeFor(session: SessionWithPlayers, playerId: string): Outcome {
  const winners = session.winner_player_ids
  if (session.status !== 'ended' || !winners || winners.length === 0) return 'none'
  if (!winners.includes(playerId)) return 'loss'
  return winners.length === 1 ? 'win' : 'tie'
}

// ---------------------------------------------------------------------------
// Per-player summary
// ---------------------------------------------------------------------------

export interface PlayerSummary {
  playerId: string
  sessionsPlayed: number
  wins: number
  ties: number
  /** Wins / ended sessions with a result. */
  winRate: number | null
  throws: number
  average: number | null
  median: number | null
  best: { value: number; date: string } | null
  zeroShare: number | null
  averageSessionTotal: number | null
  bestSession: { total: number; date: string } | null
  longestZeroStreak: number
  longestWinStreak: number
}

export function playerSummary(
  data: StatsData,
  playerId: string,
  scores: Map<string, SessionScore> = scoresBySession(data),
): PlayerSummary {
  const sessions = data.sessions.filter((s) => s.players.some((p) => p.player_id === playerId))
  const sessionIds = new Set(sessions.map((s) => s.id))
  const entries = data.entries.filter((e) => e.player_id === playerId && sessionIds.has(e.session_id))
  const values = entries.map((e) => e.value)

  const outcomes = sessions.map((s) => outcomeFor(s, playerId))
  const decided = outcomes.filter((o) => o !== 'none')
  const wins = outcomes.filter((o) => o === 'win').length

  let best: PlayerSummary['best'] = null
  for (const e of entries) {
    if (!best || e.value > best.value) best = { value: e.value, date: e.created_at }
  }

  // Session totals only for sessions with at least one complete round.
  const sessionTotalsList: { total: number; date: string }[] = []
  for (const s of sessions) {
    const score = scores.get(s.id)
    if (!score || score.completeRounds === 0) continue
    sessionTotalsList.push({ total: score.totals.get(playerId) ?? 0, date: s.started_at })
  }
  let bestSession: PlayerSummary['bestSession'] = null
  for (const st of sessionTotalsList) {
    if (!bestSession || st.total > bestSession.total) bestSession = st
  }

  return {
    playerId,
    sessionsPlayed: sessions.length,
    wins,
    ties: outcomes.filter((o) => o === 'tie').length,
    winRate: decided.length ? wins / decided.length : null,
    throws: values.length,
    average: average(values),
    median: median(values),
    best,
    zeroShare: values.length ? values.filter((v) => v === 0).length / values.length : null,
    averageSessionTotal: average(sessionTotalsList.map((s) => s.total)),
    bestSession,
    longestZeroStreak: longestRun(values, (v) => v === 0),
    longestWinStreak: longestRun(decided, (o) => o === 'win'),
  }
}

// ---------------------------------------------------------------------------
// Chart series
// ---------------------------------------------------------------------------

export type SeriesRow = { key: string; label: string } & Record<string, number | string | null>

function sessionsOf(data: StatsData, playerIds: string[]): SessionWithPlayers[] {
  return data.sessions.filter((s) => playerIds.some((id) => s.players.some((p) => p.player_id === id)))
}

/** Cumulative sole wins per player after each ended session. */
export function cumulativeWins(data: StatsData, playerIds: string[]): SeriesRow[] {
  const counts = new Map(playerIds.map((id) => [id, 0]))
  return sessionsOf(data, playerIds)
    .filter((s) => s.status === 'ended')
    .map((s) => {
      const row: SeriesRow = { key: s.id, label: s.started_at }
      for (const id of playerIds) {
        if (outcomeFor(s, id) === 'win') counts.set(id, counts.get(id)! + 1)
        row[id] = counts.get(id)!
      }
      return row
    })
}

/** Average throw per session per player, plus an optional trailing moving average (`<id>_ma`). */
export function averagePerSession(data: StatsData, playerIds: string[], movingWindow = 0): SeriesRow[] {
  const bySession = entriesBySession(data.entries)
  const rows = sessionsOf(data, playerIds).map((s) => {
    const row: SeriesRow = { key: s.id, label: s.started_at }
    const entries = bySession.get(s.id) ?? []
    for (const id of playerIds) {
      row[id] = average(entries.filter((e) => e.player_id === id).map((e) => e.value))
    }
    return row
  })
  if (movingWindow > 1) {
    for (const id of playerIds) {
      const history: number[] = []
      for (const row of rows) {
        const v = row[id]
        if (typeof v === 'number') history.push(v)
        const window = history.slice(-movingWindow)
        row[`${id}_ma`] = typeof v === 'number' ? average(window) : null
      }
    }
  }
  return rows
}

/** Complete-round total per session per player. */
export function totalPerSession(data: StatsData, playerIds: string[]): SeriesRow[] {
  const scores = scoresBySession(data)
  return sessionsOf(data, playerIds)
    .filter((s) => (scores.get(s.id)?.completeRounds ?? 0) > 0)
    .map((s) => {
      const row: SeriesRow = { key: s.id, label: s.started_at }
      const totals = scores.get(s.id)!.totals
      for (const id of playerIds) row[id] = totals.get(id) ?? null
      return row
    })
}

/** Share of throws per histogram bucket per player (0–1). */
export function histogramSeries(data: StatsData, playerIds: string[]): SeriesRow[] {
  const labels = histogramLabels()
  const perPlayer = new Map(
    playerIds.map((id) => {
      const values = data.entries.filter((e) => e.player_id === id).map((e) => e.value)
      const counts = histogram(values)
      return [id, counts.map((c) => (values.length ? c / values.length : 0))]
    }),
  )
  return labels.map((label, i) => {
    const row: SeriesRow = { key: String(i), label }
    for (const id of playerIds) row[id] = perPlayer.get(id)![i]
    return row
  })
}

/** Average throw value by hour of day (only hours with data). */
export function averageByHour(data: StatsData, playerIds: string[]): SeriesRow[] {
  const rows: SeriesRow[] = []
  for (let hour = 0; hour < 24; hour++) {
    const row: SeriesRow = { key: String(hour), label: `${hour}:00` }
    let any = false
    for (const id of playerIds) {
      const values = data.entries
        .filter((e) => e.player_id === id && new Date(e.created_at).getHours() === hour)
        .map((e) => e.value)
      row[id] = average(values)
      if (values.length) any = true
    }
    if (any) rows.push(row)
  }
  return rows
}

export interface StarterAdvantage {
  games: number
  starterWins: number
  starterRate: number | null
  /** Average sole-win rate of the non-starting players. */
  othersRate: number | null
}

/** Win rate of the player who started vs. the others (ended sessions with a result). */
export function starterAdvantage(data: StatsData, playerIds?: string[]): StarterAdvantage {
  let games = 0
  let starterWins = 0
  let otherWins = 0
  let otherSlots = 0
  for (const s of data.sessions) {
    if (s.status !== 'ended' || !s.winner_player_ids?.length) continue
    if (playerIds && !playerIds.some((id) => s.players.some((p) => p.player_id === id))) continue
    const order = playerOrder(s)
    games += 1
    if (outcomeFor(s, order[0]) === 'win') starterWins += 1
    for (const id of order.slice(1)) if (outcomeFor(s, id) === 'win') otherWins += 1
    otherSlots += order.length - 1
  }
  return {
    games,
    starterWins,
    starterRate: games ? starterWins / games : null,
    othersRate: otherSlots ? otherWins / otherSlots : null,
  }
}

export interface HeadToHead {
  a: string
  b: string
  games: number
  aBetter: number
  bBetter: number
  equal: number
}

/** For each pair: in how many shared sessions (with a complete round) each had the better total. */
export function headToHead(data: StatsData, playerIds: string[]): HeadToHead[] {
  const scores = scoresBySession(data)
  const result: HeadToHead[] = []
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      const h: HeadToHead = { a: playerIds[i], b: playerIds[j], games: 0, aBetter: 0, bBetter: 0, equal: 0 }
      for (const s of data.sessions) {
        const score = scores.get(s.id)
        if (!score || score.completeRounds === 0) continue
        const t = score.totals
        if (!t.has(h.a) || !t.has(h.b)) continue
        const ta = t.get(h.a)!
        const tb = t.get(h.b)!
        h.games += 1
        if (isBetter(ta, tb, 'higher_better')) h.aBetter += 1
        else if (isBetter(tb, ta, 'higher_better')) h.bBetter += 1
        else h.equal += 1
      }
      result.push(h)
    }
  }
  return result
}

/** Ids of all players appearing in the data, by number of sessions played (desc). */
export function allPlayerIds(data: StatsData): string[] {
  const counts = new Map<string, number>()
  for (const s of data.sessions) for (const p of s.players) counts.set(p.player_id, (counts.get(p.player_id) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).map(([id]) => id)
}

// ---------------------------------------------------------------------------
// All-time progress by round
// ---------------------------------------------------------------------------

export interface ProgressRow extends SeriesRow {
  /** 1-based round index over all loaded sessions (chronological). */
  round: number
  date: string
}

/**
 * One row per round (chronological, across sessions): cumulative points per player (`<id>`),
 * their average over the last `formWindow` throws (`<id>_form`), and — for two players — the
 * lead of the first over the second (`lead`). Expects raw data (entries ordered by seq).
 */
export function progressByRound(data: StatsData, playerIds: string[], formWindow = 20): ProgressRow[] {
  const totals = new Map(playerIds.map((id) => [id, 0]))
  const recent = new Map<string, number[]>(playerIds.map((id) => [id, []]))
  const rows: ProgressRow[] = []
  let currentKey = ''
  let row: ProgressRow | null = null

  for (const e of data.entries) {
    if (!totals.has(e.player_id)) continue
    const key = `${e.session_id}:${e.round_no}`
    if (key !== currentKey) {
      currentKey = key
      row = { key, label: String(rows.length + 1), round: rows.length + 1, date: e.created_at }
      rows.push(row)
    }
    totals.set(e.player_id, totals.get(e.player_id)! + e.value)
    const last = recent.get(e.player_id)!
    last.push(e.value)
    if (last.length > formWindow) last.shift()
    // Every row carries the running state of all players.
    for (const id of playerIds) {
      row![id] = totals.get(id)!
      const values = recent.get(id)!
      row![`${id}_form`] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
    }
    if (playerIds.length === 2) row!.lead = totals.get(playerIds[0])! - totals.get(playerIds[1])!
  }
  return rows
}
