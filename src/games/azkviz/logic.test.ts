import { describe, expect, it } from 'vitest'
import {
  buildQuestions,
  createTapGuard,
  currentAndLastEpisode,
  currentStreak,
  DEFAULT_INACTIVITY_MINUTES,
  DOUBLE_TAP_MS,
  episodeLabel,
  episodeScores,
  episodeWinners,
  inactivityMs,
  longestStreak,
  longestStreakOf,
  shareOfPoints,
  shareOfQuestions,
  splitEpisodes,
  undoMessage,
  withoutLast,
  type Question,
} from './logic'

const T0 = Date.parse('2026-10-30T18:00:00Z')
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()
const HOUR = 60 * 60 * 1000
const BREAK = 3 * HOUR

let roundNo = 0
function q(winnerId: string | null, minutes = roundNo, extra: Partial<Question> = {}): Question {
  roundNo += 1
  return { roundId: `r${roundNo}`, sessionId: 's1', roundNo, createdAt: at(minutes), winnerId, endsEpisode: false, ...extra }
}
const many = (winners: (string | null)[]) => winners.map((w, i) => q(w, i))

describe('inactivity timeout', () => {
  it('defaults to 60 minutes and uses the game config', () => {
    expect(DEFAULT_INACTIVITY_MINUTES).toBe(60)
    expect(inactivityMs({})).toBe(HOUR)
    expect(inactivityMs(null)).toBe(HOUR)
    expect(inactivityMs({ inactivity_minutes: 180 })).toBe(BREAK)
  })

  it('splits episodes by the per-game pause', () => {
    const questions = [q('a', 0), q('a', 90), q('b', 290)]
    expect(splitEpisodes(questions, inactivityMs({})).map((e) => e.length)).toEqual([1, 1, 1])
    expect(splitEpisodes(questions, inactivityMs({ inactivity_minutes: 180 })).map((e) => e.length)).toEqual([2, 1])
  })
})

describe('episodes', () => {
  it('ends an episode after „Konec epizody“', () => {
    const questions = [q('a', 0), q('b', 1, { endsEpisode: true }), q('a', 2)]
    expect(splitEpisodes(questions, BREAK).map((e) => e.length)).toEqual([2, 1])
  })

  it('knows the episode in progress and the last finished one', () => {
    const questions = [q('a', 0, { endsEpisode: true }), q('b', 10), q('b', 11)]
    const { current, last } = currentAndLastEpisode(questions, BREAK, T0 + 20 * 60_000)
    expect(current.map((x) => x.winnerId)).toEqual(['b', 'b'])
    expect(last).toHaveLength(1)
    // 3 h later the episode is over.
    const later = currentAndLastEpisode(questions, BREAK, T0 + 11 * 60_000 + BREAK)
    expect(later.current).toEqual([])
    expect(later.last).toHaveLength(2)
  })

  it('builds questions chronologically from rounds', () => {
    const rounds = [
      { id: 'x2', session_id: 's', round_no: 2, created_at: at(5), winner_player_id: null, ends_partie: false },
      { id: 'x1', session_id: 's', round_no: 1, created_at: at(1), winner_player_id: 'a', ends_partie: true },
    ]
    expect(buildQuestions(rounds).map((x) => [x.roundId, x.winnerId, x.endsEpisode])).toEqual([
      ['x1', 'a', true],
      ['x2', null, false],
    ])
  })
})

describe('episode winner', () => {
  const ids = ['a', 'b', 'c']

  it('is the player with most points', () => {
    const questions = many(['a', 'b', 'a', null])
    expect(episodeScores(ids, questions)).toEqual(new Map([['a', 2], ['b', 1], ['c', 0]]))
    expect(episodeWinners(ids, questions)).toEqual(['a'])
  })

  it('gives all tied players the win', () => {
    expect(episodeWinners(ids, many(['a', 'b', null]))).toEqual(['a', 'b'])
  })

  it('has no winner without points', () => {
    expect(episodeWinners(ids, many([null, null]))).toEqual([])
    expect(episodeWinners(ids, [])).toEqual([])
  })
})

describe('double-tap guard', () => {
  it('ignores a second tap on the same button within the window', () => {
    const guard = createTapGuard()
    expect(guard('a', 1000)).toBe(true)
    expect(guard('a', 1000 + DOUBLE_TAP_MS - 1)).toBe(false)
    expect(guard('a', 1000 + DOUBLE_TAP_MS)).toBe(true)
  })

  it('lets taps on different buttons through', () => {
    const guard = createTapGuard()
    expect(guard('a', 1000)).toBe(true)
    expect(guard('b', 1010)).toBe(true)
    expect(guard('nikdo', 1020)).toBe(true)
  })

  it('measures from the last accepted tap', () => {
    const guard = createTapGuard(400)
    expect(guard('a', 0)).toBe(true)
    expect(guard('a', 300)).toBe(false)
    expect(guard('a', 450)).toBe(true)
  })
})

describe('undo', () => {
  it('removes the last question, a point or „Nikdo“', () => {
    const questions = many(['a', null, 'b'])
    const first = withoutLast(questions)
    expect(first.removed?.winnerId).toBe('b')
    expect(first.remaining.map((x) => x.winnerId)).toEqual(['a', null])
    const second = withoutLast(first.remaining)
    expect(second.removed?.winnerId).toBe(null)
    expect(second.remaining.map((x) => x.winnerId)).toEqual(['a'])
    expect(withoutLast([])).toEqual({ remaining: [], removed: null })
  })

  it('names what was undone', () => {
    expect(undoMessage('Ondra')).toBe('Vráceno: bod – Ondra')
    expect(undoMessage(null)).toBe('Vráceno: Nikdo')
  })
})

describe('streaks', () => {
  it('counts consecutive questions of the last scorer', () => {
    expect(currentStreak(many(['b', 'a', 'a', 'a']))).toEqual({ playerId: 'a', length: 3 })
    expect(currentStreak(many(['a', null]))).toBeNull()
    expect(currentStreak([])).toBeNull()
  })

  it('lets „Nikdo“ break a streak', () => {
    const questions = many(['a', 'a', null, 'a', 'b', 'b', 'b'])
    expect(longestStreak(questions)).toEqual({ playerId: 'b', length: 3 })
    expect(longestStreakOf(questions, 'a')).toBe(2)
    expect(longestStreakOf(questions, 'c')).toBe(0)
    expect(longestStreak(many([null]))).toBeNull()
  })
})

describe('shares', () => {
  it('uses scored questions for share of points and all questions for share of questions', () => {
    const questions = many(['a', 'a', 'b', null, null])
    expect(shareOfPoints(2, questions)).toBeCloseTo(2 / 3)
    expect(shareOfQuestions(2, questions)).toBeCloseTo(2 / 5)
    expect(shareOfPoints(0, many([null]))).toBeNull()
    expect(shareOfQuestions(0, [])).toBeNull()
  })
})

describe('episode label', () => {
  it('is the date, plus the time when another episode shares it', () => {
    const a = new Date(2026, 9, 30, 18, 5).toISOString()
    const b = new Date(2026, 9, 30, 20, 15).toISOString()
    const c = new Date(2026, 9, 31, 18, 0).toISOString()
    expect(episodeLabel(c, [a, b, c])).toBe('31. 10. 2026')
    expect(episodeLabel(b, [a, b, c])).toBe('30. 10. 2026, 20:15')
    expect(episodeLabel(a, [a])).toBe('30. 10. 2026')
  })
})
