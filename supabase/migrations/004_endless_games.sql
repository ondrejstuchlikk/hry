-- 004: Endless games.
-- Games never end: one game per game type and player set, continued day after day.
-- The turn order is redrawn on the first visit of each new day (session_draws).
-- "Evenings" (for wins and stats) are derived on the client from pauses between throws.

-- ---------------------------------------------------------------------------
-- No more ending: stop the cron job, reopen ended games, drop the ending functions
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'close-stale-sessions';
  end if;
end;
$$;

update public.sessions
set status = 'active', ended_reason = null, ended_at = null, winner_player_ids = null
where status = 'ended';

drop function if exists public.close_stale_sessions();
drop function if exists public.end_session(uuid, text);
drop function if exists public.finish_session(uuid, text);
drop function if exists public.compute_session_winners(uuid);

-- ---------------------------------------------------------------------------
-- Turn order draws: a draw applies from round from_round until the next draw
-- ---------------------------------------------------------------------------

create table public.session_draws (
  session_id uuid not null references public.sessions(id) on delete cascade,
  from_round int not null check (from_round >= 1),
  player_ids uuid[] not null,          -- turn order, first = starts
  drawn_at timestamptz not null default now(),
  primary key (session_id, from_round)
);

-- Existing games: their original draw applies from round 1.
insert into public.session_draws (session_id, from_round, player_ids, drawn_at)
select sp.session_id, 1, array_agg(sp.player_id order by sp.turn_order), s.started_at
from public.session_players sp
join public.sessions s on s.id = sp.session_id
group by sp.session_id, s.started_at;

alter table public.session_draws enable row level security;

-- session_draws: same read access as the session; written only by RPCs
create policy "session_draws_select" on public.session_draws
  for select to authenticated using (public.can_access_session(session_id));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Returns the caller's existing game with exactly these players, or creates one
-- with a random turn order. The caller's own player must be included.
create or replace function public.create_session(p_game_type_id text, p_player_ids uuid[])
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := public.my_player_id();
  v_ids uuid[];
  v_pid uuid;
  v_session_id uuid;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from public.game_types where id = p_game_type_id) then
    raise exception 'unknown_game_type';
  end if;

  select array_agg(distinct x order by x) into v_ids from unnest(p_player_ids) as x;

  if v_ids is null or array_length(v_ids, 1) < 2 then
    raise exception 'at_least_two_players';
  end if;
  if not (v_me = any (v_ids)) then
    raise exception 'creator_must_play';
  end if;
  foreach v_pid in array v_ids loop
    if not public.can_see_player(v_pid) then
      raise exception 'unknown_player';
    end if;
  end loop;

  -- One endless game per game type and player set.
  select id into v_session_id
  from public.sessions
  where game_type_id = p_game_type_id and group_key = array_to_string(v_ids, ',')
  order by started_at desc
  limit 1;
  if v_session_id is not null then
    return v_session_id;
  end if;

  insert into public.sessions (game_type_id, created_by, group_key)
  values (p_game_type_id, auth.uid(), array_to_string(v_ids, ','))
  returning id into v_session_id;

  -- Draw the turn order: 0 = starts.
  insert into public.session_players (session_id, player_id, turn_order)
  select v_session_id, x, (row_number() over (order by random()))::int - 1
  from unnest(v_ids) as x;

  insert into public.session_draws (session_id, from_round, player_ids)
  select v_session_id, 1, array_agg(player_id order by turn_order)
  from public.session_players
  where session_id = v_session_id;

  return v_session_id;
end;
$$;

-- Redraws the turn order when the game is opened on a new day: nothing was thrown
-- and nothing was drawn since p_day_start (the client's local midnight).
-- The new order applies from the next round; an unfinished round stays unfinished.
-- Returns the new draw as json, or null when no redraw was needed.
create or replace function public.redraw_if_new_day(p_session_id uuid, p_day_start timestamptz)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_from int;
  v_draw public.session_draws;
begin
  if not public.can_write_session(p_session_id) then
    raise exception 'access_denied' using errcode = '42501';
  end if;

  -- Serialize concurrent openings of the same game.
  perform 1 from public.sessions where id = p_session_id for update;

  if not exists (select 1 from public.entries where session_id = p_session_id)
     or exists (select 1 from public.entries where session_id = p_session_id and created_at >= p_day_start)
     or exists (select 1 from public.session_draws where session_id = p_session_id and drawn_at >= p_day_start)
  then
    return null;
  end if;

  select coalesce(max(round_no), 0) + 1 into v_from from public.rounds where session_id = p_session_id;

  insert into public.session_draws (session_id, from_round, player_ids)
  select p_session_id, v_from, array_agg(player_id order by random())
  from public.session_players
  where session_id = p_session_id
  on conflict (session_id, from_round)
    do update set player_ids = excluded.player_ids, drawn_at = now()
  returning * into v_draw;

  return to_jsonb(v_draw);
end;
$$;

-- Records one value. Creates the round when needed and assigns the next seq.
-- Runs as the caller, so RLS decides whether the write is allowed.
create or replace function public.add_entry(
  p_session_id uuid,
  p_round_no int,
  p_player_id uuid,
  p_value int
)
returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  v_round_id uuid;
  v_seq int;
  v_entry public.entries;
begin
  if not exists (
    select 1 from public.session_players
    where session_id = p_session_id and player_id = p_player_id
  ) then
    raise exception 'player_not_in_session';
  end if;

  insert into public.rounds (session_id, round_no)
  values (p_session_id, p_round_no)
  on conflict (session_id, round_no) do nothing;

  select id into v_round_id
  from public.rounds
  where session_id = p_session_id and round_no = p_round_no;

  select coalesce(max(seq), 0) + 1 into v_seq
  from public.entries
  where session_id = p_session_id;

  insert into public.entries (round_id, session_id, player_id, value, seq, created_by)
  values (v_round_id, p_session_id, p_player_id, p_value, v_seq, auth.uid())
  returning * into v_entry;

  return to_jsonb(v_entry);
end;
$$;

revoke execute on function public.redraw_if_new_day(uuid, timestamptz) from public, anon;
grant execute on function public.redraw_if_new_day(uuid, timestamptz) to authenticated;
