import { useId, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  axisProps,
  ChartCard,
  ChartTooltip,
  gridProps,
  useChartTheme,
  type ChartTheme,
} from '../../components/charts'
import { Card, EmptyState, SectionTitle } from '../../components/ui'
import type { StatsData } from '../../lib/api'
import {
  formatCompact,
  formatDate,
  formatNumber,
  formatPercent,
  formatShortDate,
} from '../../lib/format'
import type { StatsViewProps } from '../types'
import { eveningStats } from './evenings'
import {
  averageByHour,
  averagePerSession,
  cumulativeWins,
  headToHead,
  histogramSeries,
  playerSummary,
  progressByRound,
  scoresBySession,
  starterAdvantage,
  totalPerSession,
  type PlayerSummary,
} from './stats'

const MOVING_WINDOW = 5
const FORM_WINDOW = 20

const num = (v: number) => formatNumber(v)

function useStats({ data: raw, playerIds, mode }: StatsViewProps) {
  return useMemo(() => {
    // Games never end; wins and per-game stats are per evening.
    const data = eveningStats(raw)
    const scores = scoresBySession(data)
    const h2h = headToHead(data, mode === 'group' ? playerIds : allOpponents(data, playerIds[0]))
    return {
      data,
      summaries: playerIds.map((id) => playerSummary(data, id, scores)),
      // Progress uses the raw rounds: it spans the whole game, not evenings.
      progress: progressByRound(raw, playerIds, FORM_WINDOW),
      wins: cumulativeWins(data, playerIds),
      averages: averagePerSession(data, playerIds, MOVING_WINDOW),
      totals: totalPerSession(data, playerIds),
      hist: histogramSeries(data, playerIds),
      byHour: averageByHour(data, playerIds),
      starter: starterAdvantage(data, mode === 'player' ? playerIds : undefined),
      h2h: mode === 'group' ? h2h : h2h.filter((h) => h.a === playerIds[0] || h.b === playerIds[0]),
    }
  }, [raw, playerIds, mode])
}

type Stats = ReturnType<typeof useStats>

/** Summary table and all charts (Celkové statistiky). */
export function KostkyStatsView(props: StatsViewProps) {
  const stats = useStats(props)
  if (stats.data.sessions.length === 0) {
    return (
      <Card>
        <EmptyState>Zatím žádné odehrané hry</EmptyState>
      </Card>
    )
  }
  return (
    <div className="space-y-4">
      <SummaryTable stats={stats} {...props} />
      <Charts stats={stats} {...props} />
    </div>
  )
}

/** Just the summary table (game page, next to the input). */
export function KostkySummary(props: StatsViewProps) {
  const stats = useStats(props)
  if (stats.data.sessions.length === 0) return null
  return <SummaryTable stats={stats} {...props} />
}

/** Just the charts (game page, below the input). */
export function KostkyCharts(props: StatsViewProps) {
  const stats = useStats(props)
  if (stats.data.sessions.length === 0) {
    return (
      <Card>
        <EmptyState>Zatím žádné odehrané hry</EmptyState>
      </Card>
    )
  }
  return <Charts stats={stats} {...props} />
}

// ---------------------------------------------------------------------------
// Summary table: rows = stats, columns = players; the best value per row is marked
// ---------------------------------------------------------------------------

interface SummaryRow {
  label: string
  value: (s: PlayerSummary) => number | null
  format: (s: PlayerSummary) => string
  detail?: (s: PlayerSummary) => string | null
  /** Which value is better; omitted = no highlight. */
  better?: 'high' | 'low'
}

const SUMMARY_ROWS: SummaryRow[] = [
  { label: 'Vyhrané večery', value: (s) => s.wins, format: (s) => num(s.wins), better: 'high' },
  { label: 'Remízy', value: (s) => s.ties, format: (s) => num(s.ties) },
  {
    label: 'Úspěšnost',
    value: (s) => s.winRate,
    format: (s) => (s.winRate === null ? '–' : formatPercent(s.winRate)),
    better: 'high',
  },
  { label: 'Odehrané večery', value: (s) => s.sessionsPlayed, format: (s) => num(s.sessionsPlayed) },
  { label: 'Počet hodů', value: (s) => s.throws, format: (s) => num(s.throws) },
  {
    label: 'Průměr na hod',
    value: (s) => s.average,
    format: (s) => (s.average === null ? '–' : num(s.average)),
    better: 'high',
  },
  { label: 'Medián', value: (s) => s.median, format: (s) => (s.median === null ? '–' : num(s.median)), better: 'high' },
  {
    label: 'Nejvyšší hod',
    value: (s) => s.best?.value ?? null,
    format: (s) => (s.best ? num(s.best.value) : '–'),
    detail: (s) => (s.best ? formatDate(s.best.date) : null),
    better: 'high',
  },
  {
    label: 'Podíl nul',
    value: (s) => s.zeroShare,
    format: (s) => (s.zeroShare === null ? '–' : formatPercent(s.zeroShare)),
    better: 'low',
  },
  {
    label: 'Průměrný součet za večer',
    value: (s) => s.averageSessionTotal,
    format: (s) => (s.averageSessionTotal === null ? '–' : num(s.averageSessionTotal)),
    better: 'high',
  },
  {
    label: 'Nejlepší večer',
    value: (s) => s.bestSession?.total ?? null,
    format: (s) => (s.bestSession ? num(s.bestSession.total) : '–'),
    detail: (s) => (s.bestSession ? formatDate(s.bestSession.date) : null),
    better: 'high',
  },
  { label: 'Nejdelší série nul', value: (s) => s.longestZeroStreak, format: (s) => num(s.longestZeroStreak), better: 'low' },
  {
    label: 'Nejdelší série vítězství',
    value: (s) => s.longestWinStreak,
    format: (s) => num(s.longestWinStreak),
    better: 'high',
  },
]

function SummaryTable({ stats, playerIds, names }: { stats: Stats } & StatsViewProps) {
  const theme = useChartTheme()
  const multi = playerIds.length > 1

  const bestIndexes = (row: SummaryRow): Set<number> => {
    if (!multi || !row.better) return new Set()
    const values = stats.summaries.map(row.value)
    const valid = values.filter((v): v is number => v !== null)
    if (valid.length < 2) return new Set()
    const best = row.better === 'high' ? Math.max(...valid) : Math.min(...valid)
    // No highlight when everyone is equal.
    if (valid.every((v) => v === best)) return new Set()
    return new Set(values.flatMap((v, i) => (v === best ? [i] : [])))
  }

  return (
    <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-stone-200">
      <table className="tabular w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200">
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-stone-500">Souhrn</th>
            {playerIds.map((id, i) => (
              <th key={id} className="px-3 py-2 text-right font-bold text-stone-800">
                <span className="inline-flex items-center gap-1.5">
                  {multi && <span className="h-0.5 w-3 rounded-full" style={{ background: theme.series(i) }} aria-hidden />}
                  {names.get(id) ?? '?'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SUMMARY_ROWS.map((row, r) => {
            const best = bestIndexes(row)
            return (
              <tr key={row.label} className={r % 2 ? 'bg-stone-50/60' : ''}>
                <td className="px-3 py-1 text-stone-500">{row.label}</td>
                {stats.summaries.map((s, i) => {
                  const detail = row.detail?.(s)
                  return (
                    <td key={s.playerId} className="whitespace-nowrap px-3 py-1 text-right">
                      <span
                        className={
                          best.has(i)
                            ? 'rounded-md bg-brand-50 px-1.5 py-0.5 font-bold text-accent'
                            : 'font-semibold text-stone-800'
                        }
                      >
                        {row.format(s)}
                      </span>
                      {detail && <span className="ml-1.5 text-xs text-stone-400">{detail}</span>}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

function Charts({ stats, playerIds, names, mode }: { stats: Stats } & StatsViewProps) {
  const theme = useChartTheme()
  const [moving, setMoving] = useState(false)
  const name = (id: string) => names.get(id) ?? '?'
  const legend = playerIds.map((id, i) => ({ name: name(id), color: theme.series(i) }))
  const ax = axisProps(theme)
  const evenings = stats.data.sessions.length
  const ended = stats.wins.length
  const dateLabel = (l: unknown) => (typeof l === 'string' ? formatDate(l) : '')

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {mode === 'group' && stats.progress.length > 0 && (
        <ProgressChart stats={stats} playerIds={playerIds} name={name} theme={theme} legend={legend} />
      )}

      {mode === 'group' && playerIds.length === 2 && stats.progress.length > 0 && (
        <LeadChart stats={stats} playerIds={playerIds} name={name} theme={theme} />
      )}

      {stats.progress.length > 1 && (
        <ChartCard
          title="Forma"
          subtitle={`Průměr posledních ${FORM_WINDOW} hodů po kolech`}
          legend={legend}
        >
          <ResponsiveContainer>
            <LineChart data={stats.progress} margin={{ top: 6, right: 6, bottom: 0, left: -10 }}>
              <CartesianGrid {...gridProps(theme)} />
              <XAxis dataKey="round" {...ax} minTickGap={24} />
              <YAxis {...ax} tickFormatter={formatCompact} width={44} />
              <Tooltip
                cursor={{ stroke: theme.reference, strokeWidth: 1 }}
                content={(p) => (
                  <ChartTooltip {...p} formatLabel={(l) => `Kolo ${l}`} formatValue={num} />
                )}
              />
              {playerIds.map((id, i) => (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={`${id}_form`}
                  name={name(id)}
                  stroke={theme.series(i)}
                  strokeWidth={2}
                  strokeLinecap="round"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: theme.surface }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <ChartCard title="Rozložení hodů" subtitle="Podíl hodů v jednotlivých rozmezích" legend={legend}>
        <ResponsiveContainer>
          <BarChart data={stats.hist} margin={{ top: 6, right: 6, bottom: 0, left: -10 }} barGap={2} barCategoryGap="20%">
            <CartesianGrid {...gridProps(theme)} />
            <XAxis dataKey="label" {...ax} interval={0} angle={-30} textAnchor="end" height={48} />
            <YAxis {...ax} tickFormatter={(v: number) => formatPercent(v)} width={44} />
            <Tooltip
              cursor={{ fill: theme.band }}
              content={(p) => <ChartTooltip {...p} formatValue={formatPercent} />}
            />
            {playerIds.map((id, i) => (
              <Bar key={id} dataKey={id} name={name(id)} fill={theme.series(i)} radius={[4, 4, 0, 0]} maxBarSize={24} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {stats.totals.length > 0 && (
        <ChartCard title="Součet za večer" subtitle="Jen dohraná kola" legend={legend}>
          <ResponsiveContainer>
            <BarChart data={stats.totals} margin={{ top: 6, right: 6, bottom: 0, left: -10 }} barGap={2}>
              <CartesianGrid {...gridProps(theme)} />
              <XAxis dataKey="label" tickFormatter={(v: string) => formatShortDate(v)} {...ax} minTickGap={8} />
              <YAxis {...ax} tickFormatter={formatCompact} width={44} />
              <Tooltip
                cursor={{ fill: theme.band }}
                content={(p) => <ChartTooltip {...p} formatLabel={dateLabel} formatValue={num} />}
              />
              {playerIds.map((id, i) => (
                <Bar key={id} dataKey={id} name={name(id)} fill={theme.series(i)} radius={[4, 4, 0, 0]} maxBarSize={24} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {ended >= 2 && (
        <ChartCard title="Výhry v čase" subtitle="Vyhrané večery celkem" legend={legend}>
          <ResponsiveContainer>
            <LineChart data={stats.wins} margin={{ top: 6, right: 6, bottom: 0, left: -24 }}>
              <CartesianGrid {...gridProps(theme)} />
              <XAxis dataKey="label" tickFormatter={(v: string) => formatShortDate(v)} {...ax} minTickGap={16} />
              <YAxis allowDecimals={false} {...ax} />
              <Tooltip
                cursor={{ stroke: theme.reference, strokeWidth: 1 }}
                content={(p) => <ChartTooltip {...p} formatLabel={dateLabel} formatValue={num} />}
              />
              {playerIds.map((id, i) => (
                <Line
                  key={id}
                  type="stepAfter"
                  dataKey={id}
                  name={name(id)}
                  stroke={theme.series(i)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: theme.surface }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {evenings >= 2 && (
        <ChartCard
          title="Průměr na hod po večerech"
          legend={legend}
          actions={
            <label className="flex items-center gap-1.5 text-xs text-stone-600">
              <input
                type="checkbox"
                className="accent-brand-600"
                checked={moving}
                onChange={(e) => setMoving(e.target.checked)}
              />
              Klouzavý průměr ({MOVING_WINDOW} večerů)
            </label>
          }
        >
          <ResponsiveContainer>
            <LineChart data={stats.averages} margin={{ top: 6, right: 6, bottom: 0, left: -10 }}>
              <CartesianGrid {...gridProps(theme)} />
              <XAxis dataKey="label" tickFormatter={(v: string) => formatShortDate(v)} {...ax} minTickGap={16} />
              <YAxis {...ax} tickFormatter={formatCompact} width={44} />
              <Tooltip
                cursor={{ stroke: theme.reference, strokeWidth: 1 }}
                content={(p) => <ChartTooltip {...p} formatLabel={dateLabel} formatValue={num} />}
              />
              {playerIds.map((id, i) => (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={moving ? `${id}_ma` : id}
                  name={name(id)}
                  stroke={theme.series(i)}
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 2, stroke: theme.surface, fill: theme.series(i) }}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: theme.surface }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {stats.byHour.length > 0 && (
        <ChartCard title="Průměrný hod podle denní doby" legend={legend}>
          <ResponsiveContainer>
            <BarChart data={stats.byHour} margin={{ top: 6, right: 6, bottom: 0, left: -10 }} barGap={2}>
              <CartesianGrid {...gridProps(theme)} />
              <XAxis dataKey="label" {...ax} />
              <YAxis {...ax} tickFormatter={formatCompact} width={44} />
              <Tooltip cursor={{ fill: theme.band }} content={(p) => <ChartTooltip {...p} formatValue={num} />} />
              {playerIds.map((id, i) => (
                <Bar key={id} dataKey={id} name={name(id)} fill={theme.series(i)} radius={[4, 4, 0, 0]} maxBarSize={24} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <Card className="p-4!">
        <h3 className="mb-2 font-bold text-stone-800">Výhoda začínajícího hráče</h3>
        {stats.starter.games === 0 ? (
          <EmptyState>Zatím žádný dokončený večer</EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-stone-50 p-3">
              <div className="text-xs text-stone-500">Začínající hráč vyhrál</div>
              <div className="tabular text-2xl font-extrabold">{formatPercent(stats.starter.starterRate ?? 0)}</div>
              <div className="text-xs text-stone-500">
                {stats.starter.starterWins} z {stats.starter.games} večerů
              </div>
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <div className="text-xs text-stone-500">Ostatní hráči v průměru</div>
              <div className="tabular text-2xl font-extrabold">{formatPercent(stats.starter.othersRate ?? 0)}</div>
              <div className="text-xs text-stone-500">výher na hráče</div>
            </div>
          </div>
        )}
        {ended < 2 && (
          <p className="mt-3 text-xs text-stone-500">
            Grafy výher a průměru po večerech se ukážou od dvou odehraných večerů.
          </p>
        )}
      </Card>

      {/* With two players the summary table already says who won more often. */}
      {stats.h2h.length > 0 && !(mode === 'group' && playerIds.length === 2) && (
        <section className="lg:col-span-2">
          <SectionTitle>Vzájemné zápasy</SectionTitle>
          <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-stone-200">
            <table className="tabular w-full text-sm">
              <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Dvojice</th>
                  <th className="px-3 py-2 text-right font-semibold">Večerů</th>
                  <th className="px-3 py-2 text-right font-semibold">Výhry : prohry</th>
                  <th className="px-3 py-2 text-right font-semibold">Stejně</th>
                </tr>
              </thead>
              <tbody>
                {stats.h2h.map((h) => {
                  // In player mode, the selected player is always on the left.
                  const flip = mode === 'player' && h.b === playerIds[0]
                  const [a, b, aw, bw] = flip ? [h.b, h.a, h.bBetter, h.aBetter] : [h.a, h.b, h.aBetter, h.bBetter]
                  return (
                    <tr key={`${h.a}-${h.b}`} className="border-t border-stone-100">
                      <td className="px-3 py-1.5">
                        <strong>{name(a)}</strong> vs {name(b)}
                      </td>
                      <td className="px-3 py-1.5 text-right">{h.games}</td>
                      <td className="px-3 py-1.5 text-right font-semibold">
                        {aw} : {bw}
                      </td>
                      <td className="px-3 py-1.5 text-right">{h.equal}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-stone-500">Porovnání součtů ve společných večerech (jen dohraná kola).</p>
        </section>
      )}
    </div>
  )
}

interface ProgressProps {
  stats: Stats
  playerIds: string[]
  name: (id: string) => string
  theme: ChartTheme
}

/** Cumulative points per round over the whole game, with a soft wash under each line. */
function ProgressChart({ stats, playerIds, name, theme, legend }: ProgressProps & { legend: { name: string; color: string }[] }) {
  const gradientId = useId()
  const lastIndex = stats.progress.length - 1
  const leader = (row: Record<string, unknown>) => {
    const sorted = playerIds
      .map((id) => ({ id, total: row[id] as number }))
      .sort((a, b) => b.total - a.total)
    if (sorted.length < 2) return null
    const diff = sorted[0].total - sorted[1].total
    return diff === 0 ? 'Remíza' : `Vede ${name(sorted[0].id)} o ${formatNumber(diff)}`
  }

  return (
    <ChartCard
      title="Průběh skóre"
      subtitle="Body celkem po jednotlivých kolech"
      legend={legend}
      height="h-64 sm:h-80"
      className="lg:col-span-2"
    >
      <ResponsiveContainer>
        <AreaChart data={stats.progress} margin={{ top: 8, right: 12, bottom: 0, left: -6 }}>
          <defs>
            {playerIds.map((id, i) => (
              <linearGradient key={id} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.series(i)} stopOpacity={0.16} />
                <stop offset="100%" stopColor={theme.series(i)} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid {...gridProps(theme)} />
          <XAxis dataKey="round" {...axisProps(theme)} minTickGap={28} />
          <YAxis {...axisProps(theme)} tickFormatter={formatCompact} width={52} />
          <Tooltip
            cursor={{ stroke: theme.reference, strokeWidth: 1 }}
            content={(p) => (
              <ChartTooltip
                {...p}
                formatLabel={(l, row) => `Kolo ${l}${row?.date ? ` · ${formatDate(row.date as string)}` : ''}`}
                formatValue={num}
                footer={leader}
              />
            )}
          />
          {playerIds.map((id, i) => (
            <Area
              key={id}
              type="monotone"
              dataKey={id}
              name={name(id)}
              stroke={theme.series(i)}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={`url(#${gradientId}-${i})`}
              // End marker on the latest round only.
              dot={(props: { cx?: number; cy?: number; index?: number }) =>
                props.index === lastIndex && props.cx !== undefined && props.cy !== undefined ? (
                  <circle
                    key={`end-${id}`}
                    cx={props.cx}
                    cy={props.cy}
                    r={4.5}
                    fill={theme.series(i)}
                    stroke={theme.surface}
                    strokeWidth={2}
                  />
                ) : (
                  <g key={`dot-${id}-${props.index}`} />
                )
              }
              activeDot={{ r: 4.5, strokeWidth: 2, stroke: theme.surface }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

/** Two players: the lead over the rounds; above zero the first player leads, below the second. */
function LeadChart({ stats, playerIds, name, theme }: ProgressProps) {
  const gradientId = useId()
  const [a, b] = playerIds
  const leads = stats.progress.map((r) => r.lead as number)
  const max = Math.max(0, ...leads)
  const min = Math.min(0, ...leads)
  // Where zero sits in the gradient (0 = top, 1 = bottom).
  const zero = max === min ? 0.5 : max / (max - min)

  return (
    <ChartCard
      title="Náskok"
      subtitle={`Nahoře vede ${name(a)}, dole ${name(b)}`}
      legend={[
        { name: name(a), color: theme.series(0) },
        { name: name(b), color: theme.series(1) },
      ]}
    >
      <ResponsiveContainer>
        <AreaChart data={stats.progress} margin={{ top: 6, right: 6, bottom: 0, left: -10 }}>
          <defs>
            <linearGradient id={`${gradientId}-stroke`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={zero} stopColor={theme.series(0)} />
              <stop offset={zero} stopColor={theme.series(1)} />
            </linearGradient>
            <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={theme.series(0)} stopOpacity={0.22} />
              <stop offset={zero} stopColor={theme.series(0)} stopOpacity={0.04} />
              <stop offset={zero} stopColor={theme.series(1)} stopOpacity={0.04} />
              <stop offset={1} stopColor={theme.series(1)} stopOpacity={0.22} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps(theme)} />
          <XAxis dataKey="round" {...axisProps(theme)} minTickGap={24} />
          <YAxis {...axisProps(theme)} tickFormatter={(v: number) => formatCompact(Math.abs(v))} width={44} />
          <ReferenceLine y={0} stroke={theme.reference} strokeWidth={1} />
          <Tooltip
            cursor={{ stroke: theme.reference, strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const lead = payload[0].value as number
              return (
                <div className="rounded-xl bg-surface px-3 py-2 text-sm shadow-lg ring-1 ring-stone-200">
                  <div className="mb-0.5 text-xs font-semibold text-stone-500">Kolo {label}</div>
                  <div className="tabular font-bold text-stone-900">
                    {lead === 0 ? 'Remíza' : `Vede ${name(lead > 0 ? a : b)} o ${formatNumber(Math.abs(lead))}`}
                  </div>
                </div>
              )
            }}
          />
          <Area
            type="monotone"
            dataKey="lead"
            stroke={`url(#${gradientId}-stroke)`}
            strokeWidth={2}
            fill={`url(#${gradientId}-fill)`}
            baseValue={0}
            activeDot={{ r: 4, strokeWidth: 2, stroke: theme.surface }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

function allOpponents(data: StatsData, playerId: string): string[] {
  const ids = new Set<string>([playerId])
  for (const s of data.sessions) {
    if (s.players.some((p) => p.player_id === playerId)) for (const p of s.players) ids.add(p.player_id)
  }
  return [...ids]
}
