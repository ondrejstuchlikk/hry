// Pure statistics for AZ-kvíz. Inputs come from loadStatsData({ withRounds: true }).
// Games are endless; results are per episode (see splitEpisodes). The episode in progress
// counts for per-question stats but has no result yet.
import type { StatsData } from '../../lib/api'
import { isBetter } from '../winners'
import {
  buildQuestions,
  EPISODE_BREAK_MS,
  episodeScores,
  episodeWinners,
  isEpisodeOpen,
  longestStreakOf,
  scoredCount,
  splitEpisodes,
  type Question,
} from './logic'

export interface Episode {
  /** `<session id>#<n>` */
  id: string
  sessionId: string
  groupKey: string
  playerIds: string[]
  questions: Question[]
  startedAt: string
  endedAt: string
  inProgress: boolean
  scores: Map<string, number>
  /** Empty while in progress and for an episode without points. */
  winners: string[]
}

/** All episodes of the data, chronologically. */
export function buildEpisodes(
  data: Pick<StatsData, 'sessions' | 'rounds'>,
  { breakMs = EPISODE_BREAK_MS, now = Date.now() }: { breakMs?: number; now?: number } = {},
): Episode[] {
  const bySession = new Map<string, Question[]>()
  for (const q of buildQuestions(data.rounds ?? [])) {
    if (!bySession.has(q.sessionId)) bySession.set(q.sessionId, [])
    bySession.get(q.sessionId)!.push(q)
  }

  const result: Episode[] = []
  for (const session of data.sessions) {
    const playerIds = [...session.players].sort((a, b) => a.turn_order - b.turn_order).map((p) => p.player_id)
    const all = splitEpisodes(bySession.get(session.id) ?? [], breakMs)
    all.forEach((questions, i) => {
      const inProgress = i === all.length - 1 && isEpisodeOpen(questions, breakMs, now)
      result.push({
        id: `${session.id}#${i + 1}`,
        sessionId: session.id,
        groupKey: session.group_key,
        playerIds,
        questions,
        startedAt: questions[0].createdAt,
        endedAt: questions[questions.length - 1].createdAt,
        inProgress,
        scores: episodeScores(playerIds, questions),
        winners: inProgress ? [] : episodeWinners(playerIds, questions),
      })
    })
  }
  return result.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

export type Outcome = 'win' | 'tie' | 'loss' | 'none'

export function outcomeFor(episode: Episode, playerId: string): Outcome {
  if (episode.inProgress || episode.winners.length === 0 || !episode.playerIds.includes(playerId)) return 'none'
  if (!episode.winners.includes(playerId)) return 'loss'
  return episode.winners.length === 1 ? 'win' : 'tie'
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

function longestRun<T>(items: T[], predicate: (item: T) => boolean): number {
  let best = 0
  let current = 0
  for (const item of items) {
    current = predicate(item) ? current + 1 : 0
    best = Math.max(best, current)
  }
  return best
}

// ---------------------------------------------------------------------------
// Per-player summary
// ---------------------------------------------------------------------------

export interface AzkvizSummary {
  playerId: string
  episodesPlayed: number
  wins: number
  ties: number
  /** Wins / finished episodes with a winner. */
  winRate: number | null
  points: number
  /** All questions of the player's episodes incl. „Nikdo“. */
  questions: number
  /** Mean over finished episodes. */
  averagePoints: number | null
  /** Mean of points / scored questions over finished episodes with a point. */
  averageShare: number | null
  /** Points / all questions incl. „Nikdo“ (needs the „Nikdo“ warning). */
  successRate: number | null
  bestEpisode: { points: number; date: string } | null
  longestQuestionStreak: number
  longestEpisodeWinStreak: number
}

export function playerSummary(episodes: Episode[], playerId: string): AzkvizSummary {
  const own = episodes.filter((e) => e.playerIds.includes(playerId))
  const finished = own.filter((e) => !e.inProgress)
  const outcomes = own.map((e) => outcomeFor(e, playerId)).filter((o) => o !== 'none')
  const wins = outcomes.filter((o) => o === 'win').length
  const points = own.reduce((sum, e) => sum + (e.scores.get(playerId) ?? 0), 0)
  const questions = own.reduce((sum, e) => sum + e.questions.length, 0)

  let bestEpisode: AzkvizSummary['bestEpisode'] = null
  for (const e of finished) {
    const p = e.scores.get(playerId) ?? 0
    if (!bestEpisode || p > bestEpisode.points) bestEpisode = { points: p, date: e.startedAt }
  }

  return {
    playerId,
    episodesPlayed: own.length,
    wins,
    ties: outcomes.filter((o) => o === 'tie').length,
    winRate: outcomes.length ? wins / outcomes.length : null,
    points,
    questions,
    averagePoints: average(finished.map((e) => e.scores.get(playerId) ?? 0)),
    averageShare: average(
      finished.filter((e) => scoredCount(e.questions) > 0).map((e) => (e.scores.get(playerId) ?? 0) / scoredCount(e.questions)),
    ),
    successRate: questions ? points / questions : null,
    bestEpisode,
    longestQuestionStreak: Math.max(0, ...own.map((e) => longestStreakOf(e.questions, playerId))),
    longestEpisodeWinStreak: longestRun(outcomes, (o) => o === 'win'),
  }
}

/** Average points per finished episode, leaving out one episode (the one being compared). */
export function averagePointsExcept(episodes: Episode[], playerId: string, exceptId: string | null): number | null {
  return average(
    episodes
      .filter((e) => !e.inProgress && e.id !== exceptId && e.playerIds.includes(playerId))
      .map((e) => e.scores.get(playerId) ?? 0),
  )
}

// ---------------------------------------------------------------------------
// Chart series
// ---------------------------------------------------------------------------

export type SeriesRow = { key: string; label: string } & Record<string, number | string | null>

const involving = (episodes: Episode[], playerIds: string[]) =>
  episodes.filter((e) => playerIds.some((id) => e.playerIds.includes(id)))

/** Cumulative sole episode wins per player after each finished episode. */
export function cumulativeWins(episodes: Episode[], playerIds: string[]): SeriesRow[] {
  const counts = new Map(playerIds.map((id) => [id, 0]))
  return involving(episodes, playerIds)
    .filter((e) => !e.inProgress)
    .map((e) => {
      const row: SeriesRow = { key: e.id, label: e.startedAt }
      for (const id of playerIds) {
        if (outcomeFor(e, id) === 'win') counts.set(id, counts.get(id)! + 1)
        row[id] = counts.get(id)!
      }
      return row
    })
}

/** Points of each player per episode (null when the player was not in it). */
export function pointsPerEpisode(episodes: Episode[], playerIds: string[]): SeriesRow[] {
  return involving(episodes, playerIds).map((e) => {
    const row: SeriesRow = { key: e.id, label: e.startedAt }
    for (const id of playerIds) row[id] = e.playerIds.includes(id) ? (e.scores.get(id) ?? 0) : null
    return row
  })
}

/** Running points within the questions (x = question number, 0 = start). */
export function questionProgress(questions: Question[], playerIds: string[]): SeriesRow[] {
  const totals = new Map(playerIds.map((id) => [id, 0]))
  const start: SeriesRow = { key: '0', label: '0', question: 0 }
  for (const id of playerIds) start[id] = 0
  const rows = [start]
  questions.forEach((q, i) => {
    if (q.winnerId && totals.has(q.winnerId)) totals.set(q.winnerId, totals.get(q.winnerId)! + 1)
    const row: SeriesRow = { key: String(i + 1), label: String(i + 1), question: i + 1 }
    for (const id of playerIds) row[id] = totals.get(id)!
    rows.push(row)
  })
  return rows
}

/** Share of „Nikdo“ questions per episode (needs the „Nikdo“ warning). */
export function nobodyShare(episodes: Episode[]): SeriesRow[] {
  return episodes.map((e) => ({
    key: e.id,
    label: e.startedAt,
    share: (e.questions.length - scoredCount(e.questions)) / e.questions.length,
    questions: e.questions.length,
  }))
}

// ---------------------------------------------------------------------------
// Head to head
// ---------------------------------------------------------------------------

export interface HeadToHead {
  a: string
  b: string
  episodes: number
  aBetter: number
  bBetter: number
  equal: number
}

/** For each pair: in how many shared finished episodes each had more points. */
export function headToHead(episodes: Episode[], playerIds: string[]): HeadToHead[] {
  const result: HeadToHead[] = []
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      const h: HeadToHead = { a: playerIds[i], b: playerIds[j], episodes: 0, aBetter: 0, bBetter: 0, equal: 0 }
      for (const e of episodes) {
        if (e.inProgress || !e.playerIds.includes(h.a) || !e.playerIds.includes(h.b)) continue
        const pa = e.scores.get(h.a)!
        const pb = e.scores.get(h.b)!
        h.episodes += 1
        if (isBetter(pa, pb, 'higher_better')) h.aBetter += 1
        else if (isBetter(pb, pa, 'higher_better')) h.bBetter += 1
        else h.equal += 1
      }
      if (h.episodes > 0) result.push(h)
    }
  }
  return result
}
