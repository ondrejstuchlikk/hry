import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { NewSessionDialog } from '../components/NewSessionDialog'
import { Button, Card, EmptyState, errorMessage, ErrorText, SectionTitle, Spinner } from '../components/ui'
import { DEFAULT_GAME_TYPE, gameModules } from '../games'
import { closeStaleSessions, getGameTypes, listSessions } from '../lib/api'
import { formatDate, formatTime, joinNames } from '../lib/format'
import type { GameType, SessionWithPlayers } from '../lib/types'
import { usePlayers } from '../lib/usePlayers'

const RECENT_LIMIT = 20

const GAME_ICONS: Record<string, string> = { kostky: '🎲', zolik: '🃏' }

export function GamesPage() {
  const navigate = useNavigate()
  const { names, reload: reloadPlayers } = usePlayers()
  const [gameTypes, setGameTypes] = useState<GameType[]>([])
  const [gameTypeId, setGameTypeId] = useState(DEFAULT_GAME_TYPE)
  const [active, setActive] = useState<SessionWithPlayers[] | null>(null)
  const [recent, setRecent] = useState<SessionWithPlayers[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      await closeStaleSessions()
      const [types, activeSessions, endedSessions] = await Promise.all([
        getGameTypes(),
        listSessions({ gameTypeId, status: 'active' }),
        listSessions({ gameTypeId, status: 'ended', limit: RECENT_LIMIT }),
      ])
      setGameTypes(types)
      setActive(activeSessions)
      setRecent(endedSessions)
      setError(null)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [gameTypeId])

  useEffect(() => {
    load()
  }, [load])

  const gameType = gameTypes.find((g) => g.id === gameTypeId)
  const playerNames = (s: SessionWithPlayers) => joinNames(s.players.map((p) => names.get(p.player_id) ?? '?'))
  const winnerNames = (s: SessionWithPlayers) =>
    s.winner_player_ids?.length ? joinNames(s.winner_player_ids.map((id) => names.get(id) ?? '?')) : '–'

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        {gameTypes.map((g) => {
          const available = Boolean(gameModules[g.id])
          const selected = g.id === gameTypeId
          return (
            <button
              key={g.id}
              type="button"
              disabled={!available}
              onClick={() => setGameTypeId(g.id)}
              className={`rounded-2xl p-4 text-left ring-1 transition ${
                selected
                  ? 'bg-brand-600 text-white shadow-md ring-brand-700'
                  : available
                    ? 'bg-white ring-stone-200 hover:ring-brand-500'
                    : 'cursor-not-allowed bg-stone-50 text-stone-400 ring-stone-200'
              }`}
            >
              <div className="text-3xl" aria-hidden>
                {GAME_ICONS[g.id] ?? '🎮'}
              </div>
              <div className="mt-1 text-lg font-bold">{g.name}</div>
              {!available && <div className="text-sm">Již brzy</div>}
            </button>
          )
        })}
      </div>

      <ErrorText>{error}</ErrorText>

      <Button size="lg" className="w-full sm:w-auto" disabled={!gameType} onClick={() => setDialogOpen(true)}>
        + Nová hra
      </Button>

      <section>
        <SectionTitle>Rozehrané hry</SectionTitle>
        {active === null ? (
          <Spinner />
        ) : active.length === 0 ? (
          <Card>
            <EmptyState>Žádná rozehraná hra</EmptyState>
          </Card>
        ) : (
          <ul className="space-y-2">
            {active.map((s) => (
              <li key={s.id}>
                <Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{playerNames(s)}</div>
                    <div className="text-sm text-stone-500">
                      Začátek {formatDate(s.started_at)} {formatTime(s.started_at)}
                    </div>
                  </div>
                  <Button onClick={() => navigate(`/hra/${s.id}`)}>Pokračovat</Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>Odehrané hry</SectionTitle>
        {active !== null && recent.length === 0 ? (
          <Card>
            <EmptyState>Zatím žádné odehrané hry</EmptyState>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
            <ul className="divide-y divide-stone-100">
              {recent.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/hra/${s.id}`}
                    className="grid grid-cols-[auto_1fr] gap-x-4 px-4 py-3 hover:bg-stone-50 sm:grid-cols-[7rem_1fr_auto]"
                  >
                    <span className="tabular text-sm text-stone-500 sm:text-base">{formatDate(s.started_at)}</span>
                    <span className="truncate font-medium">{playerNames(s)}</span>
                    <span className="col-span-2 text-sm text-stone-600 sm:col-span-1 sm:text-base">
                      🏆 {winnerNames(s)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {gameType && (
        <NewSessionDialog
          gameType={gameType}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onCreated={(id) => {
            setDialogOpen(false)
            reloadPlayers()
            navigate(`/hra/${id}?los=1`)
          }}
        />
      )}
    </div>
  )
}
