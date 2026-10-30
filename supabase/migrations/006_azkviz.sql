-- 006: AZ-kvíz.
-- One rounds row per question: winner_player_id = who answered first, null = „Nikdo“.
-- A scored question also has one entry (value 1) for its winner; „Nikdo“ has none.
-- Like Žolík, an AZ-kvíz game is endless; an „epizoda“ is derived on the client:
-- it ends after a pause of config.inactivity_minutes (180) or when its last question has
-- ends_partie („Konec epizody“). There is no server-side closing job (removed in 004).
-- AZ-kvíz keeps the player order as selected (config.fixed_order) instead of a random draw.

insert into public.game_types (id, name, scoring, config) values
  ('azkviz', 'AZ-kvíz', 'higher_better', '{"inactivity_minutes": 180, "fixed_order": true}')
on conflict (id) do update set name = excluded.name, scoring = excluded.scoring, config = excluded.config;

-- Same as in 004, except that game types with config.fixed_order keep the order of
-- p_player_ids instead of drawing it.
create or replace function public.create_session(p_game_type_id text, p_player_ids uuid[])
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := public.my_player_id();
  v_fixed boolean;
  v_ids uuid[];
  v_pid uuid;
  v_session_id uuid;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  select coalesce((config ->> 'fixed_order')::boolean, false) into v_fixed
  from public.game_types where id = p_game_type_id;
  if not found then
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

  -- Turn order: 0 = first. Drawn, or the given order (first occurrence of each id).
  insert into public.session_players (session_id, player_id, turn_order)
  select v_session_id, t.x,
    (row_number() over (order by case when v_fixed then t.n end, random()))::int - 1
  from (
    select x, min(n) as n from unnest(p_player_ids) with ordinality as u(x, n) group by x
  ) as t;

  insert into public.session_draws (session_id, from_round, player_ids)
  select v_session_id, 1, array_agg(player_id order by turn_order)
  from public.session_players
  where session_id = v_session_id;

  return v_session_id;
end;
$$;

-- Records one AZ-kvíz question: the round, plus an entry (value 1) when someone scored.
-- p_winner_player_id null = „Nikdo“. Security definer because it also bumps
-- sessions.last_activity_at (no update policy on sessions); access is checked explicitly.
-- Returns {"round": ..., "entry": ... | null}.
create or replace function public.record_azkviz_question(p_session_id uuid, p_winner_player_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_round public.rounds;
  v_entry public.entries;
begin
  if not public.can_write_session(p_session_id) then
    raise exception 'access_denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.sessions where id = p_session_id and game_type_id = 'azkviz'
  ) then
    raise exception 'not_azkviz';
  end if;
  if p_winner_player_id is not null and not exists (
    select 1 from public.session_players
    where session_id = p_session_id and player_id = p_winner_player_id
  ) then
    raise exception 'winner_not_in_session';
  end if;

  -- Serialize concurrent writes to the same game (round_no / seq).
  perform pg_advisory_xact_lock(hashtext(p_session_id::text));

  insert into public.rounds (session_id, round_no, winner_player_id)
  select p_session_id, coalesce(max(round_no), 0) + 1, p_winner_player_id
  from public.rounds
  where session_id = p_session_id
  returning * into v_round;

  if p_winner_player_id is not null then
    insert into public.entries (round_id, session_id, player_id, value, seq, created_by)
    select v_round.id, p_session_id, p_winner_player_id, 1, coalesce(max(seq), 0) + 1, auth.uid()
    from public.entries
    where session_id = p_session_id
    returning * into v_entry;
  end if;

  update public.sessions set last_activity_at = now() where id = p_session_id;

  return jsonb_build_object(
    'round', to_jsonb(v_round),
    'entry', case when v_entry.id is null then null else to_jsonb(v_entry) end
  );
end;
$$;

-- Undo („Zpět“): deletes the last question (highest round_no) incl. its entry.
-- Same as delete_last_round from 005, kept under the AZ-kvíz name.
create or replace function public.undo_last_question(p_session_id uuid)
returns jsonb
language sql security invoker set search_path = public
as $$
  select public.delete_last_round(p_session_id)
$$;

revoke execute on function public.record_azkviz_question(uuid, uuid) from public, anon;
revoke execute on function public.undo_last_question(uuid) from public, anon;
grant execute on function public.record_azkviz_question(uuid, uuid) to authenticated;
grant execute on function public.undo_last_question(uuid) to authenticated;
