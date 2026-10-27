// Žolík rules: in each hand („kolo“) one player wins and gets 0, every other player records
// the value of their remaining cards (≥ 1). Lower total wins. The dealer is drawn before
// every hand; the hand winner may keep 0–4 jokers for the next hand.
// The game is endless; a „partie“ (evening) ends after a pause of ≥ PARTIE_BREAK_MS between
// hands or after a hand marked ends_partie („Pro dnešek konec“).
import type { Round, ScoredEntry } from '../../lib/types'
import { pickWinners } from '../winners'

export const PARTIE_BREAK_MS = 4 * 60 * 60 * 1000
export const DEFAULT_MAX_JOKERS = 4
export const DEFAULT_MIN_LOSER_VALUE = 1
export const DEFAULT_MAX_WARNING = 200

export interface ZolikHand {
  roundId: string
  sessionId: string
  roundNo: number
  createdAt: string
  dealerId: string | null
  winnerId: string | null
  jokersKept: number
  endsPartie: boolean
  /** Points per player (winner 0). */
  values: Record<string, number>
}

type HandRound = Pick<
  Round,
  'id' | 'session_id' | 'round_no' | 'created_at' | 'dealer_player_id' | 'winner_player_id' | 'jokers_kept' | 'ends_partie'
>
type HandEntry = Pick<ScoredEntry, 'session_id' | 'round_no' | 'player_id' | 'value'>

/** Joins rounds and entries into hands, chronologically (by time, then round number). */
export function buildHands(rounds: HandRound[], entries: HandEntry[]): ZolikHand[] {
  const values = new Map<string, Record<string, number>>()
  for (const e of entries) {
    const key = `${e.session_id}:${e.round_no}`
    if (!values.has(key)) values.set(key, {})
    values.get(key)![e.player_id] = e.value
  }
  return rounds
    .map((r) => ({
      roundId: r.id,
      sessionId: r.session_id,
      roundNo: r.round_no,
      createdAt: r.created_at,
      dealerId: r.dealer_player_id,
      winnerId: r.winner_player_id,
      jokersKept: r.jokers_kept ?? 0,
      endsPartie: r.ends_partie,
      values: values.get(`${r.session_id}:${r.round_no}`) ?? {},
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.roundNo - b.roundNo)
}

// ---------------------------------------------------------------------------
// Partie
// ---------------------------------------------------------------------------

type PartieHand = Pick<ZolikHand, 'createdAt' | 'endsPartie'>

/** Splits chronological hands into partie: a pause ≥ 4 h or an ended partie starts a new one. */
export function splitPartie<T extends PartieHand>(hands: T[]): T[][] {
  const result: T[][] = []
  let previous: T | null = null
  for (const hand of hands) {
    if (
      previous === null ||
      previous.endsPartie ||
      Date.parse(hand.createdAt) - Date.parse(previous.createdAt) >= PARTIE_BREAK_MS
    ) {
      result.push([])
    }
    result[result.length - 1].push(hand)
    previous = hand
  }
  return result
}

/** Is a partie with these hands still going on (the next hand would belong to it)? */
export function isPartieOpen(hands: PartieHand[], now = Date.now()): boolean {
  const last = hands[hands.length - 1]
  return Boolean(last) && !last.endsPartie && now - Date.parse(last.createdAt) < PARTIE_BREAK_MS
}

/** Hands of the partie in progress, and the last finished partie (both may be empty). */
export function currentAndLastPartie<T extends PartieHand>(hands: T[], now = Date.now()): { current: T[]; last: T[] } {
  const all = splitPartie(hands)
  if (all.length === 0) return { current: [], last: [] }
  const newest = all[all.length - 1]
  if (isPartieOpen(newest, now)) return { current: newest, last: all[all.length - 2] ?? [] }
  return { current: [], last: newest }
}

type ScoreHand = Pick<ZolikHand, 'values' | 'winnerId'>

/** Total points per player. */
export function partieTotals(playerIds: string[], hands: ScoreHand[]): Map<string, number> {
  const totals = new Map(playerIds.map((id) => [id, 0]))
  for (const hand of hands) {
    for (const [id, value] of Object.entries(hand.values)) {
      if (totals.has(id)) totals.set(id, totals.get(id)! + value)
    }
  }
  return totals
}

/** Lowest total wins; ties give several ids; a partie without hands has no winner. */
export function partieWinners(playerIds: string[], hands: ScoreHand[]): string[] {
  if (hands.length === 0) return []
  return pickWinners(partieTotals(playerIds, hands), 'lower_better')
}

/** Number of hands won per player. */
export function handsWon(playerIds: string[], hands: ScoreHand[]): Map<string, number> {
  const won = new Map(playerIds.map((id) => [id, 0]))
  for (const hand of hands) {
    if (hand.winnerId && won.has(hand.winnerId)) won.set(hand.winnerId, won.get(hand.winnerId)! + 1)
  }
  return won
}

/** Highest single loss of the hands, with its player (first one on a tie). */
export function worstLoss(hands: ScoreHand[]): { playerId: string; value: number } | null {
  let worst: { playerId: string; value: number } | null = null
  for (const hand of hands) {
    for (const [playerId, value] of Object.entries(hand.values)) {
      if (value > 0 && (!worst || value > worst.value)) worst = { playerId, value }
    }
  }
  return worst
}

// ---------------------------------------------------------------------------
// Dealer, jokers, input validation
// ---------------------------------------------------------------------------

/** Uniformly random dealer from the session's players. */
export function drawDealer(playerIds: string[], random: () => number = Math.random): string {
  if (playerIds.length === 0) throw new Error('no players')
  const index = Math.min(playerIds.length - 1, Math.floor(random() * playerIds.length))
  return playerIds[index]
}

export function clampJokers(value: number, max = DEFAULT_MAX_JOKERS): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(max, Math.max(0, Math.round(value)))
}

export type LoserValidation = { ok: true; value: number; warn: boolean } | { ok: false }

/** A loser's points: an integer ≥ min; `warn` when above the warning threshold. */
export function validateLoserValue(
  raw: string,
  { min = DEFAULT_MIN_LOSER_VALUE, maxWarning = DEFAULT_MAX_WARNING }: { min?: number; maxWarning?: number } = {},
): LoserValidation {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return { ok: false }
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value) || value > 2_147_483_647 || value < min) return { ok: false }
  return { ok: true, value, warn: value > maxWarning }
}

/**
 * Jokers carried into the next hand: the latest hand of the group decides, across partie
 * boundaries (the reminder matters most at the start of a new partie).
 */
export function jokerReminder(
  hands: Pick<ZolikHand, 'createdAt' | 'roundNo' | 'winnerId' | 'jokersKept'>[],
): { playerId: string; count: number } | null {
  let latest: (typeof hands)[number] | null = null
  for (const hand of hands) {
    if (
      !latest ||
      hand.createdAt > latest.createdAt ||
      (hand.createdAt === latest.createdAt && hand.roundNo > latest.roundNo)
    ) {
      latest = hand
    }
  }
  if (!latest || !latest.winnerId || latest.jokersKept <= 0) return null
  return { playerId: latest.winnerId, count: latest.jokersKept }
}

/** „1 žolíka“, „2 žolíky“, „5 žolíků“ (accusative, „má … žolíka“). */
export function jokersPhrase(count: number): string {
  if (count === 1) return '1 žolíka'
  if (count >= 2 && count <= 4) return `${count} žolíky`
  return `${count} žolíků`
}

// ---------------------------------------------------------------------------
// Dealer draw persistence (the draw for the upcoming hand survives a reload)
// ---------------------------------------------------------------------------

export interface StoredDealer {
  dealerId: string
  /** Round number of the last saved hand when the dealer was drawn (0 = none). */
  afterRound: number
  drawnAt: string
}

/**
 * A stored draw still applies when no hand was saved or deleted since, and — once the
 * partie has no hands yet (new evening) — it was drawn within PARTIE_BREAK_MS.
 */
export function storedDealerValid(
  stored: StoredDealer | null,
  { playerIds, lastRoundNo, partieEmpty, now = Date.now() }: {
    playerIds: string[]
    lastRoundNo: number
    partieEmpty: boolean
    now?: number
  },
): stored is StoredDealer {
  if (!stored || !playerIds.includes(stored.dealerId) || stored.afterRound !== lastRoundNo) return false
  return !partieEmpty || now - Date.parse(stored.drawnAt) < PARTIE_BREAK_MS
}

const storageKey = (sessionId: string) => `zolik-dealer:${sessionId}`

export function loadStoredDealer(sessionId: string): StoredDealer | null {
  try {
    const raw = localStorage.getItem(storageKey(sessionId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDealer
    return typeof parsed?.dealerId === 'string' && typeof parsed.afterRound === 'number' && typeof parsed.drawnAt === 'string'
      ? parsed
      : null
  } catch {
    return null
  }
}

export function saveStoredDealer(sessionId: string, value: StoredDealer): void {
  try {
    localStorage.setItem(storageKey(sessionId), JSON.stringify(value))
  } catch {
    // Without storage a reload just draws again.
  }
}
