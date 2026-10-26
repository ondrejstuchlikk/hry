import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { Dialog } from '../../components/Dialog'
import { Button, ErrorText } from '../../components/ui'
import { addEntry, endSession, undoLastEntry } from '../../lib/api'
import { formatNumber } from '../../lib/format'
import type { ScoredEntry } from '../../lib/types'
import { useMediaQuery } from '../../lib/useMediaQuery'
import type { SessionScreenProps } from '../types'
import { isRoundInProgress, liveStats, nextTurn, parseThrow } from './logic'
import { Scoreboard } from './Scoreboard'

const DEFAULT_MAX_WARNING = 10000
const TEMP_ID = 'pending'

type EndDialog = null | 'incomplete' | 'confirm'

export function KostkySessionScreen({ detail, onEnded }: SessionScreenProps) {
  const sessionId = detail.session.id
  const players = detail.players
  const order = players.map((p) => p.id)
  const maxWarning = detail.gameType.config.max_warning ?? DEFAULT_MAX_WARNING
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [entries, setEntries] = useState<ScoredEntry[]>(detail.entries)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmValue, setConfirmValue] = useState<number | null>(null)
  const [endDialog, setEndDialog] = useState<EndDialog>(null)
  const [ending, setEnding] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const dialogOpen = confirmValue !== null || endDialog !== null
  const dialogOpenRef = useRef(dialogOpen)
  useEffect(() => {
    dialogOpenRef.current = dialogOpen
  }, [dialogOpen])

  const turn = nextTurn(order, entries)
  const current = players.find((p) => p.id === turn.playerId)!
  const stats = liveStats(order, entries)

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
    const t = nextTurn(order, entries)
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
      if (!saved) {
        // The session was idle for over an hour and got closed instead.
        setEntries((prev) => prev.filter((e) => e.id !== TEMP_ID))
        onEnded()
        return
      }
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
      // Nothing deleted (e.g. the session was closed meanwhile) → reload from the DB.
      if (!(await undoLastEntry(sessionId))) onEnded()
    } catch {
      setEntries((prev) => [...prev, last])
      setError('Nepodařilo se vrátit, zkus to znovu')
    } finally {
      setPending(false)
      focusInput()
    }
  }

  async function end() {
    if (ending || pending) return
    setEnding(true)
    try {
      await endSession(sessionId)
      setEndDialog(null)
      onEnded()
    } catch {
      setError('Nepodařilo se ukončit hru, zkus to znovu')
      setEndDialog(null)
    } finally {
      setEnding(false)
    }
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && input === '') {
      e.preventDefault()
      undo()
    }
  }

  // Keep the input focused at all times (except while a dialog is open or another field is used).
  function onInputBlur(e: FocusEvent<HTMLInputElement>) {
    const next = e.relatedTarget as HTMLElement | null
    if (next?.closest('input, select, textarea, a')) return
    setTimeout(() => {
      if (!dialogOpenRef.current && document.activeElement?.tagName !== 'INPUT') inputRef.current?.focus()
    }, 0)
  }

  const keepFocus = (e: MouseEvent) => e.preventDefault()

  const entryPanel = (
    <div className="space-y-4">
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
          {players.map((p) => (
            <span
              key={p.id}
              className={`rounded-full px-2.5 py-0.5 text-sm ${
                p.id === turn.playerId ? 'bg-brand-600 font-bold text-white' : 'bg-stone-100 text-stone-600'
              }`}
            >
              {p.name}
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

      <LiveStats players={players} stats={stats} />

      <div className="flex justify-end">
        <Button variant="danger" onClick={() => setEndDialog(isRoundInProgress(order, entries) ? 'incomplete' : 'confirm')}>
          Pro dnešek konec
        </Button>
      </div>
    </div>
  )

  return (
    <>
      {isDesktop ? (
        <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-start gap-6">
          {entryPanel}
          <Scoreboard players={players} entries={entries} turn={turn} />
        </div>
      ) : (
        <div className="space-y-4">
          {entryPanel}
          <Scoreboard players={players} entries={entries} turn={turn} newestFirst />
        </div>
      )}

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

      <Dialog open={endDialog === 'incomplete'} onClose={() => setEndDialog(null)}>
        <p className="mb-5 text-lg">
          Kolo ještě není dohrané. Poslední nedokončené kolo se do výsledku nezapočítá.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={() => setEndDialog(null)}>
            Dohrát kolo
          </Button>
          <Button variant="danger" size="lg" onClick={end} disabled={ending}>
            Ukončit
          </Button>
        </div>
      </Dialog>

      <Dialog open={endDialog === 'confirm'} onClose={() => setEndDialog(null)}>
        <p className="mb-5 text-lg">Ukončit dnešní hru?</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={() => setEndDialog(null)}>
            Hrát dál
          </Button>
          <Button variant="danger" size="lg" onClick={end} disabled={ending}>
            Ukončit
          </Button>
        </div>
      </Dialog>
    </>
  )
}

function LiveStats({
  players,
  stats,
}: {
  players: SessionScreenProps['detail']['players']
  stats: ReturnType<typeof liveStats>
}) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-stone-200">
      <table className="tabular w-full text-right text-sm">
        <thead className="text-xs uppercase text-stone-500">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Hráč</th>
            <th className="px-3 py-2 font-semibold">Součet</th>
            <th className="px-3 py-2 font-semibold">Průměr na hod</th>
            <th className="px-3 py-2 font-semibold">Nuly</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const s = stats.get(p.id)!
            return (
              <tr key={p.id} className="border-t border-stone-100">
                <td className="px-3 py-1.5 text-left font-medium">{p.name}</td>
                <td className="px-3 py-1.5 font-semibold">{formatNumber(s.total)}</td>
                <td className="px-3 py-1.5">{s.average === null ? '–' : formatNumber(s.average, 0)}</td>
                <td className="px-3 py-1.5">{s.zeros}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
