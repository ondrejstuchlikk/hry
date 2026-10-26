import { describe, expect, it } from 'vitest'
import type { StatsData } from '../../lib/api'
import type { ScoredEntry, SessionWithPlayers } from '../../lib/types'
import { currentEvening, eveningStats, splitEvenings } from './evenings'

const at = (hhmm: string, day = 1) => `2026-01-0${day}T${hhmm}:00Z`

let seq = 0
function entry(player_id: string, round_no: number, value: number, created_at: string): ScoredEntry {
  seq += 1
  return { id: `e${seq}`, session_id: 's', player_id, round_no, value, seq, created_at }
}

const session: SessionWithPlayers = {
  id: 's',
  game_type_id: 'kostky',
  created_by: 'u',
  group_key: 'a,b',
  status: 'active',
  ended_reason: null,
  started_at: at('19:00'),
  last_activity_at: '',
  ended_at: null,
  winner_player_ids: null,
  players: [
    { session_id: 's', player_id: 'a', turn_order: 0 },
    { session_id: 's', player_id: 'b', turn_order: 1 },
  ],
}

describe('splitEvenings', () => {
  it('starts a new evening after a pause of an hour or more', () => {
    const entries = [
      entry('a', 1, 100, at('20:00')),
      entry('b', 1, 0, at('20:59')),
      entry('a', 2, 300, at('22:00')),
      entry('b', 2, 50, at('22:01')),
    ]
    expect(splitEvenings(entries).map((ev) => ev.map((e) => e.round_no))).toEqual([[1, 1], [2, 2]])
  })

  it('keeps a round in the evening of its first throw', () => {
    const entries = [entry('a', 1, 100, at('20:00')), entry('b', 1, 0, at('22:00')), entry('a', 2, 5, at('22:01'))]
    expect(splitEvenings(entries).map((ev) => ev.map((e) => e.round_no))).toEqual([[1, 1], [2]])
  })

  it('returns the evening in progress only within the break', () => {
    const entries = [entry('a', 1, 100, at('20:00')), entry('b', 1, 0, at('20:01')), entry('a', 2, 0, at('22:00'))]
    expect(currentEvening(entries, Date.parse(at('22:30')))).toHaveLength(1)
    expect(currentEvening(entries, Date.parse(at('23:00')))).toEqual([])
  })
})

describe('eveningStats', () => {
  const entries = [
    // Evening 1 (day 1): a starts, b wins 300 : 100; unfinished round 2 is ignored.
    entry('a', 1, 100, at('20:00')),
    entry('b', 1, 300, at('20:01')),
    entry('a', 2, 5000, at('20:02')),
    // Evening 2 (day 2, redrawn: b starts): a wins 400 : 0, still in progress at 21:30.
    entry('b', 3, 0, at('21:00', 2)),
    entry('a', 3, 400, at('21:01', 2)),
  ]
  const data: StatsData = {
    sessions: [session],
    entries,
    draws: [
      { session_id: 's', from_round: 1, player_ids: ['a', 'b'], drawn_at: at('19:00') },
      { session_id: 's', from_round: 3, player_ids: ['b', 'a'], drawn_at: at('20:55', 2) },
    ],
  }

  it('turns each evening into a pseudo-session with its own draw and winners', () => {
    const result = eveningStats(data, Date.parse(at('23:00', 2)))
    expect(result.sessions.map((s) => s.id)).toEqual(['s#1', 's#2'])
    expect(result.sessions[0]).toMatchObject({ status: 'ended', winner_player_ids: ['b'], started_at: at('20:00') })
    expect(result.sessions[1].players.map((p) => p.player_id)).toEqual(['b', 'a'])
    expect(result.sessions[1].winner_player_ids).toEqual(['a'])
    expect(result.entries.filter((e) => e.session_id === 's#1')).toHaveLength(3)
  })

  it('leaves the evening in progress without a result', () => {
    const result = eveningStats(data, Date.parse(at('21:30', 2)))
    expect(result.sessions[1]).toMatchObject({ status: 'active', winner_player_ids: null })
  })
})
