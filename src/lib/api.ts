import { supabase } from './supabase'
import type {
  Draw,
  Entry,
  GameType,
  Player,
  Round,
  ScoredEntry,
  Session,
  SessionDetail,
  SessionPlayerRow,
  SessionWithPlayers,
} from './types'

/** PostgREST returns at most 1000 rows per request on Supabase; fetch page by page. */
const PAGE_SIZE = 1000

async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

function check<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Game types & players
// ---------------------------------------------------------------------------

export async function getGameTypes(): Promise<GameType[]> {
  return check(await supabase.from('game_types').select('*').order('id')) as GameType[]
}

/** All players visible to the user (account players, own guests, guests from shared sessions). */
export async function getVisiblePlayers(): Promise<Player[]> {
  return fetchAll<Player>((from, to) =>
    supabase.from('players').select('id, user_id, display_name, created_by').order('display_name').range(from, to),
  )
}

/** Account players whose username starts with the given text. */
export async function searchAccountPlayers(query: string): Promise<(Player & { username: string })[]> {
  const q = query.trim().toLowerCase().replace(/[%_\\]/g, '\\$&')
  if (!q) return []
  const profiles = check(
    await supabase.from('profiles').select('id, username').ilike('username', `${q}%`).order('username').limit(8),
  ) as { id: string; username: string }[]
  if (profiles.length === 0) return []
  const players = check(
    await supabase
      .from('players')
      .select('id, user_id, display_name, created_by')
      .in(
        'user_id',
        profiles.map((p) => p.id),
      ),
  ) as Player[]
  return profiles.flatMap((profile) => {
    const player = players.find((p) => p.user_id === profile.id)
    return player ? [{ ...player, username: profile.username }] : []
  })
}

export async function createGuest(displayName: string, createdBy: string): Promise<Player> {
  return check(
    await supabase
      .from('players')
      .insert({ display_name: displayName.trim(), created_by: createdBy })
      .select('id, user_id, display_name, created_by')
      .single(),
  ) as Player
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Returns the existing game of exactly these players, or creates a new one. */
export async function createSession(gameTypeId: string, playerIds: string[]): Promise<string> {
  return check(
    await supabase.rpc('create_session', { p_game_type_id: gameTypeId, p_player_ids: playerIds }),
  ) as string
}

/** Redraws the turn order on the first visit of a new day; returns the new draw or null. */
export async function redrawIfNewDay(sessionId: string): Promise<Draw | null> {
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  return check(
    await supabase.rpc('redraw_if_new_day', { p_session_id: sessionId, p_day_start: dayStart.toISOString() }),
  ) as Draw | null
}

async function loadDraws(sessionIds: string[]): Promise<Draw[]> {
  if (sessionIds.length === 0) return []
  return fetchAll<Draw>((from, to) =>
    supabase
      .from('session_draws')
      .select('*')
      .in('session_id', sessionIds)
      .order('session_id')
      .order('from_round')
      .range(from, to),
  )
}

const SESSION_WITH_PLAYERS = '*, players:session_players(session_id, player_id, turn_order)'

function sortPlayers(s: SessionWithPlayers): SessionWithPlayers {
  return { ...s, players: [...s.players].sort((a, b) => a.turn_order - b.turn_order) }
}

/** Sessions accessible to the user (RLS: created by or played in), most recently played first. */
export async function listSessions(options: { gameTypeId?: string; groupKey?: string }): Promise<SessionWithPlayers[]> {
  const build = () => {
    let query = supabase.from('sessions').select(SESSION_WITH_PLAYERS)
    if (options.gameTypeId) query = query.eq('game_type_id', options.gameTypeId)
    if (options.groupKey) query = query.eq('group_key', options.groupKey)
    return query.order('last_activity_at', { ascending: false }).order('id')
  }
  const rows = await fetchAll<SessionWithPlayers>((from, to) => build().range(from, to))
  return rows.map(sortPlayers)
}

/** Always loads fresh data from the DB. */
export async function loadSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  const session = check(await supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle()) as
    | Session
    | null
  if (!session) return null

  const [gameType, sessionPlayers, rounds, entries, draws] = await Promise.all([
    supabase.from('game_types').select('*').eq('id', session.game_type_id).single().then(check),
    supabase.from('session_players').select('*').eq('session_id', sessionId).then(check),
    fetchAll<Round>((from, to) =>
      supabase.from('rounds').select('*').eq('session_id', sessionId).order('round_no').range(from, to),
    ),
    fetchAll<Entry>((from, to) =>
      supabase.from('entries').select('*').eq('session_id', sessionId).order('seq').range(from, to),
    ),
    loadDraws([sessionId]),
  ])

  const spRows = sessionPlayers as SessionPlayerRow[]
  const players = check(
    await supabase
      .from('players')
      .select('id, user_id, display_name')
      .in(
        'id',
        spRows.map((sp) => sp.player_id),
      ),
  ) as Player[]

  const roundNo = new Map(rounds.map((r) => [r.id, r.round_no]))
  return {
    session,
    gameType: gameType as GameType,
    players: spRows
      .map((sp) => {
        const p = players.find((pl) => pl.id === sp.player_id)
        return { id: sp.player_id, name: p?.display_name ?? '?', turnOrder: sp.turn_order, userId: p?.user_id ?? null }
      })
      .sort((a, b) => a.turnOrder - b.turnOrder),
    rounds,
    entries: entries.map((e) => toScored(e, roundNo.get(e.round_id) ?? 0)),
    draws,
  }
}

function toScored(e: Entry, roundNo: number): ScoredEntry {
  return {
    id: e.id,
    session_id: e.session_id,
    player_id: e.player_id,
    round_no: roundNo,
    value: e.value,
    seq: e.seq,
    created_at: e.created_at,
  }
}

export async function addEntry(
  sessionId: string,
  roundNo: number,
  playerId: string,
  value: number,
): Promise<ScoredEntry> {
  const entry = check(
    await supabase.rpc('add_entry', {
      p_session_id: sessionId,
      p_round_no: roundNo,
      p_player_id: playerId,
      p_value: value,
    }),
  ) as Entry
  return toScored(entry, roundNo)
}

/** Returns the deleted entry, or null when there was nothing to undo. */
export async function undoLastEntry(sessionId: string): Promise<Entry | null> {
  return check(await supabase.rpc('undo_last_entry', { p_session_id: sessionId })) as Entry | null
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export interface StatsData {
  /** Sorted by started_at ascending. */
  sessions: SessionWithPlayers[]
  /** Chronological: by session, then by seq. */
  entries: ScoredEntry[]
  draws: Draw[]
}

/** All sessions + entries of a game type visible to the user, optionally limited to one group. */
export async function loadStatsData(gameTypeId: string, groupKey?: string): Promise<StatsData> {
  const sessions = (await listSessions({ gameTypeId, groupKey })).sort((a, b) => a.started_at.localeCompare(b.started_at))

  type Row = Omit<Entry, 'round_id' | 'id'> & { id: string; rounds: { round_no: number } }
  const rows = await fetchAll<Row>((from, to) => {
    let query = supabase
      .from('entries')
      .select('id, session_id, player_id, value, seq, created_at, rounds!inner(round_no), sessions!inner(game_type_id, group_key)')
      .eq('sessions.game_type_id', gameTypeId)
    if (groupKey) query = query.eq('sessions.group_key', groupKey)
    return query.order('id').range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>
  })

  // Chronological: by session start, then by seq within the session.
  const sessionIndex = new Map(sessions.map((s, i) => [s.id, i]))
  const entries: ScoredEntry[] = rows
    .map((r) => ({
      id: r.id,
      session_id: r.session_id,
      player_id: r.player_id,
      round_no: r.rounds.round_no,
      value: r.value,
      seq: r.seq,
      created_at: r.created_at,
    }))
    .sort((a, b) => (sessionIndex.get(a.session_id) ?? 0) - (sessionIndex.get(b.session_id) ?? 0) || a.seq - b.seq)

  const draws = await loadDraws(sessions.map((s) => s.id))
  return { sessions, entries, draws }
}
