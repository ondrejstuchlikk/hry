// Pure statistics for Žolík. Inputs come from loadStatsData({ withRounds: true }).
// Games are endless; results are per partie (see splitPartie). The partie in progress
// counts for per-hand stats but has no result yet.
import type { StatsData } from '../../lib/api'
import { formatNumber } from '../../lib/format'
import { isBetter } from '../winners'
import { buildHands, isPartieOpen, partieTotals, partieWinners, splitPartie, type ZolikHand } from './logic'

export interface Partie {
  /** `<session id>#<n>` */
  id: string
  sessionId: string
  groupKey: string
  playerIds: string[]
  hands: ZolikHand[]
  startedAt: string
  endedAt: string
  inProgress: boolean
  totals: Map<string, number>
  /** Empty while in progress. */
  winners: string[]
}

/** All partie of the data, chronologically. */
export function buildPartien(data: StatsData, now = Date.now()): Partie[] {
  const hands = buildHands(data.rounds ?? [], data.entries)
  const bySession = new Map<string, ZolikHand[]>()
  for (const hand of hands) {
    if (!bySession.has(hand.sessionId)) bySession.set(hand.sessionId, [])
    bySession.get(hand.sessionId)!.push(hand)
  }

  const result: Partie[] = []
  for (const session of data.sessions) {
    const playerIds = [...session.players].sort((a, b) => a.turn_order - b.turn_order).map((p) => p.player_id)
    const all = splitPartie(bySession.get(session.id) ?? [])
    all.forEach((partieHands, i) => {
      const inProgress = i === all.length - 1 && isPartieOpen(partieHands, now)
      result.push({
        id: `${session.id}#${i + 1}`,
        sessionId: session.id,
        groupKey: session.group_key,
        playerIds,
        hands: partieHands,
        startedAt: partieHands[0].createdAt,
        endedAt: partieHands[partieHands.length - 1].createdAt,
        inProgress,
        totals: partieTotals(playerIds, partieHands),
        winners: inProgress ? [] : partieWinners(playerIds, partieHands),
      })
    })
  }
  return result.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

/** Hands of each group (group_key), chronologically across sessions and partie. */
export function handsByGroup(partien: Partie[]): Map<string, ZolikHand[]> {
  const groups = new Map<string, ZolikHand[]>()
  for (const p of partien) {
    if (!groups.has(p.groupKey)) groups.set(p.groupKey, [])
    groups.get(p.groupKey)!.push(...p.hands)
  }
  for (const hands of groups.values()) hands.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.roundNo - b.roundNo)
  return groups
}

export type Outcome = 'win' | 'tie' | 'loss' | 'none'

export function outcomeFor(partie: Partie, playerId: string): Outcome {
  if (partie.inProgress || partie.winners.length === 0 || !partie.playerIds.includes(playerId)) return 'none'
  if (!partie.winners.includes(playerId)) return 'loss'
  return partie.winners.length === 1 ? 'win' : 'tie'
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

function longestRun<T>(items: T[], predicate: (item: T) => boolean): number {
  let best = 0
  let current = 0
  for (const item of items) {
    current = predicate(item) ? current + 1 : 0
    best = Math.max(best, current)
  }
  return best
}

const playsIn = (hand: ZolikHand, playerId: string) => hand.values[playerId] !== undefined

// ---------------------------------------------------------------------------
// Per-player summary
// ---------------------------------------------------------------------------

export interface ZolikSummary {
  playerId: string
  partiePlayed: number
  partieWins: number
  partieTies: number
  /** Wins / finished partie. */
  partieWinRate: number | null
  hands: number
  handsWon: number
  handWinRate: number | null
  /** Mean of the losses (values ≥ 1). */
  averageLoss: number | null
  /** Mean over all hands, wins counted as 0. */
  averagePerHand: number | null
  worstLoss: { value: number; date: string } | null
  bestPartie: { total: number; date: string } | null
  worstPartie: { total: number; date: string } | null
  longestHandWinStreak: number
  longestPartieWinStreak: number
}

export function playerSummary(partien: Partie[], playerId: string): ZolikSummary {
  const own = partien.filter((p) => p.playerIds.includes(playerId))
  const hands = own.flatMap((p) => p.hands).filter((h) => playsIn(h, playerId))
  const values = hands.map((h) => h.values[playerId])
  const losses = values.filter((v) => v > 0)
  const outcomes = own.map((p) => outcomeFor(p, playerId)).filter((o) => o !== 'none')
  const wins = outcomes.filter((o) => o === 'win').length
  const won = hands.filter((h) => h.winnerId === playerId).length

  let worstLoss: ZolikSummary['worstLoss'] = null
  for (const h of hands) {
    const v = h.values[playerId]
    if (v > 0 && (!worstLoss || v > worstLoss.value)) worstLoss = { value: v, date: h.createdAt }
  }
  let bestPartie: ZolikSummary['bestPartie'] = null
  let worstPartie: ZolikSummary['worstPartie'] = null
  for (const p of own) {
    if (p.inProgress) continue
    const total = p.totals.get(playerId) ?? 0
    if (!bestPartie || total < bestPartie.total) bestPartie = { total, date: p.startedAt }
    if (!worstPartie || total > worstPartie.total) worstPartie = { total, date: p.startedAt }
  }

  return {
    playerId,
    partiePlayed: own.length,
    partieWins: wins,
    partieTies: outcomes.filter((o) => o === 'tie').length,
    partieWinRate: outcomes.length ? wins / outcomes.length : null,
    hands: hands.length,
    handsWon: won,
    handWinRate: hands.length ? won / hands.length : null,
    averageLoss: average(losses),
    averagePerHand: average(values),
    worstLoss,
    bestPartie,
    worstPartie,
    longestHandWinStreak: longestRun(hands, (h) => h.winnerId === playerId),
    longestPartieWinStreak: longestRun(outcomes, (o) => o === 'win'),
  }
}

// ---------------------------------------------------------------------------
// Chart series
// ---------------------------------------------------------------------------

export type SeriesRow = { key: string; label: string } & Record<string, number | string | null>

const involving = (partien: Partie[], playerIds: string[]) =>
  partien.filter((p) => playerIds.some((id) => p.playerIds.includes(id)))

/** Cumulative sole partie wins per player after each finished partie. */
export function cumulativeWins(partien: Partie[], playerIds: string[]): SeriesRow[] {
  const counts = new Map(playerIds.map((id) => [id, 0]))
  return involving(partien, playerIds)
    .filter((p) => !p.inProgress)
    .map((p) => {
      const row: SeriesRow = { key: p.id, label: p.startedAt }
      for (const id of playerIds) {
        if (outcomeFor(p, id) === 'win') counts.set(id, counts.get(id)! + 1)
        row[id] = counts.get(id)!
      }
      return row
    })
}

/** Average points per hand in each partie, per player. */
export function averagePerPartie(partien: Partie[], playerIds: string[]): SeriesRow[] {
  return involving(partien, playerIds).map((p) => {
    const row: SeriesRow = { key: p.id, label: p.startedAt }
    for (const id of playerIds) {
      row[id] = average(p.hands.filter((h) => playsIn(h, id)).map((h) => h.values[id]))
    }
    return row
  })
}

/** Running totals within one partie (x = hand number, 0 = start). */
export function partieProgress(partie: Partie, playerIds: string[]): SeriesRow[] {
  const totals = new Map(playerIds.map((id) => [id, 0]))
  const start: SeriesRow = { key: '0', label: '0', hand: 0 }
  for (const id of playerIds) start[id] = 0
  const rows = [start]
  partie.hands.forEach((h, i) => {
    const row: SeriesRow = { key: String(i + 1), label: String(i + 1), hand: i + 1 }
    for (const id of playerIds) {
      if (h.values[id] !== undefined) totals.set(id, totals.get(id)! + h.values[id])
      row[id] = totals.get(id)!
    }
    rows.push(row)
  })
  return rows
}

/** Upper edges (inclusive) of the losing-value buckets: 1–10, 11–25, …, 101–200, > 200. */
export const LOSS_EDGES = [10, 25, 50, 100, 200] as const

export function lossBucketIndex(value: number): number {
  const i = LOSS_EDGES.findIndex((edge) => value <= edge)
  return i === -1 ? LOSS_EDGES.length : i
}

export function lossHistogramLabels(): string[] {
  const labels: string[] = []
  let from = 1
  for (const edge of LOSS_EDGES) {
    labels.push(`${formatNumber(from)}–${formatNumber(edge)}`)
    from = edge + 1
  }
  labels.push(`> ${formatNumber(LOSS_EDGES[LOSS_EDGES.length - 1])}`)
  return labels
}

/** Share of losses per bucket per player (0–1). */
export function lossHistogram(partien: Partie[], playerIds: string[]): SeriesRow[] {
  const labels = lossHistogramLabels()
  const hands = partien.flatMap((p) => p.hands)
  const perPlayer = new Map(
    playerIds.map((id) => {
      const losses = hands.map((h) => h.values[id]).filter((v) => v !== undefined && v > 0)
      const counts = new Array<number>(labels.length).fill(0)
      for (const v of losses) counts[lossBucketIndex(v)] += 1
      return [id, counts.map((c) => (losses.length ? c / losses.length : 0))]
    }),
  )
  return labels.map((label, i) => {
    const row: SeriesRow = { key: String(i), label }
    for (const id of playerIds) row[id] = perPlayer.get(id)![i]
    return row
  })
}

// ---------------------------------------------------------------------------
// Dealer advantage
// ---------------------------------------------------------------------------

export interface DealerPlayerStats {
  dealt: number
  winsDealing: number
  notDealt: number
  winsNotDealing: number
}

export interface DealerAdvantage {
  /** Hands with a known dealer and winner. */
  hands: number
  dealerWins: number
  dealerRate: number | null
  /** Hand win rate of a non-dealing player. */
  othersRate: number | null
  /** Expected win rate without any advantage: average of 1/n. */
  baseline: number | null
  perPlayer: Map<string, DealerPlayerStats>
}

export function dealerAdvantage(hands: ZolikHand[], playerIds: string[]): DealerAdvantage {
  const perPlayer = new Map<string, DealerPlayerStats>(
    playerIds.map((id) => [id, { dealt: 0, winsDealing: 0, notDealt: 0, winsNotDealing: 0 }]),
  )
  let counted = 0
  let dealerWins = 0
  let otherSlots = 0
  let otherWins = 0
  let baselineSum = 0
  for (const h of hands) {
    if (!h.dealerId || !h.winnerId) continue
    const n = Object.keys(h.values).length
    if (n < 2) continue
    counted += 1
    baselineSum += 1 / n
    if (h.winnerId === h.dealerId) dealerWins += 1
    else otherWins += 1
    otherSlots += n - 1
    for (const [id, s] of perPlayer) {
      if (!playsIn(h, id)) continue
      if (h.dealerId === id) {
        s.dealt += 1
        if (h.winnerId === id) s.winsDealing += 1
      } else {
        s.notDealt += 1
        if (h.winnerId === id) s.winsNotDealing += 1
      }
    }
  }
  return {
    hands: counted,
    dealerWins,
    dealerRate: counted ? dealerWins / counted : null,
    othersRate: otherSlots ? otherWins / otherSlots : null,
    baseline: counted ? baselineSum / counted : null,
    perPlayer,
  }
}

// ---------------------------------------------------------------------------
// Jokers
// ---------------------------------------------------------------------------

export interface JokerStats {
  /** Hands won with ≥ 1 joker kept. */
  keptHands: number
  keptTotal: number
  handsWon: number
  /** Hands right after one where the player kept ≥ 1 joker (same group, across partie). */
  followHands: number
  followWins: number
  hands: number
}

/** Expects each group's hands chronologically (handsByGroup). */
export function jokerStats(groups: Map<string, ZolikHand[]>, playerIds: string[]): Map<string, JokerStats> {
  const result = new Map<string, JokerStats>(
    playerIds.map((id) => [id, { keptHands: 0, keptTotal: 0, handsWon: 0, followHands: 0, followWins: 0, hands: 0 }]),
  )
  for (const hands of groups.values()) {
    hands.forEach((h, i) => {
      for (const [id, s] of result) {
        if (!playsIn(h, id)) continue
        s.hands += 1
        if (h.winnerId === id) {
          s.handsWon += 1
          if (h.jokersKept > 0) {
            s.keptHands += 1
            s.keptTotal += h.jokersKept
          }
        }
        const previous = hands[i - 1]
        if (previous && previous.winnerId === id && previous.jokersKept > 0) {
          s.followHands += 1
          if (h.winnerId === id) s.followWins += 1
        }
      }
    })
  }
  return result
}

// ---------------------------------------------------------------------------
// Head to head
// ---------------------------------------------------------------------------

export interface HeadToHead {
  a: string
  b: string
  partien: number
  aBetter: number
  bBetter: number
  equal: number
}

/** For each pair: in how many shared finished partie each had the lower total. */
export function headToHead(partien: Partie[], playerIds: string[]): HeadToHead[] {
  const result: HeadToHead[] = []
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      const h: HeadToHead = { a: playerIds[i], b: playerIds[j], partien: 0, aBetter: 0, bBetter: 0, equal: 0 }
      for (const p of partien) {
        if (p.inProgress || !p.playerIds.includes(h.a) || !p.playerIds.includes(h.b)) continue
        const ta = p.totals.get(h.a)!
        const tb = p.totals.get(h.b)!
        h.partien += 1
        if (isBetter(ta, tb, 'lower_better')) h.aBetter += 1
        else if (isBetter(tb, ta, 'lower_better')) h.bBetter += 1
        else h.equal += 1
      }
      if (h.partien > 0) result.push(h)
    }
  }
  return result
}
