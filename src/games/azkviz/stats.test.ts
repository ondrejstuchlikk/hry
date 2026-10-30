import { describe, expect, it } from 'vitest'
import type { Round, SessionWithPlayers } from '../../lib/types'
import {
  averagePointsExcept,
  buildEpisodes,
  cumulativeWins,
  headToHead,
  nobodyShare,
  outcomeFor,
  playerSummary,
  pointsPerEpisode,
  questionProgress,
} from './stats'

const T0 = Date.parse('2026-10-01T18:00:00Z')
const DAY = 24 * 60
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()
const NOW = T0 + 30 * DAY * 60_000

function session(id: string, players: string[]): SessionWithPlayers {
  return {
    id,
    game_type_id: 'azkviz',
    created_by: 'u',
    group_key: [...players].sort().join(','),
    status: 'active',
    ended_reason: null,
    started_at: at(0),
    last_activity_at: at(0),
    ended_at: null,
    winner_player_ids: null,
    players: players.map((p, i) => ({ session_id: id, player_id: p, turn_order: i })),
  }
}

/** One episode per day: `days[d]` = winners of its questions. */
function rounds(sessionId: string, days: (string | null)[][], startDay = 0): Round[] {
  let no = 0
  return days.flatMap((winners, d) =>
    winners.map((w, i) => {
      no += 1
      return {
        id: `${sessionId}-${no}`,
        session_id: sessionId,
        round_no: no,
        winner_player_id: w,
        dealer_player_id: null,
        jokers_kept: null,
        ends_partie: false,
        created_at: at((startDay + d) * DAY + i),
      }
    }),
  )
}

const ab = session('s1', ['a', 'b'])
const data = {
  sessions: [ab],
  rounds: rounds('s1', [
    ['a', 'a', 'b', null], // a wins 2:1
    ['b', null, null], // b wins 1:0
    ['a', 'b'], // tie
    [null, null], // no points → no winner
    ['a', 'a', 'a', 'b'], // a wins 3:1
  ]),
}

describe('episodes and summary', () => {
  const episodes = buildEpisodes(data, { now: NOW })

  it('derives one episode per pause with winners', () => {
    expect(episodes.map((e) => e.winners)).toEqual([['a'], ['b'], ['a', 'b'], [], ['a']])
    expect(outcomeFor(episodes[2], 'a')).toBe('tie')
    expect(outcomeFor(episodes[3], 'a')).toBe('none')
  })

  it('summarizes a player', () => {
    const s = playerSummary(episodes, 'a')
    expect(s.episodesPlayed).toBe(5)
    expect(s.wins).toBe(2)
    expect(s.ties).toBe(1)
    // 4 episodes with a winner.
    expect(s.winRate).toBeCloseTo(2 / 4)
    expect(s.points).toBe(6)
    expect(s.questions).toBe(15)
    expect(s.successRate).toBeCloseTo(6 / 15)
    expect(s.averagePoints).toBeCloseTo(6 / 5)
    // Shares over episodes with a point: 2/3, 0/1, 1/2, 3/4.
    expect(s.averageShare).toBeCloseTo((2 / 3 + 0 + 1 / 2 + 3 / 4) / 4)
    expect(s.bestEpisode).toEqual({ points: 3, date: at(4 * DAY) })
    expect(s.longestQuestionStreak).toBe(3)
    // win, loss, tie, win → 1
    expect(s.longestEpisodeWinStreak).toBe(1)
  })

  it('does not let a streak cross episodes', () => {
    const d = { sessions: [ab], rounds: rounds('s1', [['b', 'a', 'a'], ['a', 'a']]) }
    expect(playerSummary(buildEpisodes(d, { now: NOW }), 'a').longestQuestionStreak).toBe(2)
  })

  it('keeps the episode in progress without a result', () => {
    const live = buildEpisodes(data, { now: T0 + (4 * DAY + 10) * 60_000 })
    const last = live[live.length - 1]
    expect(last.inProgress).toBe(true)
    expect(last.winners).toEqual([])
    expect(playerSummary(live, 'a').wins).toBe(1)
    // Average of the other finished episodes: 2, 0, 1, 0.
    expect(averagePointsExcept(live, 'a', last.id)).toBeCloseTo(3 / 4)
  })
})

describe('series', () => {
  const episodes = buildEpisodes(data, { now: NOW })

  it('counts cumulative wins and points per episode', () => {
    expect(cumulativeWins(episodes, ['a', 'b']).map((r) => [r.a, r.b])).toEqual([
      [1, 0],
      [1, 1],
      [1, 1],
      [1, 1],
      [2, 1],
    ])
    expect(pointsPerEpisode(episodes, ['a']).map((r) => r.a)).toEqual([2, 0, 1, 0, 3])
  })

  it('tracks progress per question', () => {
    expect(questionProgress(episodes[0].questions, ['a', 'b']).map((r) => [r.question, r.a, r.b])).toEqual([
      [0, 0, 0],
      [1, 1, 0],
      [2, 2, 0],
      [3, 2, 1],
      [4, 2, 1],
    ])
  })

  it('computes the share of „Nikdo“ per episode', () => {
    expect(nobodyShare(episodes).map((r) => r.share)).toEqual([1 / 4, 2 / 3, 0, 1, 0])
  })

  it('compares pairs head to head', () => {
    expect(headToHead(episodes, ['a', 'b'])).toEqual([{ a: 'a', b: 'b', episodes: 5, aBetter: 2, bBetter: 1, equal: 2 }])
  })
})
