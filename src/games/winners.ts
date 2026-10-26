import type { Scoring } from '../lib/types'

/** Players with the best total (all of them on a tie). Empty input → no winners. */
export function pickWinners(totals: Map<string, number>, scoring: Scoring): string[] {
  if (totals.size === 0) return []
  const values = [...totals.values()]
  const best = scoring === 'lower_better' ? Math.min(...values) : Math.max(...values)
  return [...totals].filter(([, total]) => total === best).map(([id]) => id)
}

/** Is `a` a better total than `b` under the given scoring? */
export function isBetter(a: number, b: number, scoring: Scoring): boolean {
  return scoring === 'lower_better' ? a < b : a > b
}
