import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Dialog } from '../../components/Dialog'
import { Button, ErrorText, SectionTitle, Spinner } from '../../components/ui'
import { loadStatsData, recordAzkvizQuestion, setPartieEnded, undoLastQuestion, type StatsData } from '../../lib/api'
import { formatNumber, joinNames } from '../../lib/format'
import type { Round, SessionPlayer } from '../../lib/types'
import type { SessionScreenProps } from '../types'
import {
  buildQuestions,
  createTapGuard,
  currentAndLastEpisode,
  currentStreak,
  episodeLabel,
  episodeScores,
  episodeWinners,
  inactivityMs,
  longestStreak,
  scoredCount,
  shareOfPoints,
  shareOfQuestions,
  splitEpisodes,
  undoMessage,
  withoutLast,
  type Question,
} from './logic'
import { averagePointsExcept, buildEpisodes } from './stats'
import { NOBODY_NOTE, questionsPhrase } from './text'

// Charts are heavy; the buttons render first.
const EpisodeProgressChart = lazy(() => import('./StatsView').then((m) => ({ default: m.EpisodeProgressChart })))
const AzkvizStatsView = lazy(() => import('./StatsView').then((m) => ({ default: m.AzkvizStatsView })))

const TEMP_PREFIX = 'pending-'
const NOBODY_KEY = 'nikdo'
const UNDO_KEY = 'zpet'
const TOAST_MS = 2500
const VIBRATE_MS = 25
const SAVE_ERROR = 'Nepodařilo se uložit, zkus to znovu'
/** `?pohled=statistiky` = „Průběžné statistiky“ (the phone's back button returns to entry). */
const STATS_PARAM = 'pohled'
const STATS_VALUE = 'statistiky'

export function AzkvizSessionScreen({ detail, showDraw, onDrawShown }: SessionScreenProps) {
  const sessionId = detail.session.id
  const players = detail.players
  const playerIds = useMemo(() => players.map((p) => p.id), [players])
  const breakMs = inactivityMs(detail.gameType.config)
  const [searchParams, setSearchParams] = useSearchParams()
  const showStats = searchParams.get(STATS_PARAM) === STATS_VALUE

  const [rounds, setRounds] = useState<Round[]>(detail.rounds)
  const [now, setNow] = useState(() => Date.now())
  // After „Nová epizoda“ (or a new game) the summary of the last episode is skipped.
  const [startNew, setStartNew] = useState(showDraw)
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null)
  const [pop, setPop] = useState<{ playerId: string; key: number } | null>(null)
  const [askEnd, setAskEnd] = useState(false)

  const guard = useRef(createTapGuard())
  // Writes run one after another, so an undo always follows the save it undoes.
  const queue = useRef<Promise<void>>(Promise.resolve())
  const failed = useRef(new Set<string>())
  const counter = useRef(0)

  // No turn order to draw in AZ-kvíz; just drop the `?los=1` flag.
  useEffect(() => {
    if (showDraw) onDrawShown()
    // Only once per opened game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Episode boundaries depend on the clock (3 h pause).
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const questions = useMemo(() => buildQuestions(rounds), [rounds])
  const { current, last } = useMemo(() => currentAndLastEpisode(questions, breakMs, now), [questions, breakMs, now])
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const name = (id: string) => byId.get(id)?.name ?? '?'
  const episodeStarts = useMemo(() => splitEpisodes(questions, breakMs).map((e) => e[0].createdAt), [questions, breakMs])

  const enqueue = useCallback((task: () => Promise<void>) => {
    setPending((n) => n + 1)
    queue.current = queue.current.then(task).finally(() => setPending((n) => n - 1))
  }, [])

  function record(winnerId: string | null) {
    if (!guard.current(winnerId ?? NOBODY_KEY)) return
    try {
      navigator.vibrate?.(VIBRATE_MS)
    } catch {
      // Haptics are optional.
    }
    counter.current += 1
    const tempId = `${TEMP_PREFIX}${counter.current}`
    const createdAt = new Date().toISOString()
    setRounds((prev) => [
      ...prev,
      {
        id: tempId,
        session_id: sessionId,
        round_no: prev.reduce((max, r) => Math.max(max, r.round_no), 0) + 1,
        winner_player_id: winnerId,
        dealer_player_id: null,
        jokers_kept: null,
        ends_partie: false,
        created_at: createdAt,
      },
    ])
    if (winnerId) setPop({ playerId: winnerId, key: counter.current })
    setNow(Date.now())
    setStartNew(true)
    setError(null)
    enqueue(async () => {
      try {
        const saved = await recordAzkvizQuestion(sessionId, winnerId)
        setRounds((prev) => prev.map((r) => (r.id === tempId ? saved.round : r)))
      } catch {
        failed.current.add(tempId)
        setRounds((prev) => prev.filter((r) => r.id !== tempId))
        setError(SAVE_ERROR)
      }
    })
  }

  function undo() {
    if (!guard.current(UNDO_KEY)) return
    const { removed } = withoutLast(current)
    const round = removed && rounds.find((r) => r.id === removed.roundId)
    if (!removed || !round) return
    setRounds((prev) => prev.filter((r) => r.id !== round.id))
    setToast({ text: undoMessage(removed.winnerId ? name(removed.winnerId) : null), key: Date.now() })
    setError(null)
    enqueue(async () => {
      // A question whose save failed is already gone from the DB.
      if (failed.current.has(round.id)) return
      try {
        await undoLastQuestion(sessionId)
      } catch {
        setRounds((prev) => [...prev, round].sort((a, b) => a.round_no - b.round_no))
        setToast(null)
        setError('Nepodařilo se vrátit, zkus to znovu')
      }
    })
  }

  /** „Konec epizody“ (ended = true) or „Pokračovat v epizodě“ (ended = false). */
  function markEnded(lastQuestion: Question | undefined, ended: boolean) {
    setAskEnd(false)
    if (!lastQuestion || pending > 0) return
    const update = (value: boolean) =>
      setRounds((prev) => prev.map((r) => (r.id === lastQuestion.roundId ? { ...r, ends_partie: value } : r)))
    update(ended)
    setStartNew(!ended)
    setNow(Date.now())
    setError(null)
    enqueue(async () => {
      try {
        await setPartieEnded(lastQuestion.roundId, ended)
      } catch {
        update(!ended)
        setStartNew(ended)
        setError(SAVE_ERROR)
      }
    })
  }

  const openStats = () => setSearchParams({ [STATS_PARAM]: STATS_VALUE })
  const closeStats = () => {
    // Opened from the entry screen → go back in history; opened directly → just switch.
    if (window.history.state?.idx > 0) window.history.back()
    else setSearchParams({}, { replace: true })
  }

  const stats = useGroupStats(detail, rounds)
  const lastQuestion = last[last.length - 1]
  const reopenable =
    current.length === 0 && Boolean(lastQuestion?.endsEpisode) && now - Date.parse(lastQuestion.createdAt) < breakMs
  const showSummary = current.length === 0 && last.length > 0 && !startNew
  const shown = current.length > 0 ? current : last

  const toastView = toast && (
    <div
      key={toast.key}
      className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
      role="status"
    >
      <span className="rounded-full bg-stone-900 px-5 py-3 text-base font-semibold text-white shadow-lg dark:bg-stone-800">
        {toast.text}
      </span>
    </div>
  )

  if (showStats) {
    return (
      <LiveStats
        players={players}
        episode={shown}
        live={current.length > 0}
        label={shown.length ? episodeLabel(shown[0].createdAt, episodeStarts) : null}
        stats={stats}
        onBack={closeStats}
      />
    )
  }

  if (showSummary) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <EpisodeSummary players={players} questions={last} label={episodeLabel(last[0].createdAt, episodeStarts)} />
        <ErrorText>{error}</ErrorText>
        <Button size="lg" className="w-full" onClick={() => setStartNew(true)}>
          Nová epizoda
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={openStats}>
            Průběžné statistiky
          </Button>
          <Button variant="secondary" onClick={() => markEnded(lastQuestion, false)} disabled={!reopenable || pending > 0}>
            Pokračovat v epizodě
          </Button>
        </div>
      </div>
    )
  }

  const scores = episodeScores(playerIds, current)
  const leaders = new Set(episodeWinners(playerIds, current))
  const few = players.length <= 4
  const columns =
    players.length === 4
      ? 'grid-cols-2'
      : few
        ? `grid-cols-1 ${players.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`
        : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
  const startedAt = current[0]?.createdAt ?? new Date(now).toISOString()

  return (
    <div
      className={`mx-auto flex max-w-4xl flex-col gap-3 ${few ? 'h-[calc(100dvh-7.5rem)] min-h-[26rem] sm:h-[calc(100dvh-9rem)]' : ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold sm:text-3xl">Otázka {current.length + 1}</h1>
          <p className="text-sm text-stone-500">Epizoda {episodeLabel(startedAt, [...episodeStarts, startedAt])}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="touch-manipulation"
          onClick={undo}
          disabled={current.length === 0}
          aria-label="Zpět – vrátit poslední otázku"
        >
          ↶ Zpět
        </Button>
      </div>

      <div className={`grid gap-2 sm:gap-3 ${columns} ${few ? 'min-h-0 flex-1 auto-rows-fr' : ''}`}>
        {players.map((p) => (
          <PlayerButton
            key={p.id}
            player={p}
            score={scores.get(p.id) ?? 0}
            leader={leaders.has(p.id)}
            popKey={pop?.playerId === p.id ? pop.key : null}
            tall={few}
            onTap={() => record(p.id)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => record(null)}
        className="w-full touch-manipulation rounded-2xl border-2 border-dashed border-stone-300 bg-stone-100 py-4 text-xl font-bold text-stone-600 active:bg-stone-200"
      >
        Nikdo
      </button>

      <ErrorText>{error}</ErrorText>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" className="touch-manipulation" onClick={openStats}>
          Průběžné statistiky
        </Button>
        <Button
          variant="ghost"
          className="touch-manipulation"
          onClick={() => setAskEnd(true)}
          disabled={current.length === 0 || pending > 0}
        >
          Konec epizody
        </Button>
      </div>

      {toastView}

      <Dialog open={askEnd} onClose={() => setAskEnd(false)} onEnter={() => markEnded(current[current.length - 1], true)}>
        <p className="mb-5 text-xl font-semibold">Ukončit epizodu?</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={() => setAskEnd(false)}>
            Zpět
          </Button>
          <Button size="lg" onClick={() => markEnded(current[current.length - 1], true)}>
            Ukončit
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function PlayerButton({
  player,
  score,
  leader,
  popKey,
  tall,
  onTap,
}: {
  player: SessionPlayer
  score: number
  leader: boolean
  popKey: number | null
  tall: boolean
  onTap: () => void
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className={`relative flex touch-manipulation select-none flex-col items-center justify-center overflow-hidden rounded-3xl bg-surface px-2 shadow-sm transition-transform active:scale-[0.98] active:bg-brand-50 ${
        tall ? 'min-h-24 py-3' : 'min-h-28 py-4'
      } ${leader ? 'ring-4 ring-brand-500' : 'ring-1 ring-stone-300'}`}
    >
      <span className="flex max-w-full items-center gap-1.5 text-xl font-bold sm:text-2xl">
        {leader && <span aria-label="vede">👑</span>}
        <span className="truncate">{player.name}</span>
      </span>
      <span className={`tabular font-extrabold leading-none ${tall ? 'text-6xl sm:text-7xl' : 'text-5xl'}`}>{score}</span>
      {popKey !== null && (
        <span
          key={popKey}
          className="score-pop pointer-events-none absolute right-4 top-3 text-3xl font-extrabold text-accent"
          aria-hidden
        >
          +1
        </span>
      )}
    </button>
  )
}

/** Result of a finished episode. */
function EpisodeSummary({ players, questions, label }: { players: SessionPlayer[]; questions: Question[]; label: string }) {
  const ids = players.map((p) => p.id)
  const scores = episodeScores(ids, questions)
  const winners = episodeWinners(ids, questions)
  const streak = longestStreak(questions)
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?'
  const sorted = [...players].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))

  return (
    <section className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-stone-200">
      <p className="text-sm text-stone-500">Epizoda {label}</p>
      <h1 className="mb-4 text-2xl font-extrabold">
        {winners.length === 0 ? (
          'Bez vítěze'
        ) : (
          <>
            {winners.length > 1 ? 'Vítězové epizody' : 'Vítěz epizody'}:{' '}
            <span className="text-accent">{joinNames(winners.map(name))}</span>
          </>
        )}
      </h1>
      <ul className="space-y-1">
        {sorted.map((p) => (
          <li key={p.id} className="flex items-baseline justify-between border-t border-stone-100 py-2 text-lg">
            <span className={winners.includes(p.id) ? 'font-bold' : 'font-medium'}>
              {winners.includes(p.id) && '🏆 '}
              {p.name}
            </span>
            <span className="tabular text-2xl font-extrabold">{scores.get(p.id) ?? 0}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-stone-600">
        {questionsPhrase(questions.length)}
        {streak && (
          <>
            {' '}
            · nejdelší série: <strong className="text-stone-900">{name(streak.playerId)}</strong> ({questionsPhrase(streak.length)})
          </>
        )}
      </p>
    </section>
  )
}

/** „Průběžné statistiky“ of the episode in progress (or the last one), then all episodes of the group. */
function LiveStats({
  players,
  episode,
  live,
  label,
  stats,
  onBack,
}: {
  players: SessionPlayer[]
  episode: Question[]
  live: boolean
  label: string | null
  stats: ReturnType<typeof useGroupStats>
  onBack: () => void
}) {
  const ids = players.map((p) => p.id)
  const scores = episodeScores(ids, episode)
  const streak = currentStreak(episode)
  const longest = longestStreak(episode)
  const nobody = episode.length - scoredCount(episode)
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?'
  const pct = (v: number | null) => (v === null ? '–' : `${formatNumber(v * 100)} %`)
  const sorted = [...players].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
  const episodeId = useMemo(() => {
    const first = episode[0]
    return stats.episodes?.find((e) => e.questions.some((q) => q.roundId === first?.roundId))?.id ?? null
  }, [stats.episodes, episode])

  const back = (
    <Button size="lg" className="w-full" onClick={onBack}>
      Zpět k zápisu
    </Button>
  )

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {back}
      <div>
        <h1 className="text-2xl font-extrabold">Průběžné statistiky</h1>
        {label && (
          <p className="text-sm text-stone-500">
            Epizoda {label}
            {!live && ' (ukončená)'}
          </p>
        )}
      </div>

      {episode.length === 0 ? (
        <p className="rounded-2xl bg-surface p-5 text-center text-stone-500 ring-1 ring-stone-200">Zatím žádná otázka</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-stone-200">
            <table className="tabular w-full text-right">
              <thead className="text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-3 pb-2 pt-3 text-left font-semibold">Hráč</th>
                  <th className="px-3 pb-2 pt-3 font-semibold">Body</th>
                  <th className="px-3 pb-2 pt-3 font-semibold">Podíl bodů</th>
                  <th className="px-3 pb-2 pt-3 font-semibold">Podíl otázek*</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const points = scores.get(p.id) ?? 0
                  return (
                    <tr key={p.id} className="border-t border-stone-100">
                      <td className="px-3 py-2.5 text-left text-lg font-bold">{p.name}</td>
                      <td className="px-3 py-2.5 text-2xl font-extrabold">{points}</td>
                      <td className="px-3 py-2.5">{pct(shareOfPoints(points, episode))}</td>
                      <td className="px-3 py-2.5">{pct(shareOfQuestions(points, episode))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="border-t border-stone-100 px-3 py-2 text-xs text-stone-500">
              Podíl bodů = z otázek, které někdo uhodl.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Tile
              label="Aktuální série"
              value={streak ? name(streak.playerId) : '–'}
              note={streak ? questionsPhrase(streak.length) : undefined}
            />
            <Tile
              label="Nejdelší série epizody"
              value={longest ? name(longest.playerId) : '–'}
              note={longest ? questionsPhrase(longest.length) : undefined}
            />
            <Tile label="Neuhodnuté otázky*" value={formatNumber(nobody)} note={`${questionsPhrase(episode.length)} celkem`} />
          </div>

          <ul className="rounded-2xl bg-surface p-4 text-lg shadow-sm ring-1 ring-stone-200">
            <li className="mb-1 text-xs font-semibold uppercase text-stone-500">Proti průměru dřívějších epizod</li>
            {players.map((p) => {
              const average = stats.episodes ? averagePointsExcept(stats.episodes, p.id, episodeId) : null
              return (
                <li key={p.id}>
                  <strong>{p.name}:</strong> {scores.get(p.id) ?? 0}
                  {average !== null && <span className="text-stone-500"> (průměr {formatNumber(average, 1)})</span>}
                </li>
              )
            })}
          </ul>

          <p className="text-xs text-stone-500">* {NOBODY_NOTE}</p>

          <Suspense fallback={<Spinner />}>
            <EpisodeProgressChart questions={episode} playerIds={stats.playerIds} names={stats.names} />
          </Suspense>
        </>
      )}

      <section className="space-y-4 pt-2">
        <SectionTitle className="mb-0!">Všechny epizody</SectionTitle>
        {stats.failed ? (
          <ErrorText>Statistiky se nepodařilo načíst.</ErrorText>
        ) : !stats.data ? (
          <Spinner />
        ) : (
          <Suspense fallback={<Spinner />}>
            <AzkvizStatsView data={stats.data} playerIds={stats.playerIds} names={stats.names} mode="group" />
          </Suspense>
        )}
      </section>

      {back}
    </div>
  )
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3 text-center shadow-sm ring-1 ring-stone-200">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="truncate text-xl font-extrabold">{value}</div>
      {note && <div className="text-xs text-stone-500">{note}</div>}
    </div>
  )
}

/** Statistics data of this game's players, updated live with every question. */
function useGroupStats(detail: SessionScreenProps['detail'], rounds: Round[]) {
  const sessionId = detail.session.id
  const [others, setOthers] = useState<StatsData | null>(null)
  const [failed, setFailed] = useState(false)

  // Other games of the same players (normally none — one endless game per group).
  useEffect(() => {
    loadStatsData(detail.gameType.id, detail.session.group_key, { withRounds: true })
      .then((data) =>
        setOthers({
          sessions: data.sessions.filter((s) => s.id !== sessionId),
          entries: [],
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
      entries: [],
      draws: [],
      rounds: [...(others.rounds ?? []), ...rounds.filter((r) => !r.id.startsWith(TEMP_PREFIX))],
    }
  }, [others, detail, sessionId, rounds])

  const breakMs = inactivityMs(detail.gameType.config)
  const episodes = useMemo(() => (data ? buildEpisodes(data, { breakMs }) : null), [data, breakMs])
  const names = useMemo(() => new Map(detail.players.map((p) => [p.id, p.name])), [detail.players])
  // Session order (as selected), so colors match the buttons.
  const playerIds = useMemo(() => detail.players.map((p) => p.id), [detail.players])

  return { data, episodes, failed, names, playerIds }
}
