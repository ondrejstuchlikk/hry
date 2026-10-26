import { useCallback, useEffect, useState } from 'react'
import { getVisiblePlayers } from './api'
import type { Player } from './types'

/** All players visible to the user, plus an id → display name map. */
export function usePlayers() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    const list = await getVisiblePlayers()
    setPlayers(list)
    setLoaded(true)
  }, [])

  useEffect(() => {
    reload().catch(() => setLoaded(true))
  }, [reload])

  const names = new Map(players.map((p) => [p.id, p.display_name]))
  return { players, names, loaded, reload }
}
