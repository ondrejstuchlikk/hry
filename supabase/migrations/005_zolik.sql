-- 005: Žolík.
-- A hand („hra“) = one rounds row with its winner, dealer and the jokers the winner keeps,
-- plus one entry per player (winner 0, losers ≥ 1), saved atomically by record_zolik_hand.
-- Like Kostky, a Žolík game is endless; a „partie“ (evening) is derived on the client:
-- it ends after a pause of ≥ 1 h or when its last hand has ends_partie („Pro dnešek konec“).

insert into public.game_types (id, name, scoring, config) values
  ('zolik', 'Žolík', 'lower_better',
   '{"max_warning": 200, "max_jokers": 4, "min_loser_value": 1}')
on conflict (id) do update set name = excluded.name, scoring = excluded.scoring, config = excluded.config;

-- Per-hand metadata (nullable / unused by Kostky)
alter table public.rounds add column dealer_player_id uuid references public.players(id);
alter table public.rounds add column jokers_kept int check (jokers_kept between 0 and 4);
alter table public.rounds add column ends_partie boolean not null default false;

-- Records one complete Žolík hand: the round and an entry for every player of the session.
-- p_loser_values: {"<player id>": points, ...} for every player except the winner.
-- Runs as the caller, so RLS decides whether the write is allowed.
-- Returns {"round": ..., "entries": [...]}.
create or replace function public.record_zolik_hand(
  p_session_id uuid,
  p_dealer_player_id uuid,
  p_winner_player_id uuid,
  p_jokers_kept int,
  p_loser_values jsonb
)
returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  v_config jsonb;
  v_players uuid[];
  v_pid uuid;
  v_value numeric;
  v_min int;
  v_round public.rounds;
  v_seq int;
begin
  if not public.can_write_session(p_session_id) then
    raise exception 'access_denied' using errcode = '42501';
  end if;

  select gt.config into v_config
  from public.sessions s
  join public.game_types gt on gt.id = s.game_type_id
  where s.id = p_session_id and gt.id = 'zolik';
  if not found then
    raise exception 'not_zolik';
  end if;

  -- Serialize concurrent writes to the same game (round_no / seq).
  perform pg_advisory_xact_lock(hashtext(p_session_id::text));

  select array_agg(player_id) into v_players
  from public.session_players
  where session_id = p_session_id;

  if p_dealer_player_id is null or not (p_dealer_player_id = any (v_players)) then
    raise exception 'dealer_not_in_session';
  end if;
  if p_winner_player_id is null or not (p_winner_player_id = any (v_players)) then
    raise exception 'winner_not_in_session';
  end if;
  if p_jokers_kept is null or p_jokers_kept < 0
     or p_jokers_kept > coalesce((v_config ->> 'max_jokers')::int, 4) then
    raise exception 'invalid_jokers';
  end if;

  -- Exactly one value per loser, each an integer ≥ min_loser_value.
  if p_loser_values is null or jsonb_typeof(p_loser_values) <> 'object'
     or (select count(*) from jsonb_object_keys(p_loser_values)) <> array_length(v_players, 1) - 1 then
    raise exception 'invalid_loser_values';
  end if;
  v_min := coalesce((v_config ->> 'min_loser_value')::int, 1);
  foreach v_pid in array v_players loop
    continue when v_pid = p_winner_player_id;
    if jsonb_typeof(p_loser_values -> v_pid::text) is distinct from 'number' then
      raise exception 'invalid_loser_values';
    end if;
    v_value := (p_loser_values ->> v_pid::text)::numeric;
    if v_value <> trunc(v_value) or v_value < v_min or v_value > 2147483647 then
      raise exception 'invalid_loser_value';
    end if;
  end loop;

  insert into public.rounds (session_id, round_no, winner_player_id, dealer_player_id, jokers_kept)
  select p_session_id, coalesce(max(round_no), 0) + 1, p_winner_player_id, p_dealer_player_id, p_jokers_kept
  from public.rounds
  where session_id = p_session_id
  returning * into v_round;

  select coalesce(max(seq), 0) into v_seq from public.entries where session_id = p_session_id;

  insert into public.entries (round_id, session_id, player_id, value, seq, created_by)
  select
    v_round.id,
    p_session_id,
    sp.player_id,
    case when sp.player_id = p_winner_player_id then 0 else (p_loser_values ->> sp.player_id::text)::int end,
    v_seq + (row_number() over (order by sp.turn_order))::int,
    auth.uid()
  from public.session_players sp
  where sp.session_id = p_session_id;

  return jsonb_build_object(
    'round', to_jsonb(v_round),
    'entries', (select jsonb_agg(to_jsonb(e) order by e.seq) from public.entries e where e.round_id = v_round.id)
  );
end;
$$;

-- Deletes the last round (highest round_no) with all its entries (Žolík „Smazat poslední hru“).
-- Returns the deleted round as json, or null when there was nothing to delete.
create or replace function public.delete_last_round(p_session_id uuid)
returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  v_round public.rounds;
begin
  if not public.can_write_session(p_session_id) then
    raise exception 'access_denied' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_session_id::text));

  delete from public.rounds
  where id = (
    select id from public.rounds
    where session_id = p_session_id
    order by round_no desc
    limit 1
  )
  returning * into v_round;

  if v_round.id is null then
    return null;
  end if;
  return to_jsonb(v_round);
end;
$$;

revoke execute on function public.record_zolik_hand(uuid, uuid, uuid, int, jsonb) from public, anon;
revoke execute on function public.delete_last_round(uuid) from public, anon;
grant execute on function public.record_zolik_hand(uuid, uuid, uuid, int, jsonb) to authenticated;
grant execute on function public.delete_last_round(uuid) to authenticated;
