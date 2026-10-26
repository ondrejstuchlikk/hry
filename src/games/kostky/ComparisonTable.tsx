import { useMemo } from 'react'
import { formatNumber, formatPercent } from '../../lib/format'
import type { ComparisonTableProps } from '../types'
import { eveningStats } from './evenings'
import { playerSummary, scoresBySession } from './stats'

/** One row per player over all loaded sessions (counted per evening). */
export function ComparisonTable({ data, playerIds, names }: ComparisonTableProps) {
  const rows = useMemo(() => {
    const evenings = eveningStats(data)
    const scores = scoresBySession(evenings)
    return playerIds.map((id) => playerSummary(evenings, id, scores))
  }, [data, playerIds])

  const pct = (v: number | null) => (v === null ? '–' : formatPercent(v))
  const n = (v: number | null) => (v === null ? '–' : formatNumber(v))

  return (
    <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-stone-200">
      <table className="tabular w-full whitespace-nowrap text-right text-sm">
        <thead className="bg-stone-50 text-xs uppercase text-stone-500">
          <tr>
            <th className="sticky left-0 bg-stone-50 px-3 py-2 text-left font-semibold">Hráč</th>
            <th className="px-3 py-2 font-semibold">Večery</th>
            <th className="px-3 py-2 font-semibold">Výhry</th>
            <th className="px-3 py-2 font-semibold">Remízy</th>
            <th className="px-3 py-2 font-semibold">Úspěšnost</th>
            <th className="px-3 py-2 font-semibold">Hody</th>
            <th className="px-3 py-2 font-semibold">Průměr na hod</th>
            <th className="px-3 py-2 font-semibold">Nejvyšší hod</th>
            <th className="px-3 py-2 font-semibold">Podíl nul</th>
            <th className="px-3 py-2 font-semibold">Ø součet za večer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.playerId} className="border-t border-stone-100">
              <td className="sticky left-0 bg-white px-3 py-2 text-left font-semibold">{names.get(s.playerId) ?? '?'}</td>
              <td className="px-3 py-2">{s.sessionsPlayed}</td>
              <td className="px-3 py-2 font-semibold">{s.wins}</td>
              <td className="px-3 py-2">{s.ties}</td>
              <td className="px-3 py-2">{pct(s.winRate)}</td>
              <td className="px-3 py-2">{formatNumber(s.throws)}</td>
              <td className="px-3 py-2">{n(s.average)}</td>
              <td className="px-3 py-2">{s.best ? formatNumber(s.best.value) : '–'}</td>
              <td className="px-3 py-2">{pct(s.zeroShare)}</td>
              <td className="px-3 py-2">{n(s.averageSessionTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
