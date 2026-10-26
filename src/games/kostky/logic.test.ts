import { describe, expect, it } from 'vitest'
import { pickWinners } from '../winners'
import {
  completeRoundNos,
  isRoundInProgress,
  kostkyWinners,
  liveStats,
  nextTurn,
  orderForRound,
  parseThrow,
  sessionTotals,
  type TurnEntry,
} from './logic'

const order = ['a', 'b', 'c']
const draws = [{ from_round: 1, player_ids: order }]
const e = (player_id: string, round_no: number, value: number): TurnEntry => ({ player_id, round_no, value })

describe('nextTurn', () => {
  it('starts with the first player in round 1', () => {
    expect(nextTurn(draws, [])).toEqual({ roundNo: 1, playerId: 'a' })
  })

  it('moves to the next player within a round', () => {
    expect(nextTurn(draws, [e('a', 1, 0)])).toEqual({ roundNo: 1, playerId: 'b' })
    expect(nextTurn(draws, [e('a', 1, 0), e('b', 1, 50)])).toEqual({ roundNo: 1, playerId: 'c' })
  })

  it('starts a new round with the first player after a complete round', () => {
    const entries = [e('a', 1, 0), e('b', 1, 50), e('c', 1, 100)]
    expect(nextTurn(draws, entries)).toEqual({ roundNo: 2, playerId: 'a' })
  })

  it('returns the turn to the player whose entry was undone', () => {
    const entries = [e('a', 1, 0), e('b', 1, 50), e('c', 1, 100), e('a', 2, 300)]
    expect(nextTurn(draws, entries.slice(0, -1))).toEqual({ roundNo: 2, playerId: 'a' })
    expect(nextTurn(draws, entries.slice(0, 2))).toEqual({ roundNo: 1, playerId: 'c' })
  })

  it('follows a redraw from its round on', () => {
    const redrawn = [...draws, { from_round: 2, player_ids: ['c', 'a', 'b'] }]
    const round1 = [e('a', 1, 0), e('b', 1, 50), e('c', 1, 100)]
    expect(nextTurn(redrawn, round1)).toEqual({ roundNo: 2, playerId: 'c' })
    expect(nextTurn(redrawn, [...round1, e('c', 2, 0)])).toEqual({ roundNo: 2, playerId: 'a' })
    expect(orderForRound(redrawn, 1)).toEqual(order)
    expect(orderForRound(redrawn, 5)).toEqual(['c', 'a', 'b'])
  })

  it('leaves an unfinished round behind after a redraw', () => {
    const redrawn = [...draws, { from_round: 2, player_ids: ['b', 'c', 'a'] }]
    expect(nextTurn(redrawn, [e('a', 1, 0)])).toEqual({ roundNo: 2, playerId: 'b' })
  })
})

describe('rounds', () => {
  it('detects complete rounds and an incomplete last round', () => {
    const entries = [e('a', 1, 0), e('b', 1, 50), e('c', 1, 100), e('a', 2, 300)]
    expect([...completeRoundNos(order, entries)]).toEqual([1])
    expect(isRoundInProgress(order, entries)).toBe(true)
    expect(isRoundInProgress(order, entries.slice(0, 3))).toBe(false)
    expect(isRoundInProgress(order, [])).toBe(false)
  })
})

describe('winners', () => {
  it('picks the highest total', () => {
    const entries = [e('a', 1, 100), e('b', 1, 300), e('c', 1, 200)]
    expect(kostkyWinners(order, entries)).toEqual(['b'])
  })

  it('ignores the incomplete last round', () => {
    const entries = [e('a', 1, 100), e('b', 1, 300), e('c', 1, 200), e('a', 2, 5000)]
    expect(kostkyWinners(order, entries)).toEqual(['b'])
    expect(sessionTotals(order, entries).get('a')).toBe(100)
    expect(sessionTotals(order, entries, { onlyComplete: false }).get('a')).toBe(5100)
  })

  it('returns all tied players', () => {
    const entries = [e('a', 1, 300), e('b', 1, 300), e('c', 1, 200)]
    expect(kostkyWinners(order, entries).sort()).toEqual(['a', 'b'])
  })

  it('has no winner without a complete round', () => {
    expect(kostkyWinners(order, [])).toEqual([])
    expect(kostkyWinners(order, [e('a', 1, 300)])).toEqual([])
  })

  it('supports lower_better scoring generically', () => {
    const totals = new Map([
      ['a', 10],
      ['b', 5],
      ['c', 5],
    ])
    expect(pickWinners(totals, 'lower_better')).toEqual(['b', 'c'])
    expect(pickWinners(totals, 'higher_better')).toEqual(['a'])
    expect(pickWinners(new Map(), 'higher_better')).toEqual([])
  })
})

describe('liveStats', () => {
  it('computes averages and zeros over all entries', () => {
    const stats = liveStats(order, [e('a', 1, 0), e('b', 1, 50), e('c', 1, 100), e('a', 2, 300)])
    expect(stats.get('a')).toEqual({ total: 300, throws: 2, average: 150, zeros: 1, best: 300 })
    expect(stats.get('b')?.zeros).toBe(0)
  })
})

describe('parseThrow', () => {
  it('accepts 0 and positive integers', () => {
    expect(parseThrow('0')).toBe(0)
    expect(parseThrow(' 350 ')).toBe(350)
  })

  it('rejects empty and invalid input', () => {
    expect(parseThrow('')).toBeNull()
    expect(parseThrow('   ')).toBeNull()
    expect(parseThrow('-5')).toBeNull()
    expect(parseThrow('1.5')).toBeNull()
    expect(parseThrow('abc')).toBeNull()
    expect(parseThrow('99999999999')).toBeNull()
  })
})
