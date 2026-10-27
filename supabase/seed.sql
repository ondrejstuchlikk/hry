-- Game types. Safe to run repeatedly.
insert into public.game_types (id, name, scoring, config) values
  ('kostky', 'Kostky', 'higher_better', '{"max_warning": 10000, "round_complete": "all_players"}'),
  ('zolik', 'Žolík', 'lower_better', '{"max_warning": 200, "max_jokers": 4, "min_loser_value": 1}')
on conflict (id) do update
  set name = excluded.name,
      scoring = excluded.scoring,
      config = excluded.config;
