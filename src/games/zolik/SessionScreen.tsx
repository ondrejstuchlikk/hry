import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Dialog } from '../../components/Dialog'
import { Button, ErrorText, SectionTitle, Spinner } from '../../components/ui'
import { deleteLastRound, loadStatsData, recordZolikHand, setPartieEnded, type StatsData } from '../../lib/api'
import { formatDate, formatNumber, joinNames } from '../../lib/format'
import type { Round, ScoredEntry, SessionPlayer } from '../../lib/types'
import { useMediaQuery } from '../../lib/useMediaQuery'
import type { SessionScreenProps } from '../types'
import {
  buildHands,
  clampJokers,
  currentAndLastPartie,
  DEFAULT_MAX_JOKERS,
  DEFAULT_MAX_WARNING,
  DEFAULT_MIN_LOSER_VALUE,
  drawDealer,
  handsWon,
  jokerReminder,
  jokersPhrase,
  loadStoredDealer,
  PARTIE_BREAK_MS,
  partieTotals,
  partieWinners,
  saveStoredDealer,
  splitPartie,
  storedDealerValid,
  validateLoserValue,
  worstLoss,
  type ZolikHand,
} from './logic'
import { ZolikScoreboard } from './Scoreboard'

// Charts are heavy; the entry panel renders first, the statistics follow.
const ZolikProgress = lazy(() => import('./StatsView').then((m) => ({ default: m.ZolikProgress })))
const ZolikSummary = lazy(() => import('./StatsView').then((m) => ({ default: m.ZolikSummary })))
const ZolikCharts = lazy(() => import('./StatsView').then((m) => ({ default: m.ZolikCharts })))

const TEMP_ID = 'pending'
const LOSER_ERROR = 'Proherce musí mít alespoň 1 bod'

type Step = 'winner' | 'jokers' | 'points'

interface Dealer {
  id: string
  /** Changes with every new draw; starts the animation. */
  drawKey: number
}

export function ZolikSessionScreen({ detail, showDraw, onDrawShown }: SessionScreenProps) {
  const sessionId = detail.session.id
  const players = detail.players
  const playerIds = useMemo(() => players.map((p) => p.id), [players])
  const config = detail.gameType.config
  const maxWarning = config.max_warning ?? DEFAULT_MAX_WARNING
  const maxJokers = config.max_jokers ?? DEFAULT_MAX_JOKERS
  const minLoser = config.min_loser_value ?? DEFAULT_MIN_LOSER_VALUE
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [rounds, setRounds] = useState<Round[]>(detail.rounds)
  const [entries, setEntries] = useState<ScoredEntry[]>(detail.entries)
  const [now, setNow] = useState(() => Date.now())

  // The hand being entered (client state only until it is complete).
  const [step, setStep] = useState<Step>('winner')
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [jokers, setJokers] = useState(0)
  const [values, setValues] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState<Record<string, number>>({})
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [warning, setWarning] = useState<{ index: number; value: number } | null>(null)
  const [ask, setAsk] = useState<'delete' | 'end' | null>(null)

  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dealer, setDealer] = useState<Dealer | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Partie boundaries depend on the clock (1 h pause).
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const hands = useMemo(() => buildHands(rounds, entries), [rounds, entries])
  const { current, last } = useMemo(() => currentAndLastPartie(hands, now), [hands, now])
  const lastRoundNo = rounds.reduce((max, r) => Math.max(max, r.round_no), 0)
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const name = (id: string | null | undefined) => (id ? (byId.get(id)?.name ?? '?') : '?')
  const losers = players.filter((p) => p.id !== winnerId)
  const reminder = jokerReminder(hands)
  const partial = step !== 'winner' || winnerId !== null

  const newDealer = useCallback(
    (afterRound: number) => {
      const id = drawDealer(playerIds)
      saveStoredDealer(sessionId, { dealerId: id, afterRound, drawnAt: new Date().toISOString() })
      setDealer({ id, drawKey: Date.now() })
    },
    [playerIds, sessionId],
  )

  const keepDealer = useCallback(
    (id: string, afterRound: number) => {
      saveStoredDealer(sessionId, { dealerId: id, afterRound, drawnAt: new Date().toISOString() })
      setDealer({ id, drawKey: 0 })
    },
    [sessionId],
  )

  // The dealer of the upcoming hand: reuse the stored draw after a reload, else draw now.
  // A new game (`?los=1`) has no stored draw, so it is drawn (and animated) here as well.
  useEffect(() => {
    if (showDraw) onDrawShown()
    const stored = loadStoredDealer(sessionId)
    const initial = buildHands(detail.rounds, detail.entries)
    const lastNo = detail.rounds.reduce((max, r) => Math.max(max, r.round_no), 0)
    const partieEmpty = currentAndLastPartie(initial).current.length === 0
    if (storedDealerValid(stored, { playerIds, lastRoundNo: lastNo, partieEmpty })) {
      setDealer({ id: stored.dealerId, drawKey: 0 })
    } else {
      newDealer(lastNo)
    }
    // Only once per opened game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const focusLoser = useCallback((index: number, select = false) => {
    requestAnimationFrame(() => {
      const input = inputRefs.current[index]
      input?.focus()
      if (select) input?.select()
    })
  }, [])

  function resetHand() {
    setStep('winner')
    setWinnerId(null)
    setJokers(0)
    setValues({})
    setConfirmed({})
    setFieldError(null)
    setWarning(null)
  }

  function pickWinner(id: string) {
    if (pending) return
    setError(null)
    setWinnerId(id)
    setJokers(0)
    setStep('jokers')
  }

  function confirmJokers() {
    setStep('points')
    focusLoser(0)
  }

  /** Enter / „Zapsat“ on loser `index`: validate it, then go to the next one or save. */
  function next(index: number, accepted: Record<string, number> = confirmed) {
    for (let i = 0; i < losers.length; i++) {
      // Inputs after the current one are only checked once the last one is submitted.
      if (i > index && index < losers.length - 1) break
      const id = losers[i].id
      const result = validateLoserValue(values[id] ?? '', { min: minLoser, maxWarning })
      if (!result.ok) {
        setFieldError(id)
        focusLoser(i, true)
        return
      }
      if (result.warn && accepted[id] !== result.value) {
        setWarning({ index: i, value: result.value })
        return
      }
    }
    setFieldError(null)
    if (index < losers.length - 1) {
      focusLoser(index + 1, true)
      return
    }
    const loserValues: Record<string, number> = {}
    for (const p of losers) loserValues[p.id] = Number(values[p.id].trim())
    save(loserValues)
  }

  async function save(loserValues: Record<string, number>) {
    if (!winnerId || !dealer || pending) return
    const hand = { dealerId: dealer.id, winnerId, jokersKept: clampJokers(jokers, maxJokers), loserValues }
    const before = { winnerId, jokers, values, confirmed, dealerId: dealer.id }
    const createdAt = new Date().toISOString()
    const roundNo = lastRoundNo + 1
    const seq = entries.reduce((max, e) => Math.max(max, e.seq), 0)

    // Optimistic: show the hand and move on to the next one right away.
    setRounds((prev) => [
      ...prev,
      {
        id: TEMP_ID,
        session_id: sessionId,
        round_no: roundNo,
        winner_player_id: winnerId,
        dealer_player_id: dealer.id,
        jokers_kept: hand.jokersKept,
        ends_partie: false,
        created_at: createdAt,
      },
    ])
    setEntries((prev) => [
      ...prev,
      ...players.map((p, i) => ({
        id: `${TEMP_ID}-${p.id}`,
        session_id: sessionId,
        player_id: p.id,
        round_no: roundNo,
        value: p.id === winnerId ? 0 : loserValues[p.id],
        seq: seq + i + 1,
        created_at: createdAt,
      })),
    ])
    setNow(Date.now())
    resetHand()
    setError(null)
    setPending(true)
    newDealer(roundNo)
    try {
      const saved = await recordZolikHand(sessionId, hand)
      setRounds((prev) => prev.map((r) => (r.id === TEMP_ID ? saved.round : r)))
      setEntries((prev) => [...prev.filter((e) => !e.id.startsWith(TEMP_ID)), ...saved.entries])
    } catch {
      setRounds((prev) => prev.filter((r) => r.id !== TEMP_ID))
      setEntries((prev) => prev.filter((e) => !e.id.startsWith(TEMP_ID)))
      setWinnerId(before.winnerId)
      setJokers(before.jokers)
      setValues(before.values)
      setConfirmed(before.confirmed)
      setStep('points')
      keepDealer(before.dealerId, roundNo - 1)
      setError('Nepodařilo se uložit, zkus to znovu')
      focusLoser(Math.max(0, players.filter((p) => p.id !== before.winnerId).length - 1), true)
    } finally {
      setPending(false)
    }
  }

  function back() {
    if (pending) return
    setError(null)
    if (step === 'points') {
      setFieldError(null)
      setStep('jokers')
    } else if (step === 'jokers') {
      setWinnerId(null)
      setStep('winner')
    } else if (rounds.length > 0) {
      setAsk('delete')
    }
  }

  async function deleteLast() {
    setAsk(null)
    const lastRound = rounds.find((r) => r.round_no === lastRoundNo)
    if (!lastRound || pending) return
    const removed = entries.filter((e) => e.round_no === lastRoundNo)
    setRounds((prev) => prev.filter((r) => r !== lastRound))
    setEntries((prev) => prev.filter((e) => e.round_no !== lastRoundNo))
    setPending(true)
    setError(null)
    try {
      await deleteLastRound(sessionId)
      // The deleted hand is replayed with its own dealer.
      if (lastRound.dealer_player_id && byId.has(lastRound.dealer_player_id)) {
        keepDealer(lastRound.dealer_player_id, lastRoundNo - 1)
      } else {
        newDealer(lastRoundNo - 1)
      }
    } catch {
      setRounds((prev) => [...prev, lastRound].sort((a, b) => a.round_no - b.round_no))
      setEntries((prev) => [...prev, ...removed].sort((a, b) => a.seq - b.seq))
      setError('Nepodařilo se smazat, zkus to znovu')
    } finally {
      setPending(false)
    }
  }

  /** „Pro dnešek konec“ (ended = true) or „Pokračovat v partii“ (ended = false). */
  async function markPartieEnd(ended: boolean) {
    setAsk(null)
    const lastRound = rounds.find((r) => r.round_no === lastRoundNo)
    if (!lastRound || pending) return
    if (ended) resetHand()
    const update = (value: boolean) =>
      setRounds((prev) => prev.map((r) => (r.id === lastRound.id ? { ...r, ends_partie: value } : r)))
    update(ended)
    setNow(Date.now())
    setPending(true)
    setError(null)
    try {
      await setPartieEnded(lastRound.id, ended)
    } catch {
      update(!ended)
      setError('Nepodařilo se uložit, zkus to znovu')
    } finally {
      setPending(false)
    }
  }

  function endPartie() {
    if (partial) setAsk('end')
    else markPartieEnd(true)
  }

  const keepFocus = (e: MouseEvent) => e.preventDefault()
  const handNo = current.length + 1

  const entryPanel = (
    <div className="rounded-3xl bg-surface p-4 shadow-sm ring-1 ring-stone-200 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <DealerBanner players={players} dealer={dealer} />
        <span className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-sm font-bold text-stone-600 sm:text-base">
          Kolo {handNo}
        </span>
      </div>

      {reminder && (
        <p
          className="mb-3 rounded-xl border-2 border-amber-700 bg-amber-50 px-3 py-2 text-lg font-bold text-amber-800"
          role="status"
        >
          🃏 {name(reminder.playerId)} má z minulého kola {jokersPhrase(reminder.count)}
        </p>
      )}

      {step === 'points' && winnerId ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
          }}
          className="space-y-3"
        >
          <p className="text-sm text-stone-600">
            Vyhrál/a: <strong className="text-stone-900">{name(winnerId)}</strong>
            {jokers > 0 && <> · žolíky do dalšího kola: <strong className="text-stone-900">{jokers}</strong></>}
          </p>
          {losers.map((p, i) => (
            <div key={p.id}>
              <label htmlFor={`loser-${p.id}`} className="mb-1 block text-sm font-semibold text-stone-600">
                Body: {p.name}
              </label>
              <input
                id={`loser-${p.id}`}
                ref={(el) => {
                  inputRefs.current[i] = el
                }}
                value={values[p.id] ?? ''}
                onChange={(e) => {
                  setValues((prev) => ({ ...prev, [p.id]: e.target.value }))
                  if (fieldError === p.id) setFieldError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (!e.repeat && !warning) next(i)
                  }
                }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint={i === losers.length - 1 ? 'done' : 'next'}
                autoComplete="off"
                aria-invalid={fieldError === p.id}
                className={`tabular w-full rounded-2xl border-2 bg-stone-50 px-4 py-2.5 text-center text-4xl font-bold outline-none focus:bg-surface ${
                  fieldError === p.id ? 'border-red-300' : 'border-stone-300 focus:border-brand-500'
                }`}
              />
              {fieldError === p.id && <ErrorText>{LOSER_ERROR}</ErrorText>}
            </div>
          ))}
          <ErrorText>{error}</ErrorText>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button
              size="lg"
              onMouseDown={keepFocus}
              disabled={pending}
              onClick={() => {
                const focused = inputRefs.current.findIndex((el) => el === document.activeElement)
                next(focused === -1 ? losers.length - 1 : focused)
              }}
            >
              Zapsat
            </Button>
            <Button variant="secondary" size="lg" onMouseDown={keepFocus} onClick={back}>
              Zpět
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <h2 className="text-xl font-extrabold sm:text-2xl">Kdo vyhrál?</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {players.map((p) => (
              <Button
                key={p.id}
                size="lg"
                variant="secondary"
                className="w-full py-5! text-xl"
                disabled={pending}
                onClick={() => pickWinner(p.id)}
              >
                {p.name}
              </Button>
            ))}
          </div>
          <ErrorText>{error}</ErrorText>
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="secondary" onClick={back} disabled={rounds.length === 0 || pending}>
              Zpět
            </Button>
            {current.length > 0 && (
              <Button variant="ghost" onClick={endPartie} disabled={pending}>
                Pro dnešek konec
              </Button>
            )}
          </div>
        </div>
      )}
      {step === 'points' && current.length > 0 && (
        <div className="mt-3 text-right">
          <Button variant="ghost" size="sm" onMouseDown={keepFocus} onClick={endPartie} disabled={pending}>
            Pro dnešek konec
          </Button>
        </div>
      )}
    </div>
  )

  const lastHand = last[last.length - 1]
  const reopenable =
    current.length === 0 && lastHand?.endsPartie && now - Date.parse(lastHand.createdAt) < PARTIE_BREAK_MS
  const stats = useGameStats(detail, rounds, entries)

  const side = <ScoreSummary players={players} hands={hands} current={current} />

  return (
    <div className="space-y-4">
      {isDesktop ? (
        <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-start gap-4">
          {entryPanel}
          {side}
        </div>
      ) : (
        <>
          {entryPanel}
          {side}
        </>
      )}

      {last.length > 0 && (
        <LastPartieCard
          players={players}
          hands={last}
          action={
            reopenable ? (
              <Button variant="secondary" size="sm" onClick={() => markPartieEnd(false)} disabled={pending}>
                Pokračovat v partii
              </Button>
            ) : null
          }
        />
      )}

      <section className="space-y-4">
        <SectionTitle className="mb-0!">Statistiky</SectionTitle>
        {stats.failed ? (
          <ErrorText>Statistiky se nepodařilo načíst.</ErrorText>
        ) : !stats.data ? (
          <Spinner />
        ) : (
          <Suspense fallback={<Spinner />}>
            <ZolikProgress data={stats.data} playerIds={stats.playerIds} names={stats.names} mode="group" />
            <ZolikSummary data={stats.data} playerIds={stats.playerIds} names={stats.names} mode="group" />
            <ZolikCharts data={stats.data} playerIds={stats.playerIds} names={stats.names} mode="group" />
          </Suspense>
        )}
      </section>

      <section>
        <SectionTitle>Tabulka kol</SectionTitle>
        <ZolikScoreboard players={players} hands={current} newestFirst={!isDesktop} />
      </section>

      <JokersDialog
        open={step === 'jokers'}
        value={jokers}
        max={maxJokers}
        onChange={(v) => setJokers(clampJokers(v, maxJokers))}
        onOk={confirmJokers}
        onBack={back}
      />

      <Dialog
        open={warning !== null}
        onClose={() => {
          if (warning) focusLoser(warning.index, true)
          setWarning(null)
        }}
        onEnter={() => {
          if (!warning) return
          const accepted = { ...confirmed, [losers[warning.index].id]: warning.value }
          setConfirmed(accepted)
          setWarning(null)
          next(warning.index, accepted)
        }}
      >
        <p className="mb-5 text-xl font-semibold">
          Opravdu {formatNumber(warning?.value ?? 0)}? To je víc než {formatNumber(maxWarning)}.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              if (warning) focusLoser(warning.index, true)
              setWarning(null)
            }}
          >
            Opravit
          </Button>
          <Button
            size="lg"
            onClick={() => {
              if (!warning) return
              const accepted = { ...confirmed, [losers[warning.index].id]: warning.value }
              setConfirmed(accepted)
              setWarning(null)
              next(warning.index, accepted)
            }}
          >
            Ano
          </Button>
        </div>
      </Dialog>

      <Dialog open={ask === 'delete'} onClose={() => setAsk(null)} onEnter={deleteLast}>
        <p className="mb-5 text-xl font-semibold">Smazat poslední kolo?</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={() => setAsk(null)}>
            Zrušit
          </Button>
          <Button variant="danger" size="lg" onClick={deleteLast}>
            Smazat
          </Button>
        </div>
      </Dialog>

      <Dialog open={ask === 'end'} onClose={() => setAsk(null)} onEnter={() => markPartieEnd(true)}>
        <p className="mb-5 text-xl font-semibold">Rozehrané kolo se neuloží. Ukončit?</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={() => setAsk(null)}>
            Zpět
          </Button>
          <Button size="lg" onClick={() => markPartieEnd(true)}>
            Ukončit
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

/** „Rozdává: <jméno>“; a new draw first cycles through the names and slows down. */
function DealerBanner({ players, dealer }: { players: SessionPlayer[]; dealer: Dealer | null }) {
  const [shown, setShown] = useState<string | null>(null)
  const [rolling, setRolling] = useState(false)

  useEffect(() => {
    if (!dealer) return
    if (dealer.drawKey === 0 || players.length < 2) {
      setShown(dealer.id)
      setRolling(false)
      return
    }
    const target = players.findIndex((p) => p.id === dealer.id)
    const steps = players.length * 2 + Math.max(0, target)
    let step = 0
    let timer: ReturnType<typeof setTimeout>
    setRolling(true)
    const tick = () => {
      step += 1
      setShown(players[step % players.length].id)
      if (step >= steps) {
        setShown(dealer.id)
        setRolling(false)
        return
      }
      const progress = step / steps
      timer = setTimeout(tick, 50 + progress * progress * 220)
    }
    tick()
    return () => clearTimeout(timer)
  }, [dealer, players])

  const shownName = players.find((p) => p.id === shown)?.name ?? '…'
  return (
    <h1 className="min-w-0 text-2xl font-extrabold sm:text-3xl" aria-live="polite">
      Rozdává:{' '}
      <span className={`inline-block transition-transform ${rolling ? 'text-stone-400' : 'scale-105 text-accent'}`}>
        {shownName}
      </span>
    </h1>
  )
}

function JokersDialog({
  open,
  value,
  max,
  onChange,
  onOk,
  onBack,
}: {
  open: boolean
  value: number
  max: number
  onChange: (value: number) => void
  onOk: () => void
  onBack: () => void
}) {
  // Keyboard: digits set the count, +/− and arrows change it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) onChange(Number(e.key))
      else if (e.key === '+' || e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(value + 1)
      else if (e.key === '-' || e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(value - 1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, value, onChange])

  return (
    <Dialog open={open} title="Počet žolíků do dalšího kola" onClose={onBack} onEnter={onOk}>
      <div className="flex items-center justify-center gap-4">
        <Button
          variant="secondary"
          size="lg"
          className="h-16 w-16 text-3xl"
          onClick={() => onChange(value - 1)}
          disabled={value <= 0}
          aria-label="Méně"
        >
          −
        </Button>
        <span className="tabular w-20 text-center text-6xl font-extrabold" aria-live="polite">
          {value}
        </span>
        <Button
          variant="secondary"
          size="lg"
          className="h-16 w-16 text-3xl"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          aria-label="Více"
        >
          +
        </Button>
      </div>
      <Button size="lg" className="mt-5 w-full" onClick={onOk} autoFocus>
        OK
      </Button>
      <div className="mt-3 text-center">
        <button type="button" className="text-sm font-semibold text-accent underline" onClick={onBack}>
          Zpět
        </button>
      </div>
    </Dialog>
  )
}

/**
 * Big score table: the partie in progress (points, hands won) next to the whole endless game
 * (points, hands won, partie won). 👑 marks the partie leader, the lowest game total is highlighted.
 */
function ScoreSummary({
  players,
  hands,
  current,
}: {
  players: SessionPlayer[]
  hands: ZolikHand[]
  current: ZolikHand[]
}) {
  const ids = players.map((p) => p.id)
  const partieTotal = partieTotals(ids, current)
  const partieWon = handsWon(ids, current)
  const partieLeaders = new Set(partieWinners(ids, current))
  const gameTotal = partieTotals(ids, hands)
  const gameWon = handsWon(ids, hands)
  const gameLeaders = new Set(partieWinners(ids, hands))
  // Only finished partie have a winner; the one in progress is the last split.
  const finished = splitPartie(hands).slice(0, current.length > 0 ? -1 : undefined)
  const partieWins = new Map(ids.map((id) => [id, 0]))
  for (const partie of finished) {
    for (const id of partieWinners(ids, partie)) partieWins.set(id, partieWins.get(id)! + 1)
  }
  const live = current.length > 0
  const dash = <span className="text-stone-400">–</span>

  const group = 'px-2 pt-3 text-center text-xs font-semibold uppercase tracking-wide sm:px-4 sm:text-sm'
  const sub = 'px-2 pb-2 pt-1 text-[11px] font-semibold uppercase text-stone-500 sm:px-4 sm:text-xs'
  const cell = 'px-2 py-3 sm:px-4 sm:py-4'

  return (
    <section className="overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-stone-200">
      <table className="tabular w-full text-right">
        <thead>
          <tr>
            <th rowSpan={2} className="px-3 pb-2 pt-3 text-left align-bottom text-xs font-semibold uppercase text-stone-500 sm:px-4 sm:text-sm">
              Hráč
            </th>
            <th colSpan={2} className={`${group} text-accent`}>
              Dnešní partie
            </th>
            <th colSpan={3} className={`${group} border-l border-stone-200 text-stone-600`}>
              Celá hra
            </th>
          </tr>
          <tr>
            <th className={sub}>Body</th>
            <th className={sub}>Kola</th>
            <th className={`${sub} border-l border-stone-200`}>Body</th>
            <th className={sub}>Kola</th>
            <th className={sub}>Partie</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id} className="border-t border-stone-100">
              <td className="px-3 py-3 text-left text-lg font-bold sm:px-4 sm:py-4 sm:text-2xl">
                {live && partieLeaders.has(p.id) && <span aria-label="vede partii">👑 </span>}
                {p.name}
              </td>
              <td className={`${cell} text-2xl font-extrabold sm:text-4xl`}>
                {live ? formatNumber(partieTotal.get(p.id) ?? 0) : dash}
              </td>
              <td className={`${cell} text-lg font-semibold sm:text-2xl`}>{live ? (partieWon.get(p.id) ?? 0) : dash}</td>
              <td
                className={`${cell} border-l border-stone-200 text-xl font-bold sm:text-3xl ${hands.length > 0 && gameLeaders.has(p.id) ? 'text-accent' : ''}`}
              >
                {formatNumber(gameTotal.get(p.id) ?? 0)}
              </td>
              <td className={`${cell} text-base sm:text-xl`}>{gameWon.get(p.id) ?? 0}</td>
              <td className={`${cell} text-base sm:text-xl`}>{partieWins.get(p.id) ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-stone-100 px-3 py-2 text-xs text-stone-500 sm:px-4">
        Kola = vyhraná kola, Partie = vyhrané partie. Méně bodů je lépe.
      </p>
    </section>
  )
}

/** Summary of the most recent finished partie. */
function LastPartieCard({
  players,
  hands,
  action,
}: {
  players: SessionPlayer[]
  hands: ZolikHand[]
  action: ReactNode
}) {
  const ids = players.map((p) => p.id)
  const totals = partieTotals(ids, hands)
  const won = handsWon(ids, hands)
  const winners = new Set(partieWinners(ids, hands))
  const worst = worstLoss(hands)
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?'
  const sorted = [...players].sort((a, b) => (totals.get(a.id) ?? 0) - (totals.get(b.id) ?? 0))

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-stone-200 sm:p-5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-stone-800">
          Poslední partie <span className="text-sm font-medium text-stone-500">{formatDate(hands[0].createdAt)}</span>
        </h2>
        {action}
      </div>
      <p className="mb-3 text-xl font-extrabold">
        {winners.size > 1 ? 'Vítězové partie' : 'Vítěz partie'}:{' '}
        <span className="text-accent">{joinNames([...winners].map(name))}</span>
      </p>
      <table className="tabular w-full text-right text-sm">
        <thead className="text-xs uppercase text-stone-500">
          <tr>
            <th className="py-1 text-left font-semibold">Hráč</th>
            <th className="py-1 font-semibold">Body</th>
            <th className="py-1 font-semibold">Vyhraná kola</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id} className="border-t border-stone-100">
              <td className={`py-1.5 text-left ${winners.has(p.id) ? 'font-bold' : 'font-medium'}`}>
                {winners.has(p.id) && '🏆 '}
                {p.name}
              </td>
              <td className="py-1.5 font-semibold">{formatNumber(totals.get(p.id) ?? 0)}</td>
              <td className="py-1.5">
                {won.get(p.id) ?? 0} z {hands.length}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {worst && (
        <p className="mt-3 text-sm text-stone-600">
          Nejhorší prohra partie: <strong className="text-stone-900">{formatNumber(worst.value)}</strong> ({name(worst.playerId)})
        </p>
      )}
    </section>
  )
}

/** Statistics data of this game's players, updated live with every hand. */
function useGameStats(detail: SessionScreenProps['detail'], rounds: Round[], entries: ScoredEntry[]) {
  const sessionId = detail.session.id
  const [others, setOthers] = useState<StatsData | null>(null)
  const [failed, setFailed] = useState(false)

  // Other games of the same players (normally none — one endless game per group).
  useEffect(() => {
    loadStatsData(detail.gameType.id, detail.session.group_key, { withRounds: true })
      .then((data) =>
        setOthers({
          sessions: data.sessions.filter((s) => s.id !== sessionId),
          entries: data.entries.filter((e) => e.session_id !== sessionId),
          draws: [],
          rounds: (data.rounds ?? []).filter((r) => r.session_id !== sessionId),
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
    return {
      sessions: [...others.sessions, own].sort((a, b) => a.started_at.localeCompare(b.started_at)),
      entries: [...others.entries, ...entries.filter((e) => !e.id.startsWith(TEMP_ID))],
      draws: [],
      rounds: [...(others.rounds ?? []), ...rounds.filter((r) => r.id !== TEMP_ID)],
    }
  }, [others, detail, sessionId, entries, rounds])

  const names = useMemo(() => new Map(detail.players.map((p) => [p.id, p.name])), [detail.players])
  // Stable order (by name) so colors stay the same.
  const playerIds = useMemo(
    () => [...detail.players].sort((a, b) => a.name.localeCompare(b.name, 'cs')).map((p) => p.id),
    [detail.players],
  )

  return { data, failed, names, playerIds }
}
