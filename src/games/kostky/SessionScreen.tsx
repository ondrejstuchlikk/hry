import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { Dialog } from '../../components/Dialog'
import { DrawOverlay } from '../../components/DrawOverlay'
import { Button, ErrorText, SectionTitle, Spinner } from '../../components/ui'
import { addEntry, loadStatsData, redrawIfNewDay, undoLastEntry, type StatsData } from '../../lib/api'
import { formatNumber } from '../../lib/format'
import type { Draw, ScoredEntry, SessionPlayer } from '../../lib/types'
import { useMediaQuery } from '../../lib/useMediaQuery'
import type { SessionScreenProps } from '../types'
import { currentEvening } from './evenings'
import { liveStats, nextTurn, orderForRound, parseThrow, type DrawOrder } from './logic'
import { Scoreboard } from './Scoreboard'

// Charts are heavy; the entry panel renders first, the statistics follow.
const KostkyStatsView = lazy(() => import('./StatsView').then((m) => ({ default: m.KostkyStatsView })))

const DEFAULT_MAX_WARNING = 10000
const TEMP_ID = 'pending'

export function KostkySessionScreen({ detail, showDraw, onDrawShown }: SessionScreenProps) {
  const sessionId = detail.session.id
  const players = detail.players
  const maxWarning = detail.gameType.config.max_warning ?? DEFAULT_MAX_WARNING
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [entries, setEntries] = useState<ScoredEntry[]>(detail.entries)
  const [draws, setDraws] = useState<Draw[]>(detail.draws)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmValue, setConfirmValue] = useState<number | null>(null)
  // Turn order whose draw animation is shown.
  const [drawShown, setDrawShown] = useState<string[] | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const dialogOpen = confirmValue !== null || drawShown !== null
  const dialogOpenRef = useRef(dialogOpen)
  useEffect(() => {
    dialogOpenRef.current = dialogOpen
  }, [dialogOpen])

  // Games created before draws existed fall back to the original turn order.
  const drawOrders: DrawOrder[] = draws.length ? draws : [{ from_round: 1, player_ids: players.map((p) => p.id) }]
  const turn = nextTurn(drawOrders, entries)
  const roundOrder = orderForRound(drawOrders, turn.roundNo)
  const byId = new Map(players.map((p) => [p.id, p]))
  const current = byId.get(turn.playerId)!

  // New game: show the initial draw. Otherwise redraw on the first visit of a new day.
  useEffect(() => {
    if (showDraw && detail.entries.length === 0) {
      const latest = detail.draws[detail.draws.length - 1]
      setDrawShown(latest ? latest.player_ids : detail.players.map((p) => p.id))
      onDrawShown()
      return
    }
    let cancelled = false
    redrawIfNewDay(sessionId)
      .then((draw) => {
        if (cancelled || !draw) return
        setDraws((prev) =>
          [...prev.filter((d) => d.from_round !== draw.from_round), draw].sort((a, b) => a.from_round - b.from_round),
        )
        setDrawShown(draw.player_ids)
      })
      .catch(() => {
        // Keeping yesterday's order is harmless; the next visit tries again.
      })
    return () => {
      cancelled = true
    }
    // Only once per opened game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const focusInput = useCallback((select = false) => {
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      if (select) inputRef.current?.select()
    })
  }, [])

  useEffect(() => {
    if (!dialogOpen) focusInput()
  }, [dialogOpen, focusInput])

  async function save(value: number) {
    setConfirmValue(null)
    const t = nextTurn(drawOrders, entries)
    const optimistic: ScoredEntry = {
      id: TEMP_ID,
      session_id: sessionId,
      player_id: t.playerId,
      round_no: t.roundNo,
      value,
      seq: (entries[entries.length - 1]?.seq ?? 0) + 1,
      created_at: new Date().toISOString(),
    }
    setEntries((prev) => [...prev, optimistic])
    setInput('')
    setError(null)
    setPending(true)
    focusInput()
    try {
      const saved = await addEntry(sessionId, t.roundNo, t.playerId, value)
      setEntries((prev) => prev.map((e) => (e.id === TEMP_ID ? saved : e)))
    } catch {
      setEntries((prev) => prev.filter((e) => e.id !== TEMP_ID))
      setInput(String(value))
      setError('Nepodařilo se uložit, zkus to znovu')
      focusInput(true)
    } finally {
      setPending(false)
    }
  }

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (pending || dialogOpen) return
    // Empty input does nothing — it is not 0.
    if (input.trim() === '') return
    const value = parseThrow(input)
    if (value === null) {
      setError('Zadej celé číslo 0 nebo větší')
      focusInput(true)
      return
    }
    if (value > maxWarning) {
      setConfirmValue(value)
      return
    }
    save(value)
  }

  async function undo() {
    if (pending || entries.length === 0) return
    const last = entries[entries.length - 1]
    setEntries((prev) => prev.slice(0, -1))
    setError(null)
    setPending(true)
    try {
      await undoLastEntry(sessionId)
    } catch {
      setEntries((prev) => [...prev, last])
      setError('Nepodařilo se vrátit, zkus to znovu')
    } finally {
      setPending(false)
      focusInput()
    }
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && input === '') {
      e.preventDefault()
      undo()
    }
  }

  // Keep the input focused at all times (except while a dialog is open or another field is used).
  // preventScroll: looking at the charts below must not jump the page back up.
  function onInputBlur(e: FocusEvent<HTMLInputElement>) {
    const next = e.relatedTarget as HTMLElement | null
    if (next?.closest('input, select, textarea, a')) return
    setTimeout(() => {
      if (!dialogOpenRef.current && document.activeElement?.tagName !== 'INPUT') {
        inputRef.current?.focus({ preventScroll: true })
      }
    }, 0)
  }

  const keepFocus = (e: MouseEvent) => e.preventDefault()

  const entryPanel = (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200 sm:p-6">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h1 className="min-w-0 truncate text-2xl font-extrabold sm:text-4xl">
          Na řadě: <span className="text-brand-700">{current.name}</span>
        </h1>
        <span className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-sm font-bold text-stone-600 sm:text-base">
          Kolo {turn.roundNo}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {roundOrder.map((id) => (
          <span
            key={id}
            className={`rounded-full px-2.5 py-0.5 text-sm ${
              id === turn.playerId ? 'bg-brand-600 font-bold text-white' : 'bg-stone-100 text-stone-600'
            }`}
          >
            {byId.get(id)?.name ?? '?'}
          </span>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={onInputKeyDown}
          onBlur={onInputBlur}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="enter"
          autoComplete="off"
          autoFocus
          aria-label={`Hod hráče ${current.name}`}
          placeholder="0"
          className="tabular w-full rounded-2xl border-2 border-stone-300 bg-stone-50 px-4 py-4 text-center text-5xl font-bold outline-none placeholder:text-stone-300 focus:border-brand-500 focus:bg-white sm:text-6xl"
        />
        <ErrorText>{error}</ErrorText>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button type="submit" size="lg" onMouseDown={keepFocus} disabled={pending && input === ''}>
            Zapsat
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onMouseDown={keepFocus}
            onClick={undo}
            disabled={entries.length === 0 || pending}
            title="Ctrl+Z při prázdném poli"
          >
            Zpět
          </Button>
        </div>
      </form>
    </div>
  )

  return (
    <div className="space-y-6">
      {isDesktop ? (
        <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-start gap-6">
          {entryPanel}
          <LiveStats players={players} entries={entries} />
        </div>
      ) : (
        <div className="space-y-4">
          {entryPanel}
          <LiveStats players={players} entries={entries} />
        </div>
      )}

      <GameStats detail={detail} entries={entries} draws={draws} />

      <section>
        <SectionTitle>Tabulka hodů</SectionTitle>
        <Scoreboard players={players} entries={entries} turn={turn} newestFirst />
      </section>

      <Dialog
        open={confirmValue !== null}
        onClose={() => {
          setConfirmValue(null)
          focusInput(true)
        }}
        onEnter={() => confirmValue !== null && save(confirmValue)}
      >
        <p className="mb-5 text-xl font-semibold">
          Opravdu {formatNumber(confirmValue ?? 0)}? To je víc než {formatNumber(maxWarning)}.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              setConfirmValue(null)
              focusInput(true)
            }}
          >
            Opravit
          </Button>
          <Button size="lg" onClick={() => confirmValue !== null && save(confirmValue)}>
            Ano
          </Button>
        </div>
      </Dialog>

      {drawShown && <DrawAnimation order={drawShown} players={players} onDone={() => setDrawShown(null)} />}
    </div>
  )
}

/** Draw animation; names are alphabetical so the list does not reveal the order. */
function DrawAnimation({ order, players, onDone }: { order: string[]; players: SessionPlayer[]; onDone: () => void }) {
  const sorted = useMemo(() => [...players].sort((a, b) => a.name.localeCompare(b.name, 'cs')), [players])
  const starterIndex = Math.max(
    0,
    sorted.findIndex((p) => p.id === order[0]),
  )
  return <DrawOverlay names={sorted.map((p) => p.name)} starterIndex={starterIndex} onDone={onDone} />
}

/** Statistics of this game's players (all their games together), updated live with every throw. */
function GameStats({ detail, entries, draws }: { detail: SessionScreenProps['detail']; entries: ScoredEntry[]; draws: Draw[] }) {
  const sessionId = detail.session.id
  const [others, setOthers] = useState<StatsData | null>(null)
  const [failed, setFailed] = useState(false)

  // Other games of the same players (normally none — one endless game per group).
  useEffect(() => {
    loadStatsData(detail.gameType.id, detail.session.group_key)
      .then((data) =>
        setOthers({
          sessions: data.sessions.filter((s) => s.id !== sessionId),
          entries: data.entries.filter((e) => e.session_id !== sessionId),
          draws: data.draws.filter((d) => d.session_id !== sessionId),
        }),
      )
      .catch(() => setFailed(true))
  }, [detail.gameType.id, detail.session.group_key, sessionId])

  const data = useMemo<StatsData | null>(() => {
    if (!others) return null
    const own = {
      ...detail.session,
      players: detail.players.map((p) => ({ session_id: sessionId, player_id: p.id, turn_order: p.turnOrder })),
    }
    const saved = entries.filter((e) => e.id !== TEMP_ID)
    return {
      sessions: [...others.sessions, own].sort((a, b) => a.started_at.localeCompare(b.started_at)),
      entries: [...others.entries, ...saved],
      draws: [...others.draws, ...draws],
    }
  }, [others, detail, sessionId, entries, draws])

  const names = useMemo(() => new Map(detail.players.map((p) => [p.id, p.name])), [detail.players])
  // Stable order (by name) so colors stay the same.
  const playerIds = useMemo(
    () => [...detail.players].sort((a, b) => a.name.localeCompare(b.name, 'cs')).map((p) => p.id),
    [detail.players],
  )

  return (
    <section>
      <SectionTitle>Statistiky</SectionTitle>
      {failed ? (
        <ErrorText>Statistiky se nepodařilo načíst.</ErrorText>
      ) : !data ? (
        <Spinner />
      ) : (
        <Suspense fallback={<Spinner />}>
          <KostkyStatsView data={data} playerIds={playerIds} names={names} mode="group" />
        </Suspense>
      )}
    </section>
  )
}

/** Totals over the whole game, plus the evening in progress. */
function LiveStats({ players, entries }: { players: SessionPlayer[]; entries: ScoredEntry[] }) {
  const ids = players.map((p) => p.id)
  const overall = liveStats(ids, entries)
  const evening = liveStats(ids, currentEvening(entries))
  const avg = (v: number | null) => (v === null ? '–' : formatNumber(v, 0))
  return (
    <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-stone-200">
      <table className="tabular w-full text-right text-sm">
        <thead className="text-xs uppercase text-stone-500">
          <tr>
            <th rowSpan={2} className="px-3 pt-2 text-left align-bottom font-semibold">
              Hráč
            </th>
            <th colSpan={2} className="border-b border-stone-100 px-3 pt-2 text-center font-semibold">
              Celkem
            </th>
            <th colSpan={3} className="border-b border-stone-100 px-3 pt-2 text-center font-semibold">
              Dnešní večer
            </th>
          </tr>
          <tr>
            <th className="px-3 py-1 font-semibold">Součet</th>
            <th className="px-3 py-1 font-semibold">Ø hod</th>
            <th className="px-3 py-1 font-semibold">Součet</th>
            <th className="px-3 py-1 font-semibold">Ø hod</th>
            <th className="px-3 py-1 font-semibold">Nuly</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const o = overall.get(p.id)!
            const ev = evening.get(p.id)!
            return (
              <tr key={p.id} className="border-t border-stone-100">
                <td className="px-3 py-1.5 text-left font-medium">{p.name}</td>
                <td className="px-3 py-1.5 font-semibold">{formatNumber(o.total)}</td>
                <td className="px-3 py-1.5">{avg(o.average)}</td>
                <td className="px-3 py-1.5 font-semibold">{formatNumber(ev.total)}</td>
                <td className="px-3 py-1.5">{avg(ev.average)}</td>
                <td className="px-3 py-1.5">{ev.zeros}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
