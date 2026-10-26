import { kostkyModule } from './kostky'
import type { GameModule } from './types'

/** Implemented games. Game types without a module are shown as „Již brzy“. */
export const gameModules: Record<string, GameModule> = {
  kostky: kostkyModule,
}

export const DEFAULT_GAME_TYPE = 'kostky'
