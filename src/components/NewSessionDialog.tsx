import { useEffect, useState, type FormEvent } from 'react'
import { createGuest, createSession, searchAccountPlayers } from '../lib/api'
import { useAuth } from '../lib/AuthProvider'
import type { GameType, Player } from '../lib/types'
import { usePlayers } from '../lib/usePlayers'
import { Dialog } from './Dialog'
import { Button, errorMessage, ErrorText } from './ui'

const MIN_PLAYERS = 2

export function NewSessionDialog({
  gameType,
  open,
  onClose,
  onCreated,
}: {
  gameType: GameType
  open: boolean
  onClose: () => void
  onCreated: (sessionId: string) => void
}) {
  const { player: me, profile } = useAuth()
  const { players: visible, reload } = usePlayers()
  const [selected, setSelected] = useState<Player[]>(me ? [me] : [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setSelected(me ? [me] : [])
      setError(null)
    }
  }, [open, me])

  const isSelected = (id: string) => selected.some((p) => p.id === id)
  const add = (p: Player) => {
    if (!isSelected(p.id)) setSelected((prev) => [...prev, p])
  }

  async function start() {
    if (selected.length < MIN_PLAYERS) return
    setBusy(true)
    setError(null)
    try {
      const id = await createSession(
        gameType.id,
        selected.map((p) => p.id),
      )
      onCreated(id)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  // Guests: own ones first, then guests met in shared sessions.
  const guests = visible
    .filter((p) => p.user_id === null && !isSelected(p.id))
    .sort((a, b) => Number(b.created_by === profile?.id) - Number(a.created_by === profile?.id))

  return (
    <Dialog open={open} onClose={onClose} title={`Nová hra – ${gameType.name}`} wide>
      <div className="space-y-5">
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase text-stone-500">Hráči ({selected.length})</h3>
          <ul className="flex flex-wrap gap-2">
            {selected.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-3 pr-1 font-medium text-brand-800 ring-1 ring-brand-100"
              >
                {p.display_name}
                {p.user_id === null && <span className="text-xs text-brand-600">(host)</span>}
                {p.id !== me?.id ? (
                  <button
                    type="button"
                    className="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-brand-700 hover:bg-brand-100"
                    onClick={() => setSelected((prev) => prev.filter((x) => x.id !== p.id))}
                    aria-label={`Odebrat ${p.display_name}`}
                  >
                    ×
                  </button>
                ) : (
                  <span className="w-2" />
                )}
              </li>
            ))}
          </ul>
        </div>

        <UserSearch onPick={add} isSelected={isSelected} />

        <GuestPicker
          guests={guests}
          onPick={add}
          onCreate={async (name) => {
            const existing = guests.find(
              (g) => g.created_by === profile?.id && g.display_name.toLowerCase() === name.trim().toLowerCase(),
            )
            if (existing) return add(existing)
            if (!profile) return
            const guest = await createGuest(name, profile.id)
            add(guest)
            reload()
          }}
        />

        <ErrorText>{error}</ErrorText>
        {selected.length < MIN_PLAYERS && <p className="text-sm text-stone-500">Přidej aspoň jednoho dalšího hráče.</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={onClose}>
            Zrušit
          </Button>
          <Button size="lg" onClick={start} disabled={busy || selected.length < MIN_PLAYERS}>
            Začít hru
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

const fieldClass =
  'w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

function UserSearch({ onPick, isSelected }: { onPick: (p: Player) => void; isSelected: (id: string) => boolean }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<(Player & { username: string })[]>([])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const found = await searchAccountPlayers(query)
        if (!cancelled) setResults(found)
      } catch {
        if (!cancelled) setResults([])
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const visibleResults = results.filter((r) => !isSelected(r.id))

  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-stone-600" htmlFor="user-search">
        Přidat hráče podle jména
      </label>
      <div className="relative">
        <input
          id="user-search"
          className={fieldClass}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && visibleResults[0]) {
              e.preventDefault()
              onPick(visibleResults[0])
              setQuery('')
            }
          }}
          placeholder="uživatelské jméno"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        {query.trim() && (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-stone-200">
            {visibleResults.length === 0 ? (
              <li className="px-3 py-2 text-sm text-stone-500">Nikdo takový</li>
            ) : (
              visibleResults.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-stone-50"
                    onClick={() => {
                      onPick(r)
                      setQuery('')
                    }}
                  >
                    <span className="font-medium">{r.display_name}</span>
                    {r.display_name !== r.username && <span className="text-sm text-stone-500">@{r.username}</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  )
}

function GuestPicker({
  guests,
  onPick,
  onCreate,
}: {
  guests: Player[]
  onPick: (p: Player) => void
  onCreate: (name: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    if (trimmed.length > 40) {
      setError('Jméno může mít nejvýš 40 znaků')
      return
    }
    try {
      await onCreate(trimmed)
      setName('')
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-semibold text-stone-600">Přidat hosta</span>
      <div className="space-y-2">
        {guests.length > 0 && (
          <select
            className={fieldClass}
            value=""
            onChange={(e) => {
              const guest = guests.find((g) => g.id === e.target.value)
              if (guest) onPick(guest)
            }}
            aria-label="Vybrat dřívějšího hosta"
          >
            <option value="">Vybrat dřívějšího hosta…</option>
            {guests.map((g) => (
              <option key={g.id} value={g.id}>
                {g.display_name}
              </option>
            ))}
          </select>
        )}
        <form onSubmit={submit} className="flex gap-2">
          <input
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jméno nového hosta"
            maxLength={40}
          />
          <Button type="submit" variant="secondary" disabled={!name.trim()} className="shrink-0">
            Přidat hosta
          </Button>
        </form>
        <ErrorText>{error}</ErrorText>
      </div>
    </div>
  )
}
