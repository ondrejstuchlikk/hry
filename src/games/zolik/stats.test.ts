import { describe, expect, it } from 'vitest'
import type { StatsData } from '../../lib/api'
import type { Round, ScoredEntry, SessionWithPlayers } from '../../lib/types'
import {
  buildPartien,
  dealerAdvantage,
  handsByGroup,
  handsProgress,
  headToHead,
  jokerStats,
  lossBucketIndex,
  lossHistogramLabels,
  LOSS_EDGES,
  partieProgress,
  playerSummary,
} from './stats'

const T0 = Date.parse('2026-03-01T19:00:00Z')
const DAY = 24 * 60

function session(id: string, order: string[]): SessionWithPlayers {
  return {
    id,
    game_type_id: 'zolik',
    created_by: 'u',
    group_key: [...order].sort().join(','),
    status: 'active',
    ended_reason: null,
    started_at: new Date(T0).toISOString(),
    last_activity_at: '',
    ended_at: null,
    winner_player_ids: null,
    players: order.map((player_id, turn_order) => ({ session_id: id, player_id, turn_order })),
  }
}

/** Builds rounds + entries; each hand: [minutes, dealer, values, jokers?]. */
function data(
  sessions: SessionWithPlayers[],
  hands: [string, number, string, Record<string, number>, number?][],
): StatsData {
  const rounds: Round[] = []
  const entries: ScoredEntry[] = []
  const counters = new Map<string, number>()
  for (const [sessionId, minutes, dealer, values, jokers = 0] of hands) {
    const no = (counters.get(sessionId) ?? 0) + 1
    counters.set(sessionId, no)
    const created_at = new Date(T0 + minutes * 60_000).toISOString()
    const winner = Object.entries(values).find(([, v]) => v === 0)![0]
    rounds.push({
      id: `${sessionId}-${no}`,
      session_id: sessionId,
      round_no: no,
      winner_player_id: winner,
      dealer_player_id: dealer,
      jokers_kept: jokers,
      ends_partie: false,
      created_at,
    })
    for (const [player_id, value] of Object.entries(values)) {
      entries.push({ id: `${sessionId}-${no}-${player_id}`, session_id: sessionId, player_id, round_no: no, value, seq: entries.length + 1, created_at })
    }
  }
  return { sessions, entries, draws: [], rounds }
}

const NOW = T0 + 30 * DAY * 60_000

// Partie 1 (day 0): a wins (5 vs 40). Partie 2 (day 1): b wins (30 vs 3). Partie 3 (day 2): tie.
const sample = data(
  [session('s1', ['a', 'b'])],
  [
    ['s1', 0, 'a', { a: 0, b: 25 }, 2],
    ['s1', 10, 'b', { a: 5, b: 0 }],
    ['s1', 20, 'a', { a: 0, b: 15 }],
    ['s1', DAY, 'a', { a: 30, b: 0 }],
    ['s1', DAY + 10, 'b', { a: 0, b: 3 }],
    ['s1', 2 * DAY, 'b', { a: 0, b: 10 }, 1],
    ['s1', 2 * DAY + 5, 'a', { a: 10, b: 0 }],
  ],
)

describe('partie', () => {
  it('splits by pauses and finds winners with lower_better', () => {
    const partien = buildPartien(sample, NOW)
    expect(partien.map((p) => p.hands.length)).toEqual([3, 2, 2])
    expect(partien.map((p) => p.winners)).toEqual([['a'], ['b'], ['a', 'b']])
    expect(partien.every((p) => !p.inProgress)).toBe(true)
  })

  it('has no result for the partie in progress', () => {
    const partien = buildPartien(sample, T0 + (2 * DAY + 10) * 60_000)
    expect(partien[2].inProgress).toBe(true)
    expect(partien[2].winners).toEqual([])
  })

  it('tracks running totals within a partie', () => {
    const rows = partieProgress(buildPartien(sample, NOW)[0], ['a', 'b'])
    expect(rows.map((r) => [r.a, r.b])).toEqual([
      [0, 0],
      [0, 25],
      [5, 25],
      [5, 40],
    ])
  })

  it('tracks running totals across the whole game', () => {
    const rows = handsProgress(buildPartien(sample, NOW).flatMap((p) => p.hands), ['a', 'b'])
    expect(rows).toHaveLength(8)
    expect([rows[7].a, rows[7].b]).toEqual([45, 53])
    expect(rows[0].date).toBeNull()
    expect(rows[4].date).toBe(new Date(T0 + DAY * 60_000).toISOString())
  })
})

describe('player summary', () => {
  it('summarises partie and hands', () => {
    const s = playerSummary(buildPartien(sample, NOW), 'a')
    expect(s.partiePlayed).toBe(3)
    expect(s.partieWins).toBe(1)
    expect(s.partieTies).toBe(1)
    expect(s.partieWinRate).toBeCloseTo(1 / 3)
    expect(s.hands).toBe(7)
    expect(s.handsWon).toBe(4)
    expect(s.averageLoss).toBeCloseTo((5 + 30 + 10) / 3)
    expect(s.averagePerHand).toBeCloseTo(45 / 7)
    expect(s.worstLoss?.value).toBe(30)
    expect(s.bestPartie?.total).toBe(5)
    expect(s.worstPartie?.total).toBe(30)
    expect(s.longestHandWinStreak).toBe(2)
    expect(s.longestPartieWinStreak).toBe(1)
  })
})

describe('histogram of losses', () => {
  it('buckets by inclusive upper edges', () => {
    expect(lossBucketIndex(1)).toBe(0)
    expect(lossBucketIndex(10)).toBe(0)
    expect(lossBucketIndex(11)).toBe(1)
    expect(lossBucketIndex(200)).toBe(LOSS_EDGES.length - 1)
    expect(lossBucketIndex(201)).toBe(LOSS_EDGES.length)
    expect(lossHistogramLabels()).toEqual(['1–10', '11–25', '26–50', '51–100', '101–200', '> 200'])
  })
})

describe('dealer advantage', () => {
  it('compares dealer and non-dealer win rates with the 1/n baseline', () => {
    const d = dealerAdvantage(buildPartien(sample, NOW).flatMap((p) => p.hands), ['a', 'b'])
    // Dealer won hands 1, 2, 3 → 3 of 7.
    expect(d.hands).toBe(7)
    expect(d.dealerWins).toBe(3)
    expect(d.dealerRate).toBeCloseTo(3 / 7)
    expect(d.othersRate).toBeCloseTo(4 / 7)
    expect(d.baseline).toBeCloseTo(0.5)
    // a dealt hands 1, 3, 4, 7 and won 1, 3; a won 5, 6 while b dealt.
    expect(d.perPlayer.get('a')).toEqual({ dealt: 4, winsDealing: 2, notDealt: 3, winsNotDealing: 2 })
  })

  it('uses 1/n per hand for the baseline', () => {
    const three = data(
      [session('s', ['a', 'b', 'c'])],
      [
        ['s', 0, 'a', { a: 0, b: 5, c: 5 }],
        ['s', 5, 'b', { a: 0, b: 5, c: 5 }],
      ],
    )
    const d = dealerAdvantage(buildPartien(three, NOW).flatMap((p) => p.hands), ['a', 'b', 'c'])
    expect(d.baseline).toBeCloseTo(1 / 3)
    expect(d.dealerRate).toBeCloseTo(1 / 2)
    expect(d.othersRate).toBeCloseTo(1 / 4)
  })
})

describe('jokers', () => {
  it('counts kept jokers and the win rate of the following hand, across partie', () => {
    const j = jokerStats(handsByGroup(buildPartien(sample, NOW)), ['a', 'b'])
    // a kept 2 in hand 1 → lost hand 2; kept 1 in hand 6 → lost hand 7.
    expect(j.get('a')).toMatchObject({ keptHands: 2, keptTotal: 3, followHands: 2, followWins: 0, handsWon: 4, hands: 7 })
    expect(j.get('b')).toMatchObject({ keptHands: 0, followHands: 0 })

    const acrossPartie = data(
      [session('s', ['a', 'b'])],
      [
        ['s', 0, 'a', { a: 7, b: 0 }, 3],
        ['s', 7 * DAY, 'a', { a: 4, b: 0 }],
      ],
    )
    const k = jokerStats(handsByGroup(buildPartien(acrossPartie, NOW)), ['b'])
    expect(k.get('b')).toMatchObject({ keptHands: 1, followHands: 1, followWins: 1 })
  })
})

describe('head to head', () => {
  it('counts lower totals in shared finished partie', () => {
    const [h] = headToHead(buildPartien(sample, NOW), ['a', 'b'])
    expect(h).toMatchObject({ partien: 3, aBetter: 1, bBetter: 1, equal: 1 })
  })
})
