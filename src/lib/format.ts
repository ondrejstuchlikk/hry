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
