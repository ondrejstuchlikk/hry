import { useEffect, useMemo, useState } from 'react'
import { GameTypeSelect, selectClass } from '../components/GameTypeSelect'
import { Card, EmptyState, errorMessage, ErrorText, SectionTitle, Spinner } from '../components/ui'
import { DEFAULT_GAME_TYPE, gameModules } from '../games'
import { allPlayerIds } from '../games/kostky/stats'
import { loadStatsData, type StatsData } from '../lib/api'
import { useAuth } from '../lib/AuthProvider'
import { usePlayers } from '../lib/usePlayers'

export function OverallStatsPage() {
  const { player: me } = useAuth()
  const { names, loaded: namesLoaded } = usePlayers()
  const [gameTypeId, setGameTypeId] = useState(DEFAULT_GAME_TYPE)
  const [data, setData] = useState<StatsData | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    loadStatsData(gameTypeId)
      .then(setData)
      .catch((e) => setError(errorMessage(e)))
  }, [gameTypeId])

  const players = useMemo(() => (data ? allPlayerIds(data) : []), [data])
  const playerId = selectedId && players.includes(selectedId) ? selectedId : (me?.id ?? players[0])

  // Only sessions (and their entries) the selected player took part in.
  const playerData = useMemo<StatsData | null>(() => {
    if (!data || !playerId) return null
    const sessions = data.sessions.filter((s) => s.players.some((p) => p.player_id === playerId))
    const ids = new Set(sessions.map((s) => s.id))
    return {
      sessions,
      entries: data.entries.filter((e) => ids.has(e.session_id)),
      draws: data.draws.filter((d) => ids.has(d.session_id)),
    }
  }, [data, playerId])

  const module = gameModules[gameTypeId]
  const playerIdList = useMemo(() => (playerId ? [playerId] : []), [playerId])

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Celkové statistiky</h1>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-stone-600">Hráč</span>
          <select
            className={selectClass}
            value={playerId ?? ''}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={players.length === 0}
          >
            {(players.length ? players : me ? [me.id] : []).map((id) => (
              <option key={id} value={id}>
                {names.get(id) ?? '?'}
                {id === me?.id ? ' (já)' : ''}
              </option>
            ))}
          </select>
        </label>
        <GameTypeSelect value={gameTypeId} onChange={setGameTypeId} />
      </div>

      <ErrorText>{error}</ErrorText>
      {!data || !namesLoaded ? (
        <Spinner />
      ) : data.sessions.length === 0 || !playerData || !module ? (
        <Card>
          <EmptyState>Zatím žádné odehrané hry</EmptyState>
        </Card>
      ) : (
        <>
          <module.StatsView data={playerData} playerIds={playerIdList} names={names} mode="player" />
          <section>
            <SectionTitle>Srovnání hráčů</SectionTitle>
            <module.ComparisonTable data={data} playerIds={players} names={names} />
            <p className="mt-1 text-xs text-stone-500">Ze všech her, které vidíš (hry, kterých ses účastnil/a).</p>
          </section>
        </>
      )}
    </div>
  )
}
