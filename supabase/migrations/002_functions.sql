-- 002: Helper functions, triggers and RPCs.

-- ---------------------------------------------------------------------------
-- Access helpers (security definer so RLS policies can use them without recursion)
-- ---------------------------------------------------------------------------

-- Player id of the signed-in user.
create or replace function public.my_player_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.players where user_id = auth.uid()
$$;

-- True when the signed-in user created the session or plays in it with their account.
create or replace function public.can_access_session(p_session_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.sessions s
    where s.id = p_session_id
      and (
        s.created_by = auth.uid()
        or exists (
          select 1
          from public.session_players sp
          join public.players p on p.id = sp.player_id
          where sp.session_id = s.id and p.user_id = auth.uid()
        )
      )
  )
$$;

-- True when the session is accessible and still active (entries may be written).
create or replace function public.can_write_session(p_session_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.can_access_session(p_session_id)
     and exists (select 1 from public.sessions where id = p_session_id and status = 'active')
$$;

-- True for account players, own guests, and guests from sessions the user can access.
create or replace function public.can_see_player(p_player_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.players p
    where p.id = p_player_id
      and (
        p.user_id is not null
        or p.created_by = auth.uid()
        or exists (
          select 1 from public.session_players sp
          where sp.player_id = p.id and public.can_access_session(sp.session_id)
        )
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- Signup: create profile + player from raw_user_meta_data.username
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_username text := lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));
begin
  insert into public.profiles (id, username) values (new.id, v_username);
  insert into public.players (user_id, display_name, created_by) values (new.id, v_username, new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Activity tracking: any entry insert/delete bumps sessions.last_activity_at
-- ---------------------------------------------------------------------------

create or replace function public.touch_session_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_session_id uuid := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
begin
  update public.sessions set last_activity_at = now()
  where id = v_session_id and status = 'active';
  return null;
end;
$$;

create trigger entries_touch_session
  after insert or delete on public.entries
  for each row execute function public.touch_session_activity();

-- ---------------------------------------------------------------------------
-- Winners
-- A round is complete according to game_types.config.round_complete:
--   'all_players'  (default, kostky) – every session player has an entry
--   'round_winner' (žolík)           – rounds.winner_player_id is set
-- Only complete rounds count. Ties return several ids; no complete round = null.
-- ---------------------------------------------------------------------------

create or replace function public.compute_session_winners(p_session_id uuid)
returns uuid[]
language plpgsql stable security definer set search_path = public
as $$
declare
  v_scoring text;
  v_rule text;
  v_player_count int;
  v_result uuid[];
begin
  select gt.scoring, coalesce(gt.config ->> 'round_complete', 'all_players')
    into v_scoring, v_rule
  from public.sessions s
  join public.game_types gt on gt.id = s.game_type_id
  where s.id = p_session_id;

  select count(*) into v_player_count from public.session_players where session_id = p_session_id;

  with complete_rounds as (
    select r.id
    from public.rounds r
    where r.session_id = p_session_id
      and case v_rule
            when 'round_winner' then r.winner_player_id is not null
            else (select count(*) from public.entries e where e.round_id = r.id) = v_player_count
          end
  ),
  totals as (
    select sp.player_id, coalesce(sum(e.value), 0) as total
    from public.session_players sp
    left join public.entries e
      on e.player_id = sp.player_id and e.round_id in (select id from complete_rounds)
    where sp.session_id = p_session_id
    group by sp.player_id
  ),
  best as (
    select case when v_scoring = 'lower_better' then min(total) else max(total) end as total
    from totals
  )
  select array_agg(t.player_id order by t.player_id) into v_result
  from totals t, best b
  where t.total = b.total and exists (select 1 from complete_rounds);

  return v_result;
end;
$$;

-- Ends a session without access checks (internal; not callable by clients).
create or replace function public.finish_session(p_session_id uuid, p_reason text)
returns public.sessions
language plpgsql security definer set search_path = public
as $$
declare
  v_session public.sessions;
begin
  if p_reason not in ('manual', 'inactivity') then
    raise exception 'invalid_reason';
  end if;

  update public.sessions
  set status = 'ended',
      ended_reason = p_reason,
      ended_at = case when p_reason = 'inactivity' then last_activity_at else now() end,
      winner_player_ids = public.compute_session_winners(id)
  where id = p_session_id and status = 'active'
  returning * into v_session;

  if v_session.id is null then
    select * into v_session from public.sessions where id = p_session_id;
  end if;
  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs called by the client
-- ---------------------------------------------------------------------------

-- Creates a session with a random turn order. The caller's own player must be included.
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

  insert into public.sessions (game_type_id, created_by, group_key)
  values (p_game_type_id, auth.uid(), array_to_string(v_ids, ','))
  returning id into v_session_id;

  -- Draw the turn order: 0 = starts.
  insert into public.session_players (session_id, player_id, turn_order)
  select v_session_id, x, (row_number() over (order by random()))::int - 1
  from unnest(v_ids) as x;

  return v_session_id;
end;
$$;

-- Ends a session the caller has access to.
create or replace function public.end_session(p_session_id uuid, p_reason text default 'manual')
returns public.sessions
language plpgsql security definer set search_path = public
as $$
begin
  if not public.can_access_session(p_session_id) then
    raise exception 'access_denied' using errcode = '42501';
  end if;
  return public.finish_session(p_session_id, p_reason);
end;
$$;

-- Ends every active session idle for more than an hour. Returns how many were closed.
create or replace function public.close_stale_sessions()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  for v_id in
    select id from public.sessions
    where status = 'active' and last_activity_at < now() - interval '1 hour'
    for update skip locked
  loop
    perform public.finish_session(v_id, 'inactivity');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Records one value. Creates the round when needed and assigns the next seq.
-- Returns the new entry as json, or null when the session was closed for inactivity instead.
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
  if exists (
    select 1 from public.sessions
    where id = p_session_id and status = 'active'
      and last_activity_at < now() - interval '1 hour'
  ) then
    perform public.close_stale_sessions();
    return null;
  end if;

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

-- Deletes the last entry (highest seq) and its round if it became empty.
-- Returns the deleted entry as json, or null when there was nothing to undo.
create or replace function public.undo_last_entry(p_session_id uuid)
returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  v_entry public.entries;
begin
  delete from public.entries
  where id = (
    select id from public.entries
    where session_id = p_session_id
    order by seq desc
    limit 1
  )
  returning * into v_entry;

  if v_entry.id is null then
    return null;
  end if;

  delete from public.rounds r
  where r.id = v_entry.round_id
    and r.winner_player_id is null
    and not exists (select 1 from public.entries e where e.round_id = r.id);

  return to_jsonb(v_entry);
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function public.finish_session(uuid, text) from public, anon, authenticated;
revoke execute on function public.compute_session_winners(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_session_activity() from public, anon, authenticated;

revoke execute on function public.create_session(text, uuid[]) from public, anon;
revoke execute on function public.end_session(uuid, text) from public, anon;
revoke execute on function public.close_stale_sessions() from public, anon;
revoke execute on function public.add_entry(uuid, int, uuid, int) from public, anon;
revoke execute on function public.undo_last_entry(uuid) from public, anon;

grant execute on function public.create_session(text, uuid[]) to authenticated;
grant execute on function public.end_session(uuid, text) to authenticated;
grant execute on function public.close_stale_sessions() to authenticated;
grant execute on function public.add_entry(uuid, int, uuid, int) to authenticated;
grant execute on function public.undo_last_entry(uuid) to authenticated;
