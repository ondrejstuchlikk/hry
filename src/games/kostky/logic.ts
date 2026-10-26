// Kostky rules: every player throws once per round, in the order of the draw that
// applies to that round (redrawn each day). Only complete rounds count toward the
// winner; higher total wins.
import type { Draw, ScoredEntry } from '../../lib/types'
import { pickWinners } from '../winners'

export type TurnEntry = Pick<ScoredEntry, 'player_id' | 'round_no' | 'value'>
export type DrawOrder = Pick<Draw, 'from_round' | 'player_ids'>

export interface Turn {
  roundNo: number
  playerId: string
}

function lastRoundNo(entries: TurnEntry[]): number {
  return entries.reduce((max, e) => Math.max(max, e.round_no), 0)
}

/** Turn order of a round: the latest draw starting at or before it (draws sorted by from_round). */
export function orderForRound(draws: DrawOrder[], roundNo: number): string[] {
  let order = draws[0].player_ids
  for (const d of draws) if (d.from_round <= roundNo) order = d.player_ids
  return order
}

/**
 * Whose turn it is: the first player (by that round's order) missing in the last round,
 * else the first player of a new round. A newer draw starts a new round, leaving an
 * unfinished round unfinished.
 */
export function nextTurn(draws: DrawOrder[], entries: TurnEntry[]): Turn {
  const last = lastRoundNo(entries)
  const latest = draws[draws.length - 1]
  if (last < latest.from_round) return { roundNo: latest.from_round, playerId: latest.player_ids[0] }
  const done = new Set(entries.filter((e) => e.round_no === last).map((e) => e.player_id))
  const missing = orderForRound(draws, last).find((id) => !done.has(id))
  return missing ? { roundNo: last, playerId: missing } : { roundNo: last + 1, playerId: orderForRound(draws, last + 1)[0] }
}

/** Round numbers in which every player has an entry. */
export function completeRoundNos(order: string[], entries: TurnEntry[]): Set<number> {
  const counts = new Map<number, Set<string>>()
  for (const e of entries) {
    if (!counts.has(e.round_no)) counts.set(e.round_no, new Set())
    counts.get(e.round_no)!.add(e.player_id)
  }
  const complete = new Set<number>()
  for (const [roundNo, players] of counts) {
    if (order.every((id) => players.has(id))) complete.add(roundNo)
  }
  return complete
}

/** True when the last round has some, but not all, entries. */
export function isRoundInProgress(order: string[], entries: TurnEntry[]): boolean {
  const last = lastRoundNo(entries)
  return last > 0 && !completeRoundNos(order, entries).has(last)
}

/** Total per player; by default only complete rounds count. */
export function sessionTotals(
  order: string[],
  entries: TurnEntry[],
  { onlyComplete = true }: { onlyComplete?: boolean } = {},
): Map<string, number> {
  const complete = completeRoundNos(order, entries)
  const totals = new Map(order.map((id) => [id, 0]))
  for (const e of entries) {
    if (onlyComplete && !complete.has(e.round_no)) continue
    totals.set(e.player_id, (totals.get(e.player_id) ?? 0) + e.value)
  }
  return totals
}

/** Winners over complete rounds; ties give several ids; no complete round → none. */
export function kostkyWinners(order: string[], entries: TurnEntry[]): string[] {
  if (completeRoundNos(order, entries).size === 0) return []
  return pickWinners(sessionTotals(order, entries), 'higher_better')
}

export interface LiveStats {
  total: number
  throws: number
  average: number | null
  zeros: number
  best: number | null
}

/** Per-player stats over all entries of the session (incl. the incomplete round). */
export function liveStats(order: string[], entries: TurnEntry[]): Map<string, LiveStats> {
  const result = new Map<string, LiveStats>(
    order.map((id) => [id, { total: 0, throws: 0, average: null, zeros: 0, best: null }]),
  )
  for (const e of entries) {
    const s = result.get(e.player_id)
    if (!s) continue
    s.total += e.value
    s.throws += 1
    if (e.value === 0) s.zeros += 1
    s.best = s.best === null ? e.value : Math.max(s.best, e.value)
  }
  for (const s of result.values()) s.average = s.throws ? s.total / s.throws : null
  return result
}

/** Parses the input: a non-negative integer, or null for anything else (incl. empty). */
export function parseThrow(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isSafeInteger(value) && value <= 2_147_483_647 ? value : null
}
