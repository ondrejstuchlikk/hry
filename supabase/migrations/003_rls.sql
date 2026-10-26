-- 003: Row Level Security.
-- Sessions are created/ended only through RPCs (create_session, end_session),
-- so there are no direct insert/update policies on sessions and session_players.

alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.game_types enable row level security;
alter table public.sessions enable row level security;
alter table public.session_players enable row level security;
alter table public.rounds enable row level security;
alter table public.entries enable row level security;

-- profiles: everyone signed in can read (needed to find players by username)
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

-- profiles: users update only their own row
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- players: account players, own guests, and guests from accessible sessions
create policy "players_select" on public.players
  for select to authenticated using (public.can_see_player(id));

-- players: users may create guests owned by themselves
create policy "players_insert_guest" on public.players
  for insert to authenticated
  with check (user_id is null and created_by = auth.uid());

-- players: users may rename their own player and their own guests
create policy "players_update_own" on public.players
  for update to authenticated
  using (user_id = auth.uid() or (user_id is null and created_by = auth.uid()))
  with check (user_id = auth.uid() or (user_id is null and created_by = auth.uid()));

-- game_types: readable by everyone signed in
create policy "game_types_select" on public.game_types
  for select to authenticated using (true);

-- sessions: creator or account players of the session
create policy "sessions_select" on public.sessions
  for select to authenticated using (public.can_access_session(id));

-- session_players: same as the session
create policy "session_players_select" on public.session_players
  for select to authenticated using (public.can_access_session(session_id));

-- rounds: read with session access, write only while the session is active
create policy "rounds_select" on public.rounds
  for select to authenticated using (public.can_access_session(session_id));

create policy "rounds_insert" on public.rounds
  for insert to authenticated with check (public.can_write_session(session_id));

create policy "rounds_update" on public.rounds
  for update to authenticated
  using (public.can_write_session(session_id))
  with check (public.can_write_session(session_id));

create policy "rounds_delete" on public.rounds
  for delete to authenticated using (public.can_write_session(session_id));

-- entries: read with session access, write only while the session is active
create policy "entries_select" on public.entries
  for select to authenticated using (public.can_access_session(session_id));

create policy "entries_insert" on public.entries
  for insert to authenticated
  with check (
    public.can_write_session(session_id)
    and created_by = auth.uid()
    and exists (select 1 from public.rounds r where r.id = round_id and r.session_id = entries.session_id)
  );

create policy "entries_delete" on public.entries
  for delete to authenticated using (public.can_write_session(session_id));
