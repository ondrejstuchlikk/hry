import { useMemo } from 'react'
import { formatNumber, formatPercent } from '../../lib/format'
import type { ComparisonTableProps } from '../types'
import { buildEpisodes, playerSummary } from './stats'
import { NOBODY_NOTE } from './text'

/** One row per player over all loaded sessions (counted per episode). */
export function ComparisonTable({ data, playerIds, names }: ComparisonTableProps) {
  const rows = useMemo(() => {
    const episodes = buildEpisodes(data)
    return playerIds.map((id) => playerSummary(episodes, id))
  }, [data, playerIds])

  const pct = (v: number | null) => (v === null ? '–' : formatPercent(v))
  const n = (v: number | null) => (v === null ? '–' : formatNumber(v, 1))

  return (
    <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-stone-200">
      <table className="tabular w-full whitespace-nowrap text-right text-sm">
        <thead className="bg-stone-50 text-xs uppercase text-stone-500">
          <tr>
            <th className="sticky left-0 bg-stone-50 px-3 py-2 text-left font-semibold">Hráč</th>
            <th className="px-3 py-2 font-semibold">Epizody</th>
            <th className="px-3 py-2 font-semibold">Výhry</th>
            <th className="px-3 py-2 font-semibold">Remízy</th>
            <th className="px-3 py-2 font-semibold">Podíl výher</th>
            <th className="px-3 py-2 font-semibold">Body</th>
            <th className="px-3 py-2 font-semibold">Ø na epizodu</th>
            <th className="px-3 py-2 font-semibold">Podíl bodů</th>
            <th className="px-3 py-2 font-semibold">Úspěšnost*</th>
            <th className="px-3 py-2 font-semibold">Nejlepší epizoda</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.playerId} className="border-t border-stone-100">
              <td className="sticky left-0 bg-surface px-3 py-2 text-left font-semibold">{names.get(s.playerId) ?? '?'}</td>
              <td className="px-3 py-2">{s.episodesPlayed}</td>
              <td className="px-3 py-2 font-semibold">{s.wins}</td>
              <td className="px-3 py-2">{s.ties}</td>
              <td className="px-3 py-2">{pct(s.winRate)}</td>
              <td className="px-3 py-2">{formatNumber(s.points)}</td>
              <td className="px-3 py-2">{n(s.averagePoints)}</td>
              <td className="px-3 py-2">{pct(s.averageShare)}</td>
              <td className="px-3 py-2">{pct(s.successRate)}</td>
              <td className="px-3 py-2">{s.bestEpisode ? formatNumber(s.bestEpisode.points) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-stone-100 px-3 py-2 text-xs text-stone-500">* {NOBODY_NOTE}</p>
    </div>
  )
}
