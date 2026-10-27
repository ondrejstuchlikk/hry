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
import { axisProps, ChartCard, ChartTooltip, gridProps, useChartTheme } from '../../components/charts'
import { selectClass } from '../../components/GameTypeSelect'
import { Card, EmptyState, SectionTitle } from '../../components/ui'
import { formatDate, formatNumber, formatPercent, formatShortDate, formatTime, joinNames } from '../../lib/format'
import type { StatsViewProps } from '../types'
import {
  averagePerPartie,
  buildPartien,
  cumulativeWins,
  dealerAdvantage,
  handsByGroup,
  headToHead,
  jokerStats,
  lossHistogram,
  partieProgress,
  playerSummary,
  type Partie,
  type ZolikSummary as Summary,
} from './stats'

const num = (v: number) => formatNumber(v)
const num1 = (v: number) => formatNumber(v, 1)
const pct = (v: number | null) => (v === null ? '–' : formatPercent(v))

function useStats({ data, playerIds, mode }: StatsViewProps) {
  return useMemo(() => {
    const partien = buildPartien(data)
    const hands = partien.flatMap((p) => p.hands)
    const h2hIds = mode === 'group' ? playerIds : allOpponents(partien, playerIds[0])
    const h2h = headToHead(partien, h2hIds)
    return {
      partien,
      summaries: playerIds.map((id) => playerSummary(partien, id)),
      wins: cumulativeWins(partien, playerIds),
      averages: averagePerPartie(partien, playerIds),
      hist: lossHistogram(partien, playerIds),
      dealer: dealerAdvantage(hands, playerIds),
      jokers: jokerStats(handsByGroup(partien), playerIds),
      h2h: mode === 'group' ? h2h : h2h.filter((h) => h.a === playerIds[0] || h.b === playerIds[0]),
    }
  }, [data, playerIds, mode])
}

type Stats = ReturnType<typeof useStats>

function NoGames() {
  return (
    <Card>
      <EmptyState>Zatím žádné odehrané partie</EmptyState>
    </Card>
  )
}

/** Summary table and all charts (Celkové statistiky). */
export function ZolikStatsView(props: StatsViewProps) {
  const stats = useStats(props)
  if (stats.partien.length === 0) return <NoGames />
  return (
    <div className="space-y-4">
      <SummaryTable stats={stats} {...props} />
      <Charts stats={stats} {...props} />
    </div>
  )
}

/** Just the summary table (game page). */
export function ZolikSummary(props: StatsViewProps) {
  const stats = useStats(props)
  if (stats.partien.length === 0) return null
  return <SummaryTable stats={stats} {...props} />
}

/** Just the charts (game page). */
export function ZolikCharts(props: StatsViewProps) {
  const stats = useStats(props)
  if (stats.partien.length === 0) return <NoGames />
  return <Charts stats={stats} {...props} />
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

const n = (v: number | null) => (v === null ? '–' : num1(v))

const SUMMARY_ROWS: SummaryRow[] = [
  { label: 'Vyhrané partie', value: (s) => s.partieWins, format: (s) => num(s.partieWins), better: 'high' },
  { label: 'Remízy', value: (s) => s.partieTies, format: (s) => num(s.partieTies) },
  { label: 'Úspěšnost partií', value: (s) => s.partieWinRate, format: (s) => pct(s.partieWinRate), better: 'high' },
  { label: 'Odehrané partie', value: (s) => s.partiePlayed, format: (s) => num(s.partiePlayed) },
  { label: 'Vyhrané hry', value: (s) => s.handsWon, format: (s) => num(s.handsWon), better: 'high' },
  { label: 'Odehrané hry', value: (s) => s.hands, format: (s) => num(s.hands) },
  { label: 'Úspěšnost her', value: (s) => s.handWinRate, format: (s) => pct(s.handWinRate), better: 'high' },
  { label: 'Průměr bodů při prohře', value: (s) => s.averageLoss, format: (s) => n(s.averageLoss), better: 'low' },
  { label: 'Průměr bodů na hru', value: (s) => s.averagePerHand, format: (s) => n(s.averagePerHand), better: 'low' },
  {
    label: 'Nejhorší prohra',
    value: (s) => s.worstLoss?.value ?? null,
    format: (s) => (s.worstLoss ? num(s.worstLoss.value) : '–'),
    detail: (s) => (s.worstLoss ? formatDate(s.worstLoss.date) : null),
    better: 'low',
  },
  {
    label: 'Nejlepší partie',
    value: (s) => s.bestPartie?.total ?? null,
    format: (s) => (s.bestPartie ? num(s.bestPartie.total) : '–'),
    detail: (s) => (s.bestPartie ? formatDate(s.bestPartie.date) : null),
    better: 'low',
  },
  {
    label: 'Nejhorší partie',
    value: (s) => s.worstPartie?.total ?? null,
    format: (s) => (s.worstPartie ? num(s.worstPartie.total) : '–'),
    detail: (s) => (s.worstPartie ? formatDate(s.worstPartie.date) : null),
    better: 'low',
  },
  {
    label: 'Nejdelší série vyhraných her',
    value: (s) => s.longestHandWinStreak,
    format: (s) => num(s.longestHandWinStreak),
    better: 'high',
  },
  {
    label: 'Nejdelší série vyhraných partií',
    value: (s) => s.longestPartieWinStreak,
    format: (s) => num(s.longestPartieWinStreak),
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
  const name = (id: string) => names.get(id) ?? '?'
  const legend = playerIds.map((id, i) => ({ name: name(id), color: theme.series(i) }))
  const ax = axisProps(theme)
  const dateLabel = (l: unknown) => (typeof l === 'string' ? formatDate(l) : '')
  const finished = stats.wins.length

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PartieProgressChart partien={stats.partien} playerIds={playerIds} names={names} mode={mode} />

      {finished >= 2 && (
        <ChartCard title="Výhry v čase" subtitle="Vyhrané partie celkem" legend={legend}>
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

      {stats.averages.length >= 2 && (
        <ChartCard title="Průměr bodů na hru po partiích" subtitle="Méně je lépe" legend={legend}>
          <ResponsiveContainer>
            <LineChart data={stats.averages} margin={{ top: 6, right: 6, bottom: 0, left: -10 }}>
              <CartesianGrid {...gridProps(theme)} />
              <XAxis dataKey="label" tickFormatter={(v: string) => formatShortDate(v)} {...ax} minTickGap={16} />
              <YAxis {...ax} width={44} />
              <Tooltip
                cursor={{ stroke: theme.reference, strokeWidth: 1 }}
                content={(p) => <ChartTooltip {...p} formatLabel={dateLabel} formatValue={num1} />}
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

      <ChartCard title="Rozložení proher" subtitle="Podíl proher v jednotlivých rozmezích bodů" legend={legend}>
        <ResponsiveContainer>
          <BarChart data={stats.hist} margin={{ top: 6, right: 6, bottom: 0, left: -10 }} barGap={2} barCategoryGap="20%">
            <CartesianGrid {...gridProps(theme)} />
            <XAxis dataKey="label" {...ax} interval={0} />
            <YAxis {...ax} tickFormatter={(v: number) => formatPercent(v)} width={44} />
            <Tooltip cursor={{ fill: theme.band }} content={(p) => <ChartTooltip {...p} formatValue={formatPercent} />} />
            {playerIds.map((id, i) => (
              <Bar key={id} dataKey={id} name={name(id)} fill={theme.series(i)} radius={[4, 4, 0, 0]} maxBarSize={24} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <DealerCard stats={stats} playerIds={playerIds} name={name} />
      <JokersCard stats={stats} playerIds={playerIds} name={name} />

      {/* With two players the summary table already says who won more often. */}
      {stats.h2h.length > 0 && !(mode === 'group' && playerIds.length === 2) && (
        <section className="lg:col-span-2">
          <SectionTitle>Vzájemné zápasy</SectionTitle>
          <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-stone-200">
            <table className="tabular w-full text-sm">
              <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Dvojice</th>
                  <th className="px-3 py-2 text-right font-semibold">Partií</th>
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
                      <td className="px-3 py-1.5 text-right">{h.partien}</td>
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
          <p className="mt-1 text-xs text-stone-500">Kdo měl ve společné partii méně bodů (jen ukončené partie).</p>
        </section>
      )}
    </div>
  )
}

/** Running totals of one partie (picker, default = latest). */
function PartieProgressChart({
  partien,
  playerIds,
  names,
  mode,
}: {
  partien: Partie[]
  playerIds: string[]
  names: Map<string, string>
  mode: StatsViewProps['mode']
}) {
  const theme = useChartTheme()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const partie = partien.find((p) => p.id === selectedId) ?? partien[partien.length - 1]
  // Group view keeps the page's colors; player view shows everyone of that partie, selected player first.
  const ids =
    mode === 'group'
      ? playerIds
      : [...partie.playerIds].sort((a, b) => Number(b === playerIds[0]) - Number(a === playerIds[0]))
  const rows = partieProgress(partie, ids)
  const name = (id: string) => names.get(id) ?? '?'

  const label = (p: Partie) =>
    `${formatDate(p.startedAt)} ${formatTime(p.startedAt)}${mode === 'player' ? ` – ${joinNames(p.playerIds.map(name))}` : ''}${p.inProgress ? ' (probíhá)' : ''}`

  return (
    <ChartCard
      title="Průběh partie"
      subtitle="Body celkem po jednotlivých hrách"
      legend={ids.map((id, i) => ({ name: name(id), color: theme.series(i) }))}
      height="h-64 sm:h-72"
      className="lg:col-span-2"
      actions={
        <select
          className={`${selectClass} w-auto! py-1! text-sm`}
          value={partie.id}
          onChange={(e) => setSelectedId(e.target.value)}
          aria-label="Vybrat partii"
        >
          {[...partien].reverse().map((p) => (
            <option key={p.id} value={p.id}>
              {label(p)}
            </option>
          ))}
        </select>
      }
    >
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
          <CartesianGrid {...gridProps(theme)} />
          <XAxis dataKey="hand" {...axisProps(theme)} allowDecimals={false} minTickGap={16} />
          <YAxis {...axisProps(theme)} width={44} />
          <Tooltip
            cursor={{ stroke: theme.reference, strokeWidth: 1 }}
            content={(p) => (
              <ChartTooltip {...p} formatLabel={(l) => (l === 0 ? 'Začátek' : `Hra ${l}`)} formatValue={num} />
            )}
          />
          {ids.map((id, i) => (
            <Line
              key={id}
              type="linear"
              dataKey={id}
              name={name(id)}
              stroke={theme.series(i)}
              strokeWidth={2}
              dot={rows.length <= 30 ? { r: 2.5, strokeWidth: 0, fill: theme.series(i) } : false}
              activeDot={{ r: 4.5, strokeWidth: 2, stroke: theme.surface }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-stone-50 p-3 text-center">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="tabular text-2xl font-extrabold">{value}</div>
      {note && <div className="text-xs text-stone-500">{note}</div>}
    </div>
  )
}

function DealerCard({ stats, playerIds, name }: { stats: Stats; playerIds: string[]; name: (id: string) => string }) {
  const d = stats.dealer
  return (
    <Card className="p-4!">
      <h3 className="mb-2 font-bold text-stone-800">Výhoda rozdávajícího</h3>
      {d.hands === 0 ? (
        <EmptyState>Zatím žádná odehraná hra</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Rozdávající vyhrál" value={pct(d.dealerRate)} note={`${d.dealerWins} z ${d.hands} her`} />
            <Stat label="Ostatní hráči" value={pct(d.othersRate)} note="výher na hráče" />
            <Stat label="Očekáváno" value={pct(d.baseline)} note="1 / počet hráčů" />
          </div>
          <table className="tabular mt-3 w-full text-right text-sm">
            <thead className="text-xs uppercase text-stone-500">
              <tr>
                <th className="py-1 text-left font-semibold">Hráč</th>
                <th className="py-1 font-semibold">Vyhrává, když rozdává</th>
                <th className="py-1 font-semibold">Vyhrává, když nerozdává</th>
              </tr>
            </thead>
            <tbody>
              {playerIds.map((id) => {
                const s = d.perPlayer.get(id)!
                return (
                  <tr key={id} className="border-t border-stone-100">
                    <td className="py-1.5 text-left font-medium">{name(id)}</td>
                    <td className="py-1.5">
                      {pct(s.dealt ? s.winsDealing / s.dealt : null)}
                      <span className="ml-1 text-xs text-stone-400">
                        {s.winsDealing}/{s.dealt}
                      </span>
                    </td>
                    <td className="py-1.5">
                      {pct(s.notDealt ? s.winsNotDealing / s.notDealt : null)}
                      <span className="ml-1 text-xs text-stone-400">
                        {s.winsNotDealing}/{s.notDealt}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </Card>
  )
}

function JokersCard({ stats, playerIds, name }: { stats: Stats; playerIds: string[]; name: (id: string) => string }) {
  const any = playerIds.some((id) => (stats.jokers.get(id)?.hands ?? 0) > 0)
  return (
    <Card className="p-4!">
      <h3 className="mb-2 font-bold text-stone-800">Ponechané žolíky</h3>
      {!any ? (
        <EmptyState>Zatím žádná odehraná hra</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="tabular w-full whitespace-nowrap text-right text-sm">
              <thead className="text-xs uppercase text-stone-500">
                <tr>
                  <th className="py-1 pr-2 text-left font-semibold">Hráč</th>
                  <th className="px-2 py-1 font-semibold">Kolikrát</th>
                  <th className="px-2 py-1 font-semibold">Žolíků</th>
                  <th className="px-2 py-1 font-semibold">Ø počet</th>
                  <th className="px-2 py-1 font-semibold">Výhry hned potom</th>
                  <th className="py-1 pl-2 font-semibold">Výhry celkem</th>
                </tr>
              </thead>
              <tbody>
                {playerIds.map((id) => {
                  const s = stats.jokers.get(id)!
                  return (
                    <tr key={id} className="border-t border-stone-100">
                      <td className="py-1.5 pr-2 text-left font-medium">{name(id)}</td>
                      <td className="px-2 py-1.5">
                        {s.keptHands}
                        <span className="ml-1 text-xs text-stone-400">
                          z {s.handsWon} výher
                        </span>
                      </td>
                      <td className="px-2 py-1.5">{s.keptTotal}</td>
                      <td className="px-2 py-1.5">{s.keptHands ? num1(s.keptTotal / s.keptHands) : '–'}</td>
                      <td className="px-2 py-1.5 font-semibold">
                        {pct(s.followHands ? s.followWins / s.followHands : null)}
                        <span className="ml-1 text-xs font-normal text-stone-400">
                          {s.followWins}/{s.followHands}
                        </span>
                      </td>
                      <td className="py-1.5 pl-2">{pct(s.hands ? s.handsWon / s.hands : null)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            „Výhry hned potom“ = úspěšnost ve hře následující po té, kde si hráč nechal aspoň 1 žolíka (počítá se i přes
            hranici partie).
          </p>
        </>
      )}
    </Card>
  )
}

function allOpponents(partien: Partie[], playerId: string): string[] {
  const ids = new Set<string>([playerId])
  for (const p of partien) if (p.playerIds.includes(playerId)) for (const id of p.playerIds) ids.add(id)
  return [...ids]
}
