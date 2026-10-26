import { useEffect, useRef } from 'react'
import { formatNumber } from '../../lib/format'
import type { ScoredEntry, SessionPlayer } from '../../lib/types'
import { completeRoundNos, kostkyWinners, type Turn } from './logic'

/**
 * Players as columns, rounds as rows, totals in a sticky footer.
 * The leader (by complete rounds) is highlighted.
 */
export function Scoreboard({
  players,
  entries,
  turn,
  newestFirst = false,
}: {
  players: SessionPlayer[]
  entries: ScoredEntry[]
  /** Current turn (active session), highlighted as an empty cell. */
  turn?: Turn
  newestFirst?: boolean
}) {
  const order = players.map((p) => p.id)
  const leaders = new Set(kostkyWinners(order, entries))
  const complete = completeRoundNos(order, entries)
  const lastRound = Math.max(turn?.roundNo ?? 0, ...entries.map((e) => e.round_no), 0)
  const rounds = Array.from({ length: lastRound }, (_, i) => i + 1)
  if (newestFirst) rounds.reverse()

  const cell = new Map(entries.map((e) => [`${e.round_no}:${e.player_id}`, e.value]))
  const totals = new Map(order.map((id) => [id, 0]))
  for (const e of entries) totals.set(e.player_id, (totals.get(e.player_id) ?? 0) + e.value)

  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el && !newestFirst) el.scrollTop = el.scrollHeight
  }, [entries.length, newestFirst])

  if (rounds.length === 0) {
    return <p className="py-6 text-center text-stone-500">Zatím žádné hody</p>
  }

  return (
    <div ref={scrollRef} className="max-h-[70dvh] overflow-auto rounded-2xl bg-white ring-1 ring-stone-200">
      <table className="tabular w-full border-separate border-spacing-0 text-right">
        <thead className="sticky top-0 z-10 bg-stone-50">
          <tr>
            <th className="border-b border-stone-200 px-3 py-2 text-left text-xs font-semibold uppercase text-stone-500">
              Kolo
            </th>
            {players.map((p) => (
              <th
                key={p.id}
                className={`border-b border-stone-200 px-3 py-2 text-sm font-bold ${leaders.has(p.id) ? 'text-amber-700' : 'text-stone-700'}`}
              >
                {leaders.has(p.id) && <span aria-label="vede">👑 </span>}
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rounds.map((r) => {
            const incomplete = !complete.has(r)
            return (
              <tr key={r} className={incomplete ? 'text-stone-400' : ''}>
                <td className="border-b border-stone-100 px-3 py-1.5 text-left text-sm text-stone-500">{r}</td>
                {players.map((p) => {
                  const v = cell.get(`${r}:${p.id}`)
                  const current = turn && turn.roundNo === r && turn.playerId === p.id
                  return (
                    <td
                      key={p.id}
                      className={`border-b border-stone-100 px-3 py-1.5 ${current ? 'bg-brand-50 ring-2 ring-inset ring-brand-500' : ''} ${v === 0 ? 'text-stone-400' : ''}`}
                    >
                      {v === undefined ? '' : formatNumber(v)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
        <tfoot className="sticky bottom-0 bg-stone-50">
          <tr>
            <td className="border-t border-stone-200 px-3 py-2 text-left text-xs font-semibold uppercase text-stone-500">
              Součet
            </td>
            {players.map((p) => (
              <td
                key={p.id}
                className={`border-t border-stone-200 px-3 py-2 text-lg font-bold ${leaders.has(p.id) ? 'bg-amber-50 text-amber-800' : ''}`}
              >
                {formatNumber(totals.get(p.id) ?? 0)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
