import { useMemo, useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { axisProps, ChartCard, ChartTooltip, gridProps, useChartTheme } from '../../components/charts'
import { selectClass } from '../../components/GameTypeSelect'
import { Card, EmptyState, SectionTitle } from '../../components/ui'
import { formatDate, formatNumber, formatPercent, formatShortDate, joinNames } from '../../lib/format'
import type { StatsViewProps } from '../types'
import { episodeLabel, type Question } from './logic'
import {
  buildEpisodes,
  cumulativeWins,
  headToHead,
  nobodyShare,
  playerSummary,
  pointsPerEpisode,
  questionProgress,
  type AzkvizSummary as Summary,
  type Episode,
} from './stats'
import { NOBODY_NOTE } from './text'

const num = (v: number) => formatNumber(v)
const num1 = (v: number) => formatNumber(v, 1)
const pct = (v: number | null) => (v === null ? '–' : formatPercent(v))

function useStats({ data, playerIds, mode }: StatsViewProps) {
  return useMemo(() => {
    const episodes = buildEpisodes(data)
    const h2hIds = mode === 'group' ? playerIds : allOpponents(episodes, playerIds[0])
    const h2h = headToHead(episodes, h2hIds)
    return {
      episodes,
      summaries: playerIds.map((id) => playerSummary(episodes, id)),
      wins: cumulativeWins(episodes, playerIds),
      points: pointsPerEpisode(episodes, playerIds),
      nobody: nobodyShare(episodes),
      h2h: mode === 'group' ? h2h : h2h.filter((h) => h.a === playerIds[0] || h.b === playerIds[0]),
    }
  }, [data, playerIds, mode])
}

type Stats = ReturnType<typeof useStats>

/** Summary table and all charts (group view in „Průběžné statistiky“, Celkové statistiky). */
export function AzkvizStatsView(props: StatsViewProps) {
  const stats = useStats(props)
  if (stats.episodes.length === 0) {
    return (
      <Card>
        <EmptyState>Zatím žádné odehrané epizody</EmptyState>
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

// ---------------------------------------------------------------------------
// Summary table: rows = stats, columns = players; the best value per row is marked
// ---------------------------------------------------------------------------

interface SummaryRow {
  label: string
  value: (s: Summary) => number | null
  format: (s: Summary) => string
  detail?: (s: Summary) => string | null
  better?: 'high' | 'low'
}

const n1 = (v: number | null) => (v === null ? '–' : num1(v))

const SUMMARY_ROWS: SummaryRow[] = [
  { label: 'Vyhrané epizody', value: (s) => s.wins, format: (s) => num(s.wins), better: 'high' },
  { label: 'Remízy', value: (s) => s.ties, format: (s) => num(s.ties) },
  { label: 'Podíl vyhraných epizod', value: (s) => s.winRate, format: (s) => pct(s.winRate), better: 'high' },
  { label: 'Odehrané epizody', value: (s) => s.episodesPlayed, format: (s) => num(s.episodesPlayed) },
  { label: 'Body celkem', value: (s) => s.points, format: (s) => num(s.points), better: 'high' },
  { label: 'Průměr bodů na epizodu', value: (s) => s.averagePoints, format: (s) => n1(s.averagePoints), better: 'high' },
  { label: 'Podíl bodů', value: (s) => s.averageShare, format: (s) => pct(s.averageShare), better: 'high' },
  { label: 'Úspěšnost*', value: (s) => s.successRate, format: (s) => pct(s.successRate), better: 'high' },
  {
    label: 'Nejlepší epizoda',
    value: (s) => s.bestEpisode?.points ?? null,
    format: (s) => (s.bestEpisode ? num(s.bestEpisode.points) : '–'),
    detail: (s) => (s.bestEpisode ? formatDate(s.bestEpisode.date) : null),
    better: 'high',
  },
  {
    label: 'Nejdelší série otázek',
    value: (s) => s.longestQuestionStreak,
    format: (s) => num(s.longestQuestionStreak),
    better: 'high',
  },
  {
    label: 'Nejdelší série vyhraných epizod',
    value: (s) => s.longestEpisodeWinStreak,
    format: (s) => num(s.longestEpisodeWinStreak),
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
      <p className="border-t border-stone-100 px-3 py-2 text-xs text-stone-500">
        Podíl bodů = průměrný podíl na bodech epizody (z otázek, které někdo uhodl). Úspěšnost = body ze všech otázek.
        <br />* {NOBODY_NOTE}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

function Charts({ stats, playerIds, names, mode }: { stats: Stats } & StatsViewProps) {
  const theme = useChartTheme()
  const name = (id: string) => names.get(id) ?? '?'
  const legend = playerIds.map((id, i) => ({ name: name(id), color: theme.series(i) }))
  const ax = axisProps(theme)
  const dateLabel = (l: unknown) => (typeof l === 'string' ? formatDate(l) : '')
  const shares = playerIds.map((id, i) => ({
    key: id,
    label: name(id),
    share: stats.summaries[i].averageShare ?? 0,
    color: theme.series(i),
  }))
  const questionsPerEpisode = stats.episodes.reduce((sum, e) => sum + e.questions.length, 0) / stats.episodes.length

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <EpisodePickerChart episodes={stats.episodes} playerIds={playerIds} names={names} mode={mode} />

      {stats.wins.length >= 2 && (
        <ChartCard title="Výhry v čase" subtitle="Vyhrané epizody celkem" legend={legend}>
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

      {stats.points.length >= 2 && (
        <ChartCard title="Body v epizodách" subtitle="Body každého hráče po epizodách" legend={legend}>
          <ResponsiveContainer>
            <LineChart data={stats.points} margin={{ top: 6, right: 6, bottom: 0, left: -24 }}>
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
                  type="monotone"
                  dataKey={id}
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

      {mode === 'group' && playerIds.length > 1 && (
        <ChartCard title="Průměrný podíl bodů" subtitle="Podíl na bodech epizody (z otázek, které někdo uhodl)">
          <ResponsiveContainer>
            <BarChart data={shares} margin={{ top: 6, right: 6, bottom: 0, left: -10 }} barCategoryGap="30%">
              <CartesianGrid {...gridProps(theme)} />
              <XAxis dataKey="label" {...ax} interval={0} />
              <YAxis {...ax} tickFormatter={(v: number) => formatPercent(v)} width={44} domain={[0, 1]} />
              <Tooltip cursor={{ fill: theme.band }} content={(p) => <ChartTooltip {...p} formatValue={formatPercent} />} />
              <Bar dataKey="share" name="Podíl bodů" radius={[4, 4, 0, 0]} maxBarSize={48}>
                {shares.map((s) => (
                  <Cell key={s.key} fill={s.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <div>
      <ChartCard
        title="Neuhodnuté otázky*"
        subtitle={`Podíl „Nikdo“ v epizodách · průměrně ${num1(questionsPerEpisode)} otázek na epizodu*`}
      >
        <ResponsiveContainer>
          <LineChart data={stats.nobody} margin={{ top: 6, right: 6, bottom: 0, left: -10 }}>
            <CartesianGrid {...gridProps(theme)} />
            <XAxis dataKey="label" tickFormatter={(v: string) => formatShortDate(v)} {...ax} minTickGap={16} />
            <YAxis {...ax} tickFormatter={(v: number) => formatPercent(v)} width={44} domain={[0, 1]} />
            <Tooltip
              cursor={{ stroke: theme.reference, strokeWidth: 1 }}
              content={(p) => <ChartTooltip {...p} formatLabel={dateLabel} formatValue={formatPercent} />}
            />
            <Line
              type="monotone"
              dataKey="share"
              name="Nikdo"
              stroke={theme.series(playerIds.length)}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 2, stroke: theme.surface, fill: theme.series(playerIds.length) }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <p className="mt-1 px-1 text-xs text-stone-500">* {NOBODY_NOTE}</p>
      </div>

      {/* With two players the summary table already says who won more often. */}
      {stats.h2h.length > 0 && !(mode === 'group' && playerIds.length === 2) && (
        <section className="lg:col-span-2">
          <SectionTitle>Vzájemné zápasy</SectionTitle>
          <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-stone-200">
            <table className="tabular w-full text-sm">
              <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Dvojice</th>
                  <th className="px-3 py-2 text-right font-semibold">Epizod</th>
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
                      <td className="px-3 py-1.5 text-right">{h.episodes}</td>
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
          <p className="mt-1 text-xs text-stone-500">Kdo měl ve společné epizodě víc bodů (jen ukončené epizody).</p>
        </section>
      )}
    </div>
  )
}

/** Score progression of one episode with a picker (default = latest). */
function EpisodePickerChart({
  episodes,
  playerIds,
  names,
  mode,
}: {
  episodes: Episode[]
  playerIds: string[]
  names: Map<string, string>
  mode: StatsViewProps['mode']
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const episode = episodes.find((e) => e.id === selectedId) ?? episodes[episodes.length - 1]
  const name = (id: string) => names.get(id) ?? '?'
  // Group view keeps the page's colors; player view shows everyone of that episode, selected player first.
  const ids =
    mode === 'group'
      ? playerIds
      : [...episode.playerIds].sort((a, b) => Number(b === playerIds[0]) - Number(a === playerIds[0]))
  const starts = (groupKey: string) => episodes.filter((e) => e.groupKey === groupKey).map((e) => e.startedAt)
  const label = (e: Episode) =>
    `${episodeLabel(e.startedAt, starts(e.groupKey))}${mode === 'player' ? ` – ${joinNames(e.playerIds.map(name))}` : ''}${e.inProgress ? ' (probíhá)' : ''}`

  return (
    <EpisodeProgressChart
      questions={episode.questions}
      playerIds={ids}
      names={names}
      title="Průběh epizody"
      actions={
        <select
          className={`${selectClass} w-auto! py-1! text-sm`}
          value={episode.id}
          onChange={(e) => setSelectedId(e.target.value)}
          aria-label="Vybrat epizodu"
        >
          {[...episodes].reverse().map((e) => (
            <option key={e.id} value={e.id}>
              {label(e)}
            </option>
          ))}
        </select>
      }
    />
  )
}

/** Running points per player over the question number. */
export function EpisodeProgressChart({
  questions,
  playerIds,
  names,
  title = 'Průběh epizody',
  actions,
}: {
  questions: Question[]
  playerIds: string[]
  names: Map<string, string>
  title?: string
  actions?: ReactNode
}) {
  const theme = useChartTheme()
  const rows = questionProgress(questions, playerIds)
  const name = (id: string) => names.get(id) ?? '?'
  const tooltipLabel = (l: unknown) => (l === 0 ? 'Začátek' : `Otázka ${l}`)

  return (
    <ChartCard
      title={title}
      subtitle="Body po jednotlivých otázkách"
      legend={playerIds.map((id, i) => ({ name: name(id), color: theme.series(i) }))}
      height="h-64 sm:h-72"
      className="lg:col-span-2"
      actions={actions}
    >
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -24 }}>
          <CartesianGrid {...gridProps(theme)} />
          <XAxis
            dataKey="question"
            type="number"
            domain={[0, 'dataMax']}
            {...axisProps(theme)}
            allowDecimals={false}
            minTickGap={16}
          />
          <YAxis {...axisProps(theme)} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: theme.reference, strokeWidth: 1 }}
            content={(p) => <ChartTooltip {...p} formatLabel={tooltipLabel} formatValue={num} />}
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
              activeDot={{ r: 4.5, strokeWidth: 2, stroke: theme.surface }}
              isAnimationActive={rows.length <= 200}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

function allOpponents(episodes: Episode[], playerId: string): string[] {
  const ids = new Set<string>([playerId])
  for (const e of episodes) if (e.playerIds.includes(playerId)) for (const id of e.playerIds) ids.add(id)
  return [...ids]
}
