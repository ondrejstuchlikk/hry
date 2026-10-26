import { describe, expect, it } from 'vitest'
import type { StatsData } from '../../lib/api'
import type { ScoredEntry, SessionWithPlayers } from '../../lib/types'
import {
  bucketIndex,
  cumulativeWins,
  headToHead,
  histogram,
  histogramLabels,
  HISTOGRAM_EDGES,
  longestRun,
  median,
  playerSummary,
  starterAdvantage,
} from './stats'

function session(id: string, order: string[], winners: string[] | null, status: 'active' | 'ended' = 'ended'): SessionWithPlayers {
  return {
    id,
    game_type_id: 'kostky',
    created_by: 'u',
    group_key: [...order].sort().join(','),
    status,
    ended_reason: status === 'ended' ? 'manual' : null,
    started_at: `2026-01-0${id.slice(-1)}T20:00:00Z`,
    last_activity_at: '',
    ended_at: null,
    winner_player_ids: winners,
    players: order.map((player_id, turn_order) => ({ session_id: id, player_id, turn_order })),
  }
}

let seq = 0
function entry(session_id: string, player_id: string, round_no: number, value: number): ScoredEntry {
  seq += 1
  return { id: `e${seq}`, session_id, player_id, round_no, value, seq, created_at: '2026-01-01T20:00:00Z' }
}

describe('histogram', () => {
  it('buckets values by inclusive upper edges', () => {
    expect(bucketIndex(0)).toBe(0)
    expect(bucketIndex(1)).toBe(1)
    expect(bucketIndex(100)).toBe(1)
    expect(bucketIndex(101)).toBe(2)
    expect(bucketIndex(5000)).toBe(HISTOGRAM_EDGES.length - 1)
    expect(bucketIndex(5001)).toBe(HISTOGRAM_EDGES.length)
  })

  it('counts values and has one label per bucket', () => {
    const counts = histogram([0, 0, 50, 250, 10000])
    expect(counts).toHaveLength(HISTOGRAM_EDGES.length + 1)
    expect(counts[0]).toBe(2)
    expect(counts[1]).toBe(1)
    expect(counts[2]).toBe(1)
    expect(counts[counts.length - 1]).toBe(1)
    expect(histogramLabels()).toHaveLength(counts.length)
    expect(histogramLabels()[0]).toBe('0')
  })
})

describe('streaks and median', () => {
  it('finds the longest run', () => {
    expect(longestRun([0, 0, 5, 0, 0, 0, 1], (v) => v === 0)).toBe(3)
    expect(longestRun([], () => true)).toBe(0)
  })

  it('computes the median', () => {
    expect(median([])).toBeNull()
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
  })
})

describe('player stats', () => {
  // s1: a wins, s2: b wins, s3: tie, s4: a wins (b started), s5: active
  const data: StatsData = {
    sessions: [
      session('s1', ['a', 'b'], ['a']),
      session('s2', ['a', 'b'], ['b']),
      session('s3', ['a', 'b'], ['a', 'b']),
      session('s4', ['b', 'a'], ['a']),
      session('s5', ['a', 'b'], null, 'active'),
    ],
    entries: [
      entry('s1', 'a', 1, 500),
      entry('s1', 'b', 1, 0),
      entry('s2', 'a', 1, 0),
      entry('s2', 'b', 1, 300),
      entry('s3', 'a', 1, 100),
      entry('s3', 'b', 1, 100),
      entry('s4', 'b', 1, 0),
      entry('s4', 'a', 1, 50),
      entry('s5', 'a', 1, 0),
    ],
    draws: [],
  }

  it('summarises wins, ties, throws and streaks', () => {
    const a = playerSummary(data, 'a')
    expect(a.sessionsPlayed).toBe(5)
    expect(a.wins).toBe(2)
    expect(a.ties).toBe(1)
    expect(a.winRate).toBeCloseTo(2 / 4)
    expect(a.throws).toBe(5)
    expect(a.best?.value).toBe(500)
    expect(a.zeroShare).toBeCloseTo(2 / 5)
    expect(a.longestWinStreak).toBe(1)
    // s5 has no complete round → excluded from session totals
    expect(a.averageSessionTotal).toBeCloseTo((500 + 0 + 100 + 50) / 4)
    expect(a.bestSession?.total).toBe(500)

    const b = playerSummary(data, 'b')
    expect(b.longestZeroStreak).toBe(1)
    expect(b.wins).toBe(1)
  })

  it('counts the longest win streak over consecutive sessions', () => {
    const streak: StatsData = {
      sessions: [session('s1', ['a', 'b'], ['a']), session('s2', ['a', 'b'], ['a']), session('s3', ['a', 'b'], ['b'])],
      entries: [],
      draws: [],
    }
    expect(playerSummary(streak, 'a').longestWinStreak).toBe(2)
  })

  it('builds cumulative wins', () => {
    const rows = cumulativeWins(data, ['a', 'b'])
    expect(rows.map((r) => r.a)).toEqual([1, 1, 1, 2])
    expect(rows.map((r) => r.b)).toEqual([0, 1, 1, 1])
  })

  it('computes head-to-head over complete-round totals', () => {
    expect(headToHead(data, ['a', 'b'])).toEqual([{ a: 'a', b: 'b', games: 4, aBetter: 2, bBetter: 1, equal: 1 }])
  })

  it('computes the starting player advantage', () => {
    // Starters: s1 a (won), s2 a (lost), s3 a (tie), s4 b (lost)
    const adv = starterAdvantage(data)
    expect(adv.games).toBe(4)
    expect(adv.starterWins).toBe(1)
    expect(adv.othersRate).toBeCloseTo(2 / 4)
  })
})
