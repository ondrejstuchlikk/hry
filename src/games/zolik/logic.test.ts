import { describe, expect, it } from 'vitest'
import {
  buildHands,
  clampJokers,
  currentAndLastPartie,
  drawDealer,
  jokerReminder,
  jokersPhrase,
  partieWinners,
  PARTIE_BREAK_MS,
  splitPartie,
  storedDealerValid,
  validateLoserValue,
  type ZolikHand,
} from './logic'

const T0 = Date.parse('2026-03-01T19:00:00Z')
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()

let roundNo = 0
function hand(minutes: number, values: Record<string, number>, extra: Partial<ZolikHand> = {}): ZolikHand {
  roundNo += 1
  const winnerId = Object.entries(values).find(([, v]) => v === 0)?.[0] ?? null
  return {
    roundId: `r${roundNo}`,
    sessionId: 's1',
    roundNo,
    createdAt: at(minutes),
    dealerId: null,
    winnerId,
    jokersKept: 0,
    endsPartie: false,
    values,
    ...extra,
  }
}

describe('dealer draw', () => {
  it('maps the random number uniformly onto the players', () => {
    const ids = ['a', 'b', 'c']
    expect(drawDealer(ids, () => 0)).toBe('a')
    expect(drawDealer(ids, () => 0.34)).toBe('b')
    expect(drawDealer(ids, () => 0.67)).toBe('c')
    expect(drawDealer(ids, () => 0.9999999)).toBe('c')
  })

  it('only draws session players, roughly evenly', () => {
    const ids = ['a', 'b', 'c', 'd']
    const counts = new Map(ids.map((id) => [id, 0]))
    for (let i = 0; i < 8000; i++) {
      const id = drawDealer(ids)
      expect(ids).toContain(id)
      counts.set(id, counts.get(id)! + 1)
    }
    for (const c of counts.values()) expect(c).toBeGreaterThan(1700)
  })
})

describe('jokers', () => {
  it('clamps to 0–4', () => {
    expect(clampJokers(-1)).toBe(0)
    expect(clampJokers(0)).toBe(0)
    expect(clampJokers(3)).toBe(3)
    expect(clampJokers(5)).toBe(4)
    expect(clampJokers(Number.NaN)).toBe(0)
  })

  it('uses the Czech plural', () => {
    expect(jokersPhrase(1)).toBe('1 žolíka')
    expect(jokersPhrase(2)).toBe('2 žolíky')
    expect(jokersPhrase(3)).toBe('3 žolíky')
    expect(jokersPhrase(4)).toBe('4 žolíky')
    expect(jokersPhrase(5)).toBe('5 žolíků')
  })
})

describe('loser validation', () => {
  it('requires an integer ≥ 1', () => {
    expect(validateLoserValue('')).toEqual({ ok: false })
    expect(validateLoserValue('  ')).toEqual({ ok: false })
    expect(validateLoserValue('0')).toEqual({ ok: false })
    expect(validateLoserValue('-3')).toEqual({ ok: false })
    expect(validateLoserValue('2.5')).toEqual({ ok: false })
    expect(validateLoserValue('1')).toEqual({ ok: true, value: 1, warn: false })
    expect(validateLoserValue(' 45 ')).toEqual({ ok: true, value: 45, warn: false })
  })

  it('warns above 200', () => {
    expect(validateLoserValue('200')).toEqual({ ok: true, value: 200, warn: false })
    expect(validateLoserValue('201')).toEqual({ ok: true, value: 201, warn: true })
    expect(validateLoserValue('120', { maxWarning: 100 })).toEqual({ ok: true, value: 120, warn: true })
  })
})

describe('partie winner (lower is better)', () => {
  it('picks the lowest total', () => {
    const hands = [hand(0, { a: 0, b: 30, c: 5 }), hand(10, { a: 20, b: 0, c: 4 })]
    expect(partieWinners(['a', 'b', 'c'], hands)).toEqual(['c'])
  })

  it('returns all tied players', () => {
    const hands = [hand(0, { a: 0, b: 10 }), hand(10, { a: 10, b: 0 })]
    expect(partieWinners(['a', 'b'], hands)).toEqual(['a', 'b'])
  })

  it('has no winner without hands', () => {
    expect(partieWinners(['a', 'b'], [])).toEqual([])
  })
})

describe('partie split', () => {
  it('starts a new partie after a 1 h pause or an ended partie', () => {
    const hands = [
      hand(0, { a: 0, b: 1 }),
      hand(59, { a: 0, b: 1 }),
      hand(59 + 60, { a: 0, b: 1 }, { endsPartie: true }),
      hand(59 + 61, { a: 0, b: 1 }),
    ]
    expect(splitPartie(hands).map((p) => p.length)).toEqual([2, 1, 1])
  })

  it('finds the partie in progress and the last finished one', () => {
    const hands = [hand(0, { a: 0, b: 1 }), hand(120, { a: 0, b: 1 })]
    const now = T0 + 130 * 60_000
    expect(currentAndLastPartie(hands, now).current).toHaveLength(1)
    expect(currentAndLastPartie(hands, now).last).toHaveLength(1)
    // After an hour without a hand, nothing is in progress.
    const later = currentAndLastPartie(hands, T0 + 120 * 60_000 + PARTIE_BREAK_MS)
    expect(later.current).toEqual([])
    expect(later.last).toHaveLength(1)
  })
})

describe('joker reminder', () => {
  it('uses the latest hand of the group, across partie boundaries', () => {
    const lastWeek = hand(-7 * 24 * 60, { a: 0, b: 12 }, { jokersKept: 2 })
    const older = hand(-8 * 24 * 60, { a: 9, b: 0 }, { jokersKept: 1, sessionId: 's0' })
    expect(jokerReminder([lastWeek, older])).toEqual({ playerId: 'a', count: 2 })
  })

  it('disappears once the next hand is recorded without jokers', () => {
    const kept = hand(0, { a: 0, b: 12 }, { jokersKept: 3 })
    const next = hand(5, { a: 4, b: 0 })
    expect(jokerReminder([kept])).toEqual({ playerId: 'a', count: 3 })
    expect(jokerReminder([kept, next])).toBeNull()
    expect(jokerReminder([])).toBeNull()
  })
})

describe('building hands', () => {
  it('joins rounds with their entries, chronologically', () => {
    const rounds = [
      { id: 'r2', session_id: 's', round_no: 2, created_at: at(5), dealer_player_id: 'b', winner_player_id: 'b', jokers_kept: 1, ends_partie: false },
      { id: 'r1', session_id: 's', round_no: 1, created_at: at(0), dealer_player_id: 'a', winner_player_id: 'a', jokers_kept: null, ends_partie: false },
    ]
    const entries = [
      { session_id: 's', round_no: 1, player_id: 'a', value: 0 },
      { session_id: 's', round_no: 1, player_id: 'b', value: 7 },
      { session_id: 's', round_no: 2, player_id: 'a', value: 3 },
      { session_id: 's', round_no: 2, player_id: 'b', value: 0 },
    ]
    const hands = buildHands(rounds, entries)
    expect(hands.map((h) => h.roundId)).toEqual(['r1', 'r2'])
    expect(hands[0]).toMatchObject({ jokersKept: 0, values: { a: 0, b: 7 } })
    expect(hands[1]).toMatchObject({ jokersKept: 1, dealerId: 'b', values: { a: 3, b: 0 } })
  })
})

describe('stored dealer', () => {
  const base = { playerIds: ['a', 'b'], lastRoundNo: 3, partieEmpty: false, now: T0 }
  const stored = { dealerId: 'b', afterRound: 3, drawnAt: at(-200) }

  it('is reused until a hand is saved or deleted', () => {
    expect(storedDealerValid(stored, base)).toBe(true)
    expect(storedDealerValid(stored, { ...base, lastRoundNo: 4 })).toBe(false)
    expect(storedDealerValid({ ...stored, dealerId: 'x' }, base)).toBe(false)
    expect(storedDealerValid(null, base)).toBe(false)
  })

  it('is redrawn for a new partie when it is older than an hour', () => {
    expect(storedDealerValid(stored, { ...base, partieEmpty: true })).toBe(false)
    expect(storedDealerValid({ ...stored, drawnAt: at(-10) }, { ...base, partieEmpty: true })).toBe(true)
  })
})
