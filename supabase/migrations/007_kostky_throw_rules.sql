-- 007: Kostky throw rules.
-- A throw is 0 or a multiple of value_step that is at least min_value; values above
-- max_warning need a confirmation in the app. Existing entries are left as they are.

update public.game_types
set config = config || '{"max_warning": 2000, "min_value": 250, "value_step": 50}'
where id = 'kostky';

-- Records one value. Creates the round when needed and assigns the next seq.
-- Non-zero values must respect the game's min_value and value_step (when configured).
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
  v_config jsonb;
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

  select gt.config into v_config
  from public.sessions s
  join public.game_types gt on gt.id = s.game_type_id
  where s.id = p_session_id;

  if p_value <> 0 and (
    p_value < coalesce((v_config ->> 'min_value')::int, 0)
    or p_value % coalesce((v_config ->> 'value_step')::int, 1) <> 0
  ) then
    raise exception 'value_not_allowed';
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
