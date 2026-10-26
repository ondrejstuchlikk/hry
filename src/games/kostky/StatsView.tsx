import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AXIS_PROPS, ChartCard, GRID_PROPS, seriesColor, TOOLTIP_PROPS } from '../../components/charts'
import { Card, EmptyState, SectionTitle } from '../../components/ui'
import { formatDate, formatNumber, formatPercent, formatShortDate } from '../../lib/format'
import type { StatsViewProps } from '../types'
import {
  averageByHour,
  averagePerSession,
  cumulativeWins,
  headToHead,
  histogramSeries,
  playerSummary,
  scoresBySession,
  starterAdvantage,
  totalPerSession,
  type PlayerSummary,
} from './stats'

const MOVING_WINDOW = 5

const num = (v: unknown) => (typeof v === 'number' ? formatNumber(v) : '–')

export function KostkyStatsView({ data, playerIds, names, mode }: StatsViewProps) {
  const [moving, setMoving] = useState(false)
  const name = (id: string) => names.get(id) ?? '?'
  const legend = playerIds.map((id, i) => ({ name: name(id), color: seriesColor(i) }))

  const computed = useMemo(() => {
    const scores = scoresBySession(data)
    const h2h = headToHead(data, mode === 'group' ? playerIds : allOpponents(data, playerIds[0]))
    return {
      summaries: playerIds.map((id) => playerSummary(data, id, scores)),
      wins: cumulativeWins(data, playerIds),
      averages: averagePerSession(data, playerIds, MOVING_WINDOW),
      totals: totalPerSession(data, playerIds),
      hist: histogramSeries(data, playerIds),
      byHour: averageByHour(data, playerIds),
      starter: starterAdvantage(data, mode === 'player' ? playerIds : undefined),
      h2h: mode === 'group' ? h2h : h2h.filter((h) => h.a === playerIds[0] || h.b === playerIds[0]),
    }
  }, [data, playerIds, mode])

  if (data.sessions.length === 0) {
    return (
      <Card>
        <EmptyState>Zatím žádné odehrané hry</EmptyState>
      </Card>
    )
  }

  const dateTick = (iso: string) => formatShortDate(iso)
  const dateLabel = (iso: unknown) => (typeof iso === 'string' ? formatDate(iso) : '')

  return (
    <div className="space-y-6">
      <div className={`grid gap-3 ${playerIds.length > 1 ? 'sm:grid-cols-2 xl:grid-cols-3' : ''}`}>
        {computed.summaries.map((s, i) => (
          <SummaryCard key={s.playerId} summary={s} name={name(s.playerId)} color={seriesColor(i)} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Výhry v čase" legend={legend}>
          {computed.wins.length === 0 ? (
            <EmptyState>Zatím žádná dokončená hra</EmptyState>
          ) : (
            <ResponsiveContainer>
              <LineChart data={computed.wins} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="label" tickFormatter={dateTick} {...AXIS_PROPS} minTickGap={16} />
                <YAxis allowDecimals={false} {...AXIS_PROPS} />
                <Tooltip {...TOOLTIP_PROPS} labelFormatter={dateLabel} />
                {playerIds.map((id, i) => (
                  <Line
                    key={id}
                    type="stepAfter"
                    dataKey={id}
                    name={name(id)}
                    stroke={seriesColor(i)}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Průměr na hod v jednotlivých hrách"
          legend={legend}
          actions={
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <input type="checkbox" checked={moving} onChange={(e) => setMoving(e.target.checked)} />
              Klouzavý průměr ({MOVING_WINDOW} her)
            </label>
          }
        >
          <ResponsiveContainer>
            <LineChart data={computed.averages} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="label" tickFormatter={dateTick} {...AXIS_PROPS} minTickGap={16} />
              <YAxis {...AXIS_PROPS} tickFormatter={(v: number) => formatNumber(v)} />
              <Tooltip {...TOOLTIP_PROPS} labelFormatter={dateLabel} formatter={(v) => num(v)} />
              {playerIds.map((id, i) => (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={moving ? `${id}_ma` : id}
                  name={name(id)}
                  stroke={seriesColor(i)}
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0, fill: seriesColor(i) }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Rozložení hodů (podíl hodů)" legend={legend}>
          <ResponsiveContainer>
            <BarChart data={computed.hist} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barGap={2}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="label" {...AXIS_PROPS} interval={0} angle={-30} textAnchor="end" height={56} />
              <YAxis {...AXIS_PROPS} tickFormatter={(v: number) => formatPercent(v)} />
              <Tooltip
                {...TOOLTIP_PROPS}
                cursor={{ fill: '#f5f5f4' }}
                formatter={(v) => (typeof v === 'number' ? formatPercent(v) : '–')}
              />
              {playerIds.map((id, i) => (
                <Bar key={id} dataKey={id} name={name(id)} fill={seriesColor(i)} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Součet za hru" legend={legend}>
          <ResponsiveContainer>
            <BarChart data={computed.totals} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="label" tickFormatter={dateTick} {...AXIS_PROPS} minTickGap={8} />
              <YAxis {...AXIS_PROPS} tickFormatter={(v: number) => formatNumber(v)} />
              <Tooltip {...TOOLTIP_PROPS} cursor={{ fill: '#f5f5f4' }} labelFormatter={dateLabel} formatter={(v) => num(v)} />
              {playerIds.map((id, i) => (
                <Bar key={id} dataKey={id} name={name(id)} fill={seriesColor(i)} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {computed.byHour.length > 0 && (
          <ChartCard title="Průměrný hod podle denní doby" legend={legend}>
            <ResponsiveContainer>
              <BarChart data={computed.byHour} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barGap={2}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="label" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} tickFormatter={(v: number) => formatNumber(v)} />
                <Tooltip {...TOOLTIP_PROPS} cursor={{ fill: '#f5f5f4' }} formatter={(v) => num(v)} />
                {playerIds.map((id, i) => (
                  <Bar key={id} dataKey={id} name={name(id)} fill={seriesColor(i)} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        <Card>
          <h3 className="mb-3 font-bold text-stone-800">Výhoda začínajícího hráče</h3>
          {computed.starter.games === 0 ? (
            <EmptyState>Zatím žádná dokončená hra</EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-stone-50 p-4">
                <div className="text-sm text-stone-500">Začínající hráč vyhrál</div>
                <div className="tabular text-3xl font-extrabold">{formatPercent(computed.starter.starterRate ?? 0)}</div>
                <div className="text-sm text-stone-500">
                  {computed.starter.starterWins} z {computed.starter.games} her
                </div>
              </div>
              <div className="rounded-xl bg-stone-50 p-4">
                <div className="text-sm text-stone-500">Ostatní hráči v průměru</div>
                <div className="tabular text-3xl font-extrabold">{formatPercent(computed.starter.othersRate ?? 0)}</div>
                <div className="text-sm text-stone-500">výher na hráče</div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {computed.h2h.length > 0 && (
        <section>
          <SectionTitle>Vzájemné zápasy</SectionTitle>
          <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-stone-200">
            <table className="tabular w-full text-sm">
              <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Dvojice</th>
                  <th className="px-3 py-2 text-right font-semibold">Her</th>
                  <th className="px-3 py-2 text-right font-semibold">Výhry : prohry</th>
                  <th className="px-3 py-2 text-right font-semibold">Stejně</th>
                </tr>
              </thead>
              <tbody>
                {computed.h2h.map((h) => {
                  // In player mode, the selected player is always on the left.
                  const flip = mode === 'player' && h.b === playerIds[0]
                  const [a, b, aw, bw] = flip ? [h.b, h.a, h.bBetter, h.aBetter] : [h.a, h.b, h.aBetter, h.bBetter]
                  return (
                    <tr key={`${h.a}-${h.b}`} className="border-t border-stone-100">
                      <td className="px-3 py-2">
                        <strong>{name(a)}</strong> vs {name(b)}
                      </td>
                      <td className="px-3 py-2 text-right">{h.games}</td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {aw} : {bw}
                      </td>
                      <td className="px-3 py-2 text-right">{h.equal}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-stone-500">Porovnání součtů ve společných hrách (jen dohraná kola).</p>
        </section>
      )}
    </div>
  )
}

function allOpponents(data: StatsViewProps['data'], playerId: string): string[] {
  const ids = new Set<string>([playerId])
  for (const s of data.sessions) {
    if (s.players.some((p) => p.player_id === playerId)) for (const p of s.players) ids.add(p.player_id)
  }
  return [...ids]
}

function SummaryCard({ summary: s, name, color }: { summary: PlayerSummary; name: string; color: string }) {
  const rows: [string, string][] = [
    ['Odehrané hry', formatNumber(s.sessionsPlayed)],
    ['Remízy', formatNumber(s.ties)],
    ['Úspěšnost', s.winRate === null ? '–' : formatPercent(s.winRate)],
    ['Počet hodů', formatNumber(s.throws)],
    ['Průměr na hod', s.average === null ? '–' : formatNumber(s.average)],
    ['Medián', s.median === null ? '–' : formatNumber(s.median)],
    ['Nejvyšší hod', s.best ? `${formatNumber(s.best.value)} (${formatDate(s.best.date)})` : '–'],
    ['Podíl nul', s.zeroShare === null ? '–' : formatPercent(s.zeroShare)],
    ['Průměrný součet za hru', s.averageSessionTotal === null ? '–' : formatNumber(s.averageSessionTotal)],
    ['Nejlepší večer', s.bestSession ? `${formatNumber(s.bestSession.total)} (${formatDate(s.bestSession.date)})` : '–'],
    ['Nejdelší série nul', formatNumber(s.longestZeroStreak)],
    ['Nejdelší série vítězství', formatNumber(s.longestWinStreak)],
  ]
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <span className="h-3 w-3 rounded-full" style={{ background: color }} aria-hidden />
          {name}
        </h3>
        <div className="text-right">
          <div className="tabular text-3xl font-extrabold leading-none">{formatNumber(s.wins)}</div>
          <div className="text-xs text-stone-500">Vyhrané hry</div>
        </div>
      </div>
      <dl className="tabular grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-stone-500">{label}</dt>
            <dd className="text-right font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
