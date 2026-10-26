import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { GameTypeSelect, selectClass } from '../components/GameTypeSelect'
import { Card, EmptyState, errorMessage, ErrorText, Spinner } from '../components/ui'
import { DEFAULT_GAME_TYPE, gameModules } from '../games'
import { listSessions, loadStatsData, type StatsData } from '../lib/api'
import { joinNames } from '../lib/format'
import type { SessionWithPlayers } from '../lib/types'
import { usePlayers } from '../lib/usePlayers'

interface Group {
  key: string
  playerIds: string[]
  lastPlayed: string
}

/** Groups (exact player sets) the user has played in, most recently played first. */
function groupsOf(sessions: SessionWithPlayers[]): Group[] {
  const groups = new Map<string, Group>()
  for (const s of sessions) {
    const g = groups.get(s.group_key)
    if (!g) {
      groups.set(s.group_key, { key: s.group_key, playerIds: s.players.map((p) => p.player_id), lastPlayed: s.started_at })
    } else if (s.started_at > g.lastPlayed) {
      g.lastPlayed = s.started_at
    }
  }
  return [...groups.values()].sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed))
}

export function StatsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { names, loaded: namesLoaded } = usePlayers()
  const [gameTypeId, setGameTypeId] = useState(DEFAULT_GAME_TYPE)
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [data, setData] = useState<StatsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setGroups(null)
    listSessions({ gameTypeId })
      .then((sessions) => setGroups(groupsOf(sessions)))
      .catch((e) => setError(errorMessage(e)))
  }, [gameTypeId])

  const requested = searchParams.get('skupina')
  const groupKey = groups?.some((g) => g.key === requested) ? requested! : groups?.[0]?.key
  const group = groups?.find((g) => g.key === groupKey)

  useEffect(() => {
    if (!groupKey) return
    setData(null)
    loadStatsData(gameTypeId, groupKey)
      .then(setData)
      .catch((e) => setError(errorMessage(e)))
  }, [gameTypeId, groupKey])

  const label = (g: Group) => joinNames(g.playerIds.map((id) => names.get(id) ?? '?').sort((a, b) => a.localeCompare(b, 'cs')))
  // Stable order (by name) so colors stay the same for a group.
  const playerIds = useMemo(
    () => [...(group?.playerIds ?? [])].sort((a, b) => (names.get(a) ?? '').localeCompare(names.get(b) ?? '', 'cs')),
    [group, names],
  )

  const module = gameModules[gameTypeId]

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Statistiky</h1>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-stone-600">Skupina</span>
          <select
            className={selectClass}
            value={groupKey ?? ''}
            onChange={(e) => setSearchParams({ skupina: e.target.value }, { replace: true })}
            disabled={!groups?.length}
          >
            {groups?.map((g) => (
              <option key={g.key} value={g.key}>
                {label(g)}
              </option>
            ))}
          </select>
        </label>
        <GameTypeSelect
          value={gameTypeId}
          onChange={(id) => {
            setGameTypeId(id)
            setSearchParams({}, { replace: true })
          }}
        />
      </div>

      <ErrorText>{error}</ErrorText>
      {groups === null || !namesLoaded ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState>Zatím žádné odehrané hry</EmptyState>
        </Card>
      ) : !data ? (
        <Spinner />
      ) : (
        module && <module.StatsView data={data} playerIds={playerIds} names={names} mode="group" />
      )}
    </div>
  )
}
