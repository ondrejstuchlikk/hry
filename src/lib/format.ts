const LOCALE = 'cs-CZ'

export function formatNumber(value: number, maxFractionDigits = 0): string {
  return value.toLocaleString(LOCALE, { maximumFractionDigits: maxFractionDigits })
}

export function formatPercent(ratio: number): string {
  return `${formatNumber(ratio * 100)} %`
}

/** d. M. yyyy */
export function formatDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`
}

/** d. M. */
export function formatShortDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${d.getDate()}. ${d.getMonth() + 1}.`
}

export function formatTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(iso: string | Date): string {
  return `${formatDate(iso)} ${formatTime(iso)}`
}

/** „Ondra & Rob“ / „Ondra, Rob & Děda“ */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

/** Compact axis numbers: „950“, „12 tis.“, „1,2 mil.“ */
export function formatCompact(value: number): string {
  return value.toLocaleString(LOCALE, { notation: 'compact', maximumFractionDigits: 1 })
}

/** Signed number with a real minus: „+1 200“, „−350“. */
export function formatSigned(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatNumber(Math.abs(value))}`
}
