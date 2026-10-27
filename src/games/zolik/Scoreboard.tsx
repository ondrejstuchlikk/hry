import { useEffect, useRef } from 'react'
import { formatNumber } from '../../lib/format'
import type { SessionPlayer } from '../../lib/types'
import { partieTotals, partieWinners, type ZolikHand } from './logic'

/**
 * Players as columns, hands of one partie as rows („Kolo 1“, …), totals in a sticky footer.
 * The hand winner gets ★ (and 🃏 with the jokers kept), the dealer a small „R“.
 * The leader (lowest total) is highlighted.
 */
export function ZolikScoreboard({
  players,
  hands,
  newestFirst = false,
}: {
  players: SessionPlayer[]
  hands: ZolikHand[]
  newestFirst?: boolean
}) {
  const ids = players.map((p) => p.id)
  const totals = partieTotals(ids, hands)
  const leaders = new Set(partieWinners(ids, hands))
  const rows = hands.map((hand, i) => ({ hand, no: i + 1 }))
  if (newestFirst) rows.reverse()

  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el && !newestFirst) el.scrollTop = el.scrollHeight
  }, [hands.length, newestFirst])

  if (hands.length === 0) {
    return <p className="rounded-2xl bg-surface py-6 text-center text-stone-500 ring-1 ring-stone-200">Zatím žádné kolo v této partii</p>
  }

  return (
    <div ref={scrollRef} className="max-h-[60dvh] overflow-auto rounded-2xl bg-surface ring-1 ring-stone-200">
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
          {rows.map(({ hand, no }) => (
            <tr key={hand.roundId}>
              <td className="border-b border-stone-100 px-3 py-1.5 text-left text-sm text-stone-500">{no}</td>
              {players.map((p) => {
                const value = hand.values[p.id]
                const won = hand.winnerId === p.id
                return (
                  <td key={p.id} className={`border-b border-stone-100 px-3 py-1.5 ${won ? 'bg-brand-50' : ''}`}>
                    <span className="inline-flex items-center justify-end gap-1">
                      {hand.dealerId === p.id && (
                        <span
                          className="rounded bg-stone-100 px-1 text-[10px] font-bold leading-4 text-stone-500"
                          title="rozdává"
                          aria-label="rozdává"
                        >
                          R
                        </span>
                      )}
                      {won && hand.jokersKept > 0 && (
                        <span className="text-xs text-stone-600" title="žolíky do dalšího kola">
                          🃏{hand.jokersKept}
                        </span>
                      )}
                      {won ? (
                        <span className="font-bold text-accent">
                          <span aria-label="vyhrál/a">★</span> 0
                        </span>
                      ) : value === undefined ? (
                        ''
                      ) : (
                        formatNumber(value)
                      )}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
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
