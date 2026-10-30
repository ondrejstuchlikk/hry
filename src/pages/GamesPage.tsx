import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { NewSessionDialog } from '../components/NewSessionDialog'
import { Button, Card, EmptyState, errorMessage, ErrorText, SectionTitle, Spinner } from '../components/ui'
import { DEFAULT_GAME_TYPE, gameModules, sortGameTypes } from '../games'
import { getGameTypes, listSessions } from '../lib/api'
import { formatDate, formatTime, joinNames } from '../lib/format'
import type { GameType, SessionWithPlayers } from '../lib/types'
import { usePlayers } from '../lib/usePlayers'

const GAME_ICONS: Record<string, string> = { kostky: '🎲', zolik: '🃏', azkviz: '📺' }

export function GamesPage() {
  const navigate = useNavigate()
  const { names, reload: reloadPlayers } = usePlayers()
  const [gameTypes, setGameTypes] = useState<GameType[] | null>(null)
  const [gameTypeId, setGameTypeId] = useState(DEFAULT_GAME_TYPE)
  const [sessions, setSessions] = useState<SessionWithPlayers[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Game types load independently, so a failing session list never blocks „Nová hra“.
  useEffect(() => {
    getGameTypes()
      .then((types) => setGameTypes(sortGameTypes(types)))
      .catch((e) => {
        setGameTypes([])
        setError(errorMessage(e))
      })
  }, [])

  const load = useCallback(async () => {
    try {
      setSessions(await listSessions({ gameTypeId }))
    } catch (e) {
      setSessions([])
      setError(errorMessage(e))
    }
  }, [gameTypeId])

  useEffect(() => {
    load()
  }, [load])

  const gameType = gameTypes?.find((g) => g.id === gameTypeId)
  const playerNames = (s: SessionWithPlayers) => joinNames(s.players.map((p) => names.get(p.player_id) ?? '?'))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2 sm:max-w-xl sm:gap-3">
        {gameTypes?.map((g) => {
          const available = Boolean(gameModules[g.id])
          const selected = g.id === gameTypeId
          return (
            <button
              key={g.id}
              type="button"
              disabled={!available}
              onClick={() => setGameTypeId(g.id)}
              className={`rounded-2xl p-3 text-left ring-1 transition sm:p-4 ${
                selected
                  ? 'bg-brand-600 text-white shadow-md ring-brand-700'
                  : available
                    ? 'bg-surface ring-stone-200 hover:ring-brand-500'
                    : 'cursor-not-allowed bg-stone-50 text-stone-400 ring-stone-200'
              }`}
            >
              <div className="text-3xl" aria-hidden>
                {GAME_ICONS[g.id] ?? '🎮'}
              </div>
              <div className="mt-1 font-bold sm:text-lg">{g.name}</div>
              {!available && <div className="text-sm">Již brzy</div>}
            </button>
          )
        })}
      </div>

      <ErrorText>{error}</ErrorText>
      {gameTypes !== null && !gameType && (
        <ErrorText>
          V databázi chybí typy her. Spusť v Supabase (SQL Editor) soubor supabase/seed.sql a obnov stránku.
        </ErrorText>
      )}

      <Button size="lg" className="w-full sm:w-auto" disabled={!gameType} onClick={() => setDialogOpen(true)}>
        + Nová hra
      </Button>

      <section>
        <SectionTitle>Moje hry</SectionTitle>
        {sessions === null ? (
          <Spinner />
        ) : sessions.length === 0 ? (
          <Card>
            <EmptyState>Zatím žádné hry – začni tlačítkem „Nová hra“</EmptyState>
          </Card>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{playerNames(s)}</div>
                    <div className="text-sm text-stone-500">
                      Naposledy {formatDate(s.last_activity_at)} {formatTime(s.last_activity_at)}
                    </div>
                  </div>
                  <Button onClick={() => navigate(`/hra/${s.id}`)}>Pokračovat</Button>
                </Card>
              </li>
            ))}
          </ul>
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
