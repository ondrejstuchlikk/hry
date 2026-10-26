import { Link } from 'react-router'
import { Card } from '../../components/ui'
import { formatDate, formatDateTime, formatNumber, formatTime, joinNames } from '../../lib/format'
import type { SessionResultProps } from '../types'
import { completeRoundNos, sessionTotals } from './logic'
import { Scoreboard } from './Scoreboard'

/** Summary of an ended session followed by the read-only scoreboard. */
export function KostkySessionResult({ detail }: SessionResultProps) {
  const { session, players, entries } = detail
  const order = players.map((p) => p.id)
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?'
  const winners = session.winner_player_ids ?? []
  const totals = sessionTotals(order, entries)
  const ranked = [...players].sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0))
  const best = entries.reduce<(typeof entries)[number] | null>((b, e) => (!b || e.value > b.value ? e : b), null)
  const hasIncomplete = entries.some((e) => !completeRoundNos(order, entries).has(e.round_no))

  return (
    <div className="space-y-4">
      <Card className="text-center">
        <p className="text-sm text-stone-500">
          {formatDate(session.started_at)} · {formatTime(session.started_at)}
          {session.ended_at && `–${formatTime(session.ended_at)}`}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">
          {winners.length === 0 ? (
            'Bez vítěze'
          ) : winners.length === 1 ? (
            <>
              🏆 Vítěz: <span className="text-brand-700">{name(winners[0])}</span>
            </>
          ) : (
            <>
              🤝 Remíza: <span className="text-brand-700">{joinNames(winners.map(name))}</span>
            </>
          )}
        </h1>
        {winners.length === 0 && <p className="mt-1 text-stone-500">Nebylo dohrané žádné kolo.</p>}
        {session.ended_reason === 'inactivity' && (
          <p className="mt-2 text-sm text-stone-500">Hra byla ukončena automaticky po hodině nečinnosti.</p>
        )}

        <ol className="mx-auto mt-5 max-w-sm space-y-1.5 text-left">
          {ranked.map((p, i) => (
            <li
              key={p.id}
              className={`tabular flex items-center justify-between rounded-xl px-4 py-2 ${winners.includes(p.id) ? 'bg-amber-50 font-bold text-amber-900' : 'bg-stone-50'}`}
            >
              <span>
                {i + 1}. {p.name}
              </span>
              <span className="text-lg">{formatNumber(totals.get(p.id) ?? 0)}</span>
            </li>
          ))}
        </ol>
        {hasIncomplete && (
          <p className="mt-2 text-xs text-stone-500">Nedohrané poslední kolo se do součtu nezapočítává.</p>
        )}

        {best && (
          <p className="mt-4 text-stone-700">
            Nejlepší hod večera: <strong className="tabular">{formatNumber(best.value)}</strong> ({name(best.player_id)})
          </p>
        )}

        <Link
          to={`/statistiky?skupina=${encodeURIComponent(session.group_key)}`}
          className="mt-5 inline-block rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700"
        >
          Zobrazit statistiky
        </Link>
      </Card>

      <Scoreboard players={players} entries={entries} />
      <p className="text-center text-xs text-stone-400">Ukončeno {session.ended_at && formatDateTime(session.ended_at)}</p>
    </div>
  )
}
