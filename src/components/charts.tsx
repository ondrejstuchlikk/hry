import type { ReactNode } from 'react'
import { useAppearance } from '../lib/theme'
import { Card } from './ui'

/**
 * Categorical series colors in fixed order (validated CVD-safe palette), with separately
 * validated steps for the dark surface. A player's color comes from their position in the
 * page's stable player list.
 */
const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']

export interface ChartTheme {
  series: (index: number) => string
  /** Axis tick text. */
  tick: string
  /** Gridlines and the crosshair. */
  grid: string
  /** Hover band behind bars. */
  band: string
  /** Card surface (rings around markers). */
  surface: string
  /** Neutral reference lines (e.g. zero). */
  reference: string
}

export function useChartTheme(): ChartTheme {
  const { dark } = useAppearance()
  const series = dark ? SERIES_DARK : SERIES_LIGHT
  return {
    series: (i) => series[i % series.length],
    tick: dark ? '#a8a29e' : '#78716c',
    grid: dark ? '#36332f' : '#ece9e6',
    band: dark ? 'rgba(255,255,255,0.05)' : 'rgba(28,25,23,0.04)',
    surface: dark ? '#22201d' : '#ffffff',
    reference: dark ? '#57534e' : '#a8a29e',
  }
}

/** Shared axis props: no axis line, small muted ticks. */
export function axisProps(theme: ChartTheme) {
  return {
    stroke: theme.grid,
    tick: { fill: theme.tick, fontSize: 11 },
    tickLine: false,
    axisLine: false,
  } as const
}

export function gridProps(theme: ChartTheme) {
  return { stroke: theme.grid, vertical: false, strokeWidth: 1 } as const
}

export interface TooltipRow {
  key: string
  name: string
  color: string
  value: string
}

/** Recharts payload item (only what the tooltip needs). */
interface PayloadItem {
  dataKey?: string | number | ((obj: unknown) => unknown)
  name?: string | number
  value?: unknown
  color?: string
  stroke?: string
  fill?: string
  payload?: Record<string, unknown>
}

/**
 * Tooltip card: label on top, one row per series keyed with a short line in the series color,
 * value first and bold. `footer` adds a summary row (e.g. the lead).
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatLabel,
  formatValue,
  footer,
}: {
  active?: boolean
  payload?: readonly PayloadItem[]
  label?: string | number
  formatLabel?: (label: string | number | undefined, row: Record<string, unknown> | undefined) => ReactNode
  formatValue?: (value: number) => string
  footer?: (row: Record<string, unknown>) => ReactNode
}) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  const rows = payload.filter((p) => typeof p.value === 'number')
  return (
    <div className="min-w-36 rounded-xl bg-surface px-3 py-2 text-sm shadow-lg ring-1 ring-stone-200">
      <div className="mb-1 text-xs font-semibold text-stone-500">{formatLabel ? formatLabel(label, row) : label}</div>
      <ul className="space-y-0.5">
        {rows.map((p) => (
          <li key={String(p.dataKey)} className="tabular flex items-center gap-2">
            <span className="h-0.5 w-3 rounded-full" style={{ background: p.stroke ?? p.fill ?? p.color }} aria-hidden />
            <span className="font-bold text-stone-900">
              {formatValue ? formatValue(p.value as number) : String(p.value)}
            </span>
            <span className="text-stone-500">{p.name}</span>
          </li>
        ))}
      </ul>
      {footer && row && <div className="mt-1 border-t border-stone-100 pt-1 text-xs text-stone-600">{footer(row)}</div>}
    </div>
  )
}

export function ChartCard({
  title,
  subtitle,
  children,
  legend,
  actions,
  height = 'h-56 sm:h-60',
  className = '',
}: {
  title: string
  subtitle?: string
  children: ReactNode
  legend?: { name: string; color: string }[]
  actions?: ReactNode
  height?: string
  className?: string
}) {
  return (
    <Card className={`p-4! ${className}`}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="font-bold leading-tight text-stone-800">{title}</h3>
          {subtitle && <p className="text-xs text-stone-500">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {legend && legend.length > 1 && <Legend items={legend} />}
          {actions}
        </div>
      </div>
      <div className={`w-full ${height}`}>{children}</div>
    </Card>
  )
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-600">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 rounded-full" style={{ background: item.color }} aria-hidden />
          {item.name}
        </li>
      ))}
    </ul>
  )
}
