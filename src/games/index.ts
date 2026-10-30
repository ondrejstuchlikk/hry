import { azkvizModule } from './azkviz'
import { kostkyModule } from './kostky'
import type { GameModule } from './types'
import { zolikModule } from './zolik'

/** Implemented games, in display order. Game types without a module are shown as „Již brzy“. */
export const gameModules: Record<string, GameModule> = {
  kostky: kostkyModule,
  zolik: zolikModule,
  azkviz: azkvizModule,
}

export const DEFAULT_GAME_TYPE = 'kostky'

/** Implemented games in the order of gameModules, then the rest by id. */
export function sortGameTypes<T extends { id: string }>(types: T[]): T[] {
  const order = Object.keys(gameModules)
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length)
  return [...types].sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id))
}
