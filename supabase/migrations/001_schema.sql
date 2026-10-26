-- 001: Core tables and indexes.

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_-]{3,20}$'),  -- lowercase
  created_at timestamptz default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete set null,  -- null = guest
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  created_by uuid references public.profiles(id),  -- for guests: owner
  created_at timestamptz default now()
);

create table public.game_types (
  id text primary key,
  name text not null,
  scoring text not null check (scoring in ('higher_better', 'lower_better')),
  config jsonb not null default '{}'
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  game_type_id text not null references public.game_types(id),
  created_by uuid not null references public.profiles(id),
  group_key text not null,  -- sorted player ids joined by ','
  status text not null default 'active' check (status in ('active', 'ended')),
  ended_reason text check (ended_reason in ('manual', 'inactivity')),
  started_at timestamptz default now(),
  last_activity_at timestamptz default now(),
  ended_at timestamptz,
  winner_player_ids uuid[]  -- set when ended (array to allow ties)
);

create table public.session_players (
  session_id uuid references public.sessions(id) on delete cascade,
  player_id uuid references public.players(id),
  turn_order int not null,  -- 0 = starts
  primary key (session_id, player_id),
  unique (session_id, turn_order)
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  round_no int not null,  -- 1-based
  winner_player_id uuid references public.players(id),  -- used by žolík, null for kostky
  created_at timestamptz default now(),
  unique (session_id, round_no)
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,  -- denormalized
  player_id uuid not null references public.players(id),
  value int not null check (value >= 0),
  seq int not null,  -- global order within session (for undo)
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id),
  unique (round_id, player_id),
  unique (session_id, seq)
);

create index entries_player_id_idx on public.entries (player_id);
create index entries_session_id_idx on public.entries (session_id);
create index sessions_group_key_idx on public.sessions (group_key);
create index sessions_status_idx on public.sessions (status);
create index session_players_player_id_idx on public.session_players (player_id);
