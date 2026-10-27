import { useMemo } from 'react'
import { formatNumber, formatPercent } from '../../lib/format'
import type { ComparisonTableProps } from '../types'
import { buildPartien, playerSummary } from './stats'

/** One row per player over all loaded sessions (counted per partie). */
export function ComparisonTable({ data, playerIds, names }: ComparisonTableProps) {
  const rows = useMemo(() => {
    const partien = buildPartien(data)
    return playerIds.map((id) => playerSummary(partien, id))
  }, [data, playerIds])

  const pct = (v: number | null) => (v === null ? '–' : formatPercent(v))
  const n = (v: number | null) => (v === null ? '–' : formatNumber(v, 1))

  return (
    <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-stone-200">
      <table className="tabular w-full whitespace-nowrap text-right text-sm">
        <thead className="bg-stone-50 text-xs uppercase text-stone-500">
          <tr>
            <th className="sticky left-0 bg-stone-50 px-3 py-2 text-left font-semibold">Hráč</th>
            <th className="px-3 py-2 font-semibold">Partie</th>
            <th className="px-3 py-2 font-semibold">Výhry</th>
            <th className="px-3 py-2 font-semibold">Remízy</th>
            <th className="px-3 py-2 font-semibold">Úspěšnost</th>
            <th className="px-3 py-2 font-semibold">Kola</th>
            <th className="px-3 py-2 font-semibold">Vyhraná kola</th>
            <th className="px-3 py-2 font-semibold">Úspěšnost kol</th>
            <th className="px-3 py-2 font-semibold">Ø při prohře</th>
            <th className="px-3 py-2 font-semibold">Ø na kolo</th>
            <th className="px-3 py-2 font-semibold">Nejhorší prohra</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.playerId} className="border-t border-stone-100">
              <td className="sticky left-0 bg-surface px-3 py-2 text-left font-semibold">{names.get(s.playerId) ?? '?'}</td>
              <td className="px-3 py-2">{s.partiePlayed}</td>
              <td className="px-3 py-2 font-semibold">{s.partieWins}</td>
              <td className="px-3 py-2">{s.partieTies}</td>
              <td className="px-3 py-2">{pct(s.partieWinRate)}</td>
              <td className="px-3 py-2">{formatNumber(s.hands)}</td>
              <td className="px-3 py-2">{formatNumber(s.handsWon)}</td>
              <td className="px-3 py-2">{pct(s.handWinRate)}</td>
              <td className="px-3 py-2">{n(s.averageLoss)}</td>
              <td className="px-3 py-2">{n(s.averagePerHand)}</td>
              <td className="px-3 py-2">{s.worstLoss ? formatNumber(s.worstLoss.value) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
