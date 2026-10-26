import type { ReactNode } from 'react'
import { Card } from './ui'

/**
 * Categorical series colors in fixed order (validated CVD-safe palette).
 * A player's color comes from their position in the page's stable player list.
 */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length]
}

export const AXIS_PROPS = {
  stroke: '#a8a29e',
  tick: { fill: '#57534e', fontSize: 12 },
  tickLine: false,
} as const

export const GRID_PROPS = { stroke: '#e7e5e4', vertical: false } as const

export const TOOLTIP_PROPS = {
  contentStyle: { borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 13 },
  labelStyle: { fontWeight: 600, color: '#1c1917' },
} as const

export function ChartCard({
  title,
  children,
  legend,
  actions,
}: {
  title: string
  children: ReactNode
  legend?: { name: string; color: string }[]
  actions?: ReactNode
}) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-stone-800">{title}</h3>
        {actions}
      </div>
      {legend && legend.length > 1 && <Legend items={legend} />}
      <div className="h-64 w-full sm:h-72">{children}</div>
    </Card>
  )
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-700">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} aria-hidden />
          {item.name}
        </li>
      ))}
    </ul>
  )
}
