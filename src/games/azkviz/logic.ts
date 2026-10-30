// AZ-kvíz rules: each question („otázka“) is won by the player who answered first (1 point)
// or by nobody („Nikdo“). Most points wins the episode; ties give several winners and an
// episode without points has no winner.
// The game is endless; an „epizoda“ ends after a pause of ≥ inactivity_minutes between
// questions or after a question marked ends_partie („Konec epizody“).
import type { GameConfig, Round } from '../../lib/types'
import { formatDate, formatTime } from '../../lib/format'
import { pickWinners } from '../winners'

/** Pause that ends an episode when game_types.config has no inactivity_minutes. */
export const DEFAULT_INACTIVITY_MINUTES = 60
/** AZ-kvíz's own pause (seeded config); used where the config is not at hand (statistics). */
export const EPISODE_BREAK_MS = 180 * 60 * 1000
/** A second tap on the same button within this window is ignored. */
export const DOUBLE_TAP_MS = 400

export function inactivityMs(config: Pick<GameConfig, 'inactivity_minutes'> | null | undefined): number {
  return (config?.inactivity_minutes ?? DEFAULT_INACTIVITY_MINUTES) * 60 * 1000
}

export interface Question {
  roundId: string
  sessionId: string
  roundNo: number
  createdAt: string
  /** null = „Nikdo“ */
  winnerId: string | null
  endsEpisode: boolean
}

type QuestionRound = Pick<Round, 'id' | 'session_id' | 'round_no' | 'created_at' | 'winner_player_id' | 'ends_partie'>

/** Questions from rounds, chronologically (by time, then round number). */
export function buildQuestions(rounds: QuestionRound[]): Question[] {
  return rounds
    .map((r) => ({
      roundId: r.id,
      sessionId: r.session_id,
      roundNo: r.round_no,
      createdAt: r.created_at,
      winnerId: r.winner_player_id,
      endsEpisode: r.ends_partie,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.roundNo - b.roundNo)
}

// ---------------------------------------------------------------------------
// Episodes
// ---------------------------------------------------------------------------

type EpisodeQuestion = Pick<Question, 'createdAt' | 'endsEpisode'>

/** Splits chronological questions into episodes: a long pause or an ended episode starts a new one. */
export function splitEpisodes<T extends EpisodeQuestion>(questions: T[], breakMs: number): T[][] {
  const result: T[][] = []
  let previous: T | null = null
  for (const q of questions) {
    if (previous === null || previous.endsEpisode || Date.parse(q.createdAt) - Date.parse(previous.createdAt) >= breakMs) {
      result.push([])
    }
    result[result.length - 1].push(q)
    previous = q
  }
  return result
}

/** Is an episode with these questions still going on (the next question would belong to it)? */
export function isEpisodeOpen(questions: EpisodeQuestion[], breakMs: number, now = Date.now()): boolean {
  const last = questions[questions.length - 1]
  return Boolean(last) && !last.endsEpisode && now - Date.parse(last.createdAt) < breakMs
}

/** Questions of the episode in progress, and the last finished episode (both may be empty). */
export function currentAndLastEpisode<T extends EpisodeQuestion>(
  questions: T[],
  breakMs: number,
  now = Date.now(),
): { current: T[]; last: T[] } {
  const all = splitEpisodes(questions, breakMs)
  if (all.length === 0) return { current: [], last: [] }
  const newest = all[all.length - 1]
  if (isEpisodeOpen(newest, breakMs, now)) return { current: newest, last: all[all.length - 2] ?? [] }
  return { current: [], last: newest }
}

type ScoreQuestion = Pick<Question, 'winnerId'>

/** Points per player. */
export function episodeScores(playerIds: string[], questions: ScoreQuestion[]): Map<string, number> {
  const scores = new Map(playerIds.map((id) => [id, 0]))
  for (const q of questions) {
    if (q.winnerId && scores.has(q.winnerId)) scores.set(q.winnerId, scores.get(q.winnerId)! + 1)
  }
  return scores
}

/** Most points wins; ties give several ids; an episode without any point has no winner. */
export function episodeWinners(playerIds: string[], questions: ScoreQuestion[]): string[] {
  const scores = episodeScores(playerIds, questions)
  if (![...scores.values()].some((v) => v > 0)) return []
  return pickWinners(scores, 'higher_better')
}

/** Questions somebody scored on (the share-of-points denominator). */
export function scoredCount(questions: ScoreQuestion[]): number {
  return questions.filter((q) => q.winnerId !== null).length
}

/** Points / scored questions. Does not depend on „Nikdo“ being pressed. */
export function shareOfPoints(points: number, questions: ScoreQuestion[]): number | null {
  const scored = scoredCount(questions)
  return scored ? points / scored : null
}

/** Points / all questions incl. „Nikdo“. Only exact when „Nikdo“ is always pressed. */
export function shareOfQuestions(points: number, questions: ScoreQuestion[]): number | null {
  return questions.length ? points / questions.length : null
}

// ---------------------------------------------------------------------------
// Streaks (consecutive questions won; „Nikdo“ or another player breaks it)
// ---------------------------------------------------------------------------

export interface Streak {
  playerId: string
  length: number
}

/** Who scored the last questions in a row (null when the last question was „Nikdo“ or none). */
export function currentStreak(questions: ScoreQuestion[]): Streak | null {
  const last = questions[questions.length - 1]
  if (!last?.winnerId) return null
  let length = 0
  for (let i = questions.length - 1; i >= 0 && questions[i].winnerId === last.winnerId; i--) length += 1
  return { playerId: last.winnerId, length }
}

/** Longest run of one player within the questions (the earliest one on a tie). */
export function longestStreak(questions: ScoreQuestion[]): Streak | null {
  let best = null as Streak | null
  let run = null as Streak | null
  for (const q of questions) {
    if (!q.winnerId) {
      run = null
      continue
    }
    run = { playerId: q.winnerId, length: run?.playerId === q.winnerId ? run.length + 1 : 1 }
    if (!best || run.length > best.length) best = run
  }
  return best
}

/** Longest run of the given player within the questions. */
export function longestStreakOf(questions: ScoreQuestion[], playerId: string): number {
  let best = 0
  let run = 0
  for (const q of questions) {
    run = q.winnerId === playerId ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}

// ---------------------------------------------------------------------------
// Entry helpers
// ---------------------------------------------------------------------------

/**
 * Tap guard against accidental double taps: a tap on the same key within `windowMs` of the
 * previous accepted tap on that key is rejected; taps on other keys always pass.
 */
export function createTapGuard(windowMs = DOUBLE_TAP_MS): (key: string, now?: number) => boolean {
  const lastTap = new Map<string, number>()
  return (key, now = Date.now()) => {
    const previous = lastTap.get(key)
    if (previous !== undefined && now - previous < windowMs) return false
    lastTap.set(key, now)
    return true
  }
}

/** Undo: the questions without the last one (highest round number), and the removed one. */
export function withoutLast<T extends Pick<Question, 'roundNo'>>(questions: T[]): { remaining: T[]; removed: T | null } {
  if (questions.length === 0) return { remaining: questions, removed: null }
  const last = questions.reduce((a, b) => (b.roundNo > a.roundNo ? b : a))
  return { remaining: questions.filter((q) => q !== last), removed: last }
}

/** Toast after „Zpět“: „Vráceno: bod – Ondra“ / „Vráceno: Nikdo“. */
export function undoMessage(winnerName: string | null): string {
  return winnerName === null ? 'Vráceno: Nikdo' : `Vráceno: bod – ${winnerName}`
}

/**
 * „30. 10. 2026“, or „30. 10. 2026, 20:15“ when another episode of the same group starts
 * on the same day. `others` = start times of the group's episodes (may include this one).
 */
export function episodeLabel(startedAt: string, others: string[]): string {
  const date = formatDate(startedAt)
  const clash = others.some((o) => o !== startedAt && formatDate(o) === date)
  return clash ? `${date}, ${formatTime(startedAt)}` : date
}
