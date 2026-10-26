# CLAUDE.md — Game Stats App ("Kostky")

## Project overview

A small web app for logging the results of tabletop games played among friends and showing statistics and charts across **all games ever played**. The first supported game is **Kostky** (dice). A second game, **Žolík** (rummy-like card game), will be added later. Do NOT implement Žolík now, but the data model must support it without migrations of existing data (see "Future: Žolík").

- **All user-facing text must be in Czech.** Code, comments, commit messages and identifiers in English.
- Exact Czech UI strings given in this file must be used verbatim (they are marked with quotes, e.g. „Pro dnešek konec“).
- Used mostly on a **laptop**, sometimes on a **phone** → fully responsive, both layouts must feel native (mobile-first CSS, comfortable desktop layout).
- Small private user base (a few friends). Security matters only at a "reasonable" level; simplicity beats sophistication.

## Tech stack

- **Frontend:** React + Vite + TypeScript
- **Routing:** `HashRouter` (required for GitHub Pages — no server-side rewrites)
- **Styling:** Tailwind CSS
- **Charts:** Recharts
- **Backend:** Supabase (Postgres, Auth, Row Level Security, RPC functions)
- **Supabase client:** `@supabase/supabase-js`
- **Hosting:** GitHub Pages, deployed via GitHub Actions on push to `main`
- **PWA:** add a web manifest + icons so it can be "added to home screen" (offline support not required)

### Config / secrets

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env.local` locally; in CI from GitHub repository secrets.
- Vite `base` must match the repo name for GitHub Pages (`/<repo-name>/`). Make it configurable.
- Provide `.env.example`. Never commit real keys (the anon key is public by design, but keep it out of git anyway).

## Authentication (username + password)

Supabase Auth requires an email. Users must only ever see **username + password**.

- Map username → synthetic email: `${username.toLowerCase()}@${AUTH_EMAIL_DOMAIN}`. Keep `AUTH_EMAIL_DOMAIN` as a single constant. Verify that Supabase accepts the chosen domain during signup; pick a different one if it is rejected.
- In the Supabase dashboard, **"Confirm email" must be disabled** (document this in the README setup steps).
- Username rules: 3–20 chars, `a-z`, `0-9`, `_`, `-`, case-insensitive, unique.
- Password: minimum 6 characters (Supabase default). No password reset flow needed (document that an admin can reset it in the Supabase dashboard).
- On signup create a row in `profiles` and a linked row in `players` (via a DB trigger on `auth.users` insert, or an RPC — prefer a trigger reading `raw_user_meta_data.username`).
- Session persists in the browser (Supabase default).

## Core concepts

- **Player** — someone who plays. Either linked to a user account or a **guest** (no account, created by a user, display name only).
- **Game type** — `kostky` now, `zolik` later. Holds config such as scoring direction.
- **Session** („hra“ / instance) — one evening of play of one game type by a fixed set of players. Has a randomly drawn turn order. Ends via the button „Pro dnešek konec“ or automatically after **1 hour of inactivity**.
- **Round** — one cycle in which every player in the session takes one turn (kostky). For žolík a round = one hand.
- **Entry** — one recorded value for one player in one round.
- **Group** — the exact set of players of a session. Stats are by default scoped to the group (e.g. the pair A+B). Computed via `sessions.group_key`.

## Database schema

Put everything in `supabase/migrations/` as SQL files (numbered). Also provide `supabase/seed.sql` that inserts the game types.

```sql
-- profiles: one per auth user
profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,          -- lowercase
  created_at timestamptz default now()
)

-- players: account players and guests
players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references profiles(id) on delete set null,  -- null = guest
  display_name text not null,
  created_by uuid references profiles(id),   -- for guests: owner
  created_at timestamptz default now()
)

game_types (
  id text primary key,                 -- 'kostky', 'zolik'
  name text not null,                  -- 'Kostky', 'Žolík' (Czech display name)
  scoring text not null check (scoring in ('higher_better','lower_better')),
  config jsonb not null default '{}'   -- e.g. {"max_warning": 10000}
)

sessions (
  id uuid primary key default gen_random_uuid(),
  game_type_id text not null references game_types(id),
  created_by uuid not null references profiles(id),
  group_key text not null,             -- sorted player ids joined by ','
  status text not null default 'active' check (status in ('active','ended')),
  ended_reason text check (ended_reason in ('manual','inactivity')),
  started_at timestamptz default now(),
  last_activity_at timestamptz default now(),
  ended_at timestamptz,
  winner_player_ids uuid[]             -- set when ended (array to allow ties)
)

session_players (
  session_id uuid references sessions(id) on delete cascade,
  player_id uuid references players(id),
  turn_order int not null,             -- 0 = starts
  primary key (session_id, player_id),
  unique (session_id, turn_order)
)

rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  round_no int not null,               -- 1-based
  winner_player_id uuid references players(id),   -- used by žolík, null for kostky
  created_at timestamptz default now(),
  unique (session_id, round_no)
)

entries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,  -- denormalized for fast queries
  player_id uuid not null references players(id),
  value int not null check (value >= 0),
  seq int not null,                    -- global order within session (for undo)
  created_at timestamptz default now(),
  created_by uuid references profiles(id),
  unique (round_id, player_id),
  unique (session_id, seq)
)
```

Indexes: `entries(player_id)`, `entries(session_id)`, `sessions(group_key)`, `sessions(status)`, `session_players(player_id)`.

Trigger: inserting/deleting an entry updates `sessions.last_activity_at`.

### Row Level Security

Enable RLS on all tables. Helper SQL function `my_player_id()` returns the player id of `auth.uid()`.

- `profiles`: any authenticated user can `select` (needed to find players by username); users update only their own row.
- `players`: authenticated users can `select` all account players and guests they created or that appear in a session they participate in. Insert guests with `created_by = auth.uid()`.
- `game_types`: readable by all authenticated users.
- `sessions`, `session_players`, `rounds`, `entries`: a user can read/write a session if they are its creator **or** one of its account players. Write access to entries only while `status = 'active'`.

Keep policies simple and readable; add a short comment above each.

### RPC functions (SQL, `security definer` where needed)

- `create_session(game_type_id, player_ids uuid[])` → shuffles players randomly (draw who starts), inserts `sessions`, `session_players`, computes `group_key`, returns session id. The creator's own player must be included.
- `end_session(session_id, reason)` → sets status, `ended_at`, and computes `winner_player_ids` (see "Winner rules").
- `close_stale_sessions()` → ends every active session with `last_activity_at < now() - interval '1 hour'` (reason `inactivity`, `ended_at = last_activity_at`). Called by the client on app load and before showing the session list. Additionally, if `pg_cron` is available, schedule it every 10 minutes (document as optional in README).
- Stats RPCs/views as needed (see Statistics). Prefer SQL views/functions for aggregations instead of downloading all entries, but keep it pragmatic — the dataset is small (tens of thousands of rows at most), so client-side aggregation of a filtered set is acceptable where it keeps code simpler.

## Winner rules

- **Kostky** (`higher_better`): the winner is the player with the **highest total** in the session.
- Only **complete rounds** count toward the winner: if the session ends mid-round, ignore the incomplete last round when comparing totals (but keep those entries for per-throw statistics).
- Ties → all tied players are winners (`winner_player_ids` has several ids). Sessions with zero complete rounds have no winner.
- When the user clicks „Pro dnešek konec“ in the middle of a round, show a dialog: „Kolo ještě není dohrané. Poslední nedokončené kolo se do výsledku nezapočítá.“ with buttons „Ukončit“ and „Dohrát kolo“.
- **Žolík** (later, `lower_better`): winner = lowest total. Implement the winner logic generically based on `game_types.scoring`.

## Pages / UI (Czech)

Top nav: „Hry“, „Statistiky“, „Celkové statistiky“, username + „Odhlásit“.

1. **Přihlášení / Registrace** — tabs „Přihlásit se“ / „Registrovat“; fields „Uživatelské jméno“, „Heslo“. Clear Czech error messages (e.g. „Uživatelské jméno je už obsazené“, „Špatné jméno nebo heslo“).

2. **Hry (home)** — choose game type (cards; only „Kostky“ active now, „Žolík“ can be shown as „Již brzy“ disabled).
   - List of **active sessions** for the user → „Pokračovat“.
   - Button „Nová hra“ → dialog:
     - Add players: by username („Přidat hráče podle jména“) with autocomplete, or „Přidat hosta“ (display name; reuse previously created guests from a dropdown).
     - Current user is pre-added. Minimum 2 players.
     - „Začít hru“ → calls `create_session`, then shows an animated draw: „Začíná: <jméno>“.
   - List of recent ended sessions (date, players, winner) — clickable to a read-only session detail.

3. **Session screen — Kostky (most important screen, optimize heavily)**
   - Big header: „Na řadě: <jméno>“, round number („Kolo 5“).
   - One large numeric input, **autofocused at all times**. On mobile use `inputMode="numeric"`, `pattern="[0-9]*"`.
   - **Enter** (or a large „Zapsat“ button) saves the entry and immediately moves to the next player in turn order; the input is cleared and focused again. No other clicks needed.
   - Validation: integer ≥ 0. **0 is valid and common** — make sure an empty input is not treated as 0; empty input + Enter does nothing.
   - If value > 10 000: confirmation dialog „Opravdu <hodnota>? To je víc než 10 000.“ with buttons „Ano“ (save) and „Opravit“ (back to input with value selected). Enter in the dialog = „Ano“, Esc = „Opravit“. Threshold comes from `game_types.config.max_warning`.
   - Button „Zpět“ (and keyboard shortcut Ctrl+Z when input is empty): deletes the last entry (highest `seq`) and returns the turn to that player.
   - Scoreboard: table with players as columns, rounds as rows, totals at the bottom, current leader highlighted. On desktop show next to the input; on mobile below it, newest round on top.
   - Small live stats for the session: average per throw for each player, number of zeros.
   - Button „Pro dnešek konec“ → ends the session (with the incomplete-round dialog when relevant), then shows a summary: winner („Vítěz: <jméno>“), totals, best throw of the night, then link to stats.
   - Writes are optimistic but must handle errors (show „Nepodařilo se uložit, zkus to znovu“ and keep the value in the input).
   - Only one device writes per session at a time; no realtime sync required. But when opening a session, always load fresh data from the DB.

4. **Statistiky (per group — default)**
   - Group selector at the top: all groups the user has played in, labelled by player names (e.g. „Ondra & Rob“), default = most recently played group. Game type selector (Kostky).
   - Content described in Statistics section.

5. **Celkové statistiky (overall)**
   - Same structure, but for a selected player across **all** sessions regardless of co-players. Player selector (default = me). Include a comparison table of all players the user has played with.

## Statistics (Kostky)

All stats are computed over **all ended and active sessions** in the selected scope (group or player). Every stat block has a Czech title. Suggested set:

**Summary cards (per player):**
- „Vyhrané hry“ — number of sessions won (e.g. A: 12, B: 6), plus „Remízy“ and win rate %
- „Odehrané hry“, „Počet hodů“
- „Průměr na hod“, „Medián“, „Nejvyšší hod“ (with date)
- „Podíl nul“ (% of throws equal to 0)
- „Průměrný součet za hru“, „Nejlepší večer“ (highest session total, with date)

**Charts:**
- Wins over time — cumulative wins per player (line chart, x = session date)
- Average per throw per session over time (line, one line per player, optional moving average)
- Distribution of throw values — histogram with sensible buckets (0, 1–100, 101–300, …, >5000; make bucket edges a constant)
- Total per session — bar chart, players side by side
- Starting player advantage — win rate of the player who started vs. others
- Streaks: „Nejdelší série nul“, „Nejdelší série vítězství“
- Head-to-head table in group view: for each pair of players wins vs. losses
- Throws by time of day (average value by hour) — nice-to-have

Number formatting: Czech locale (`toLocaleString('cs-CZ')`, e.g. „12 345“), dates `d. M. yyyy`.

Empty states in Czech („Zatím žádné odehrané hry“).

## Future: Žolík (do NOT implement now)

Context so the design stays compatible:
- A round = one hand. One player wins the hand (gets 0 points), one player loses and records the value of their cards. Other players get nothing recorded for that round (or 0 — decide later).
- UI will have a button row „Kdo vyhrál“ to pick the hand winner, then focus jumps to the input for the loser's points.
- Lower total = better (`scoring = 'lower_better'`).
- This is supported by: `rounds.winner_player_id`, entries not required for every player in a round, `game_types.scoring`/`config`.
- Therefore: **do not hardcode "every player has an entry in every round"** outside of Kostky-specific code. Put game-specific logic (turn handling, entry UI, winner rules, stats set) behind a per-game module, e.g. `src/games/kostky/` with a common interface in `src/games/types.ts`, so `src/games/zolik/` can be added later.

## Project structure (suggested)

```
src/
  lib/supabase.ts          # client
  lib/auth.ts              # username ↔ email mapping, signup/login
  lib/format.ts            # cs-CZ number/date formatting
  games/types.ts           # GameModule interface
  games/kostky/            # session screen, winner logic, stats
  pages/                   # Login, Games, Session, Stats, OverallStats
  components/              # shared UI (Dialog, Button, PlayerPicker, charts)
supabase/
  migrations/
  seed.sql
.github/workflows/deploy.yml
README.md                  # setup steps (in Czech or English, keep it short)
```

## Setup steps to document in README

1. Create Supabase project; run migrations (SQL editor or Supabase CLI); run `seed.sql`.
2. Auth settings: disable „Confirm email“.
3. Optional: enable `pg_cron` and schedule `close_stale_sessions()`.
4. Create GitHub repo, add secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; enable GitHub Pages with source „GitHub Actions“.
5. Local dev: `npm install`, `.env.local`, `npm run dev`.

## Working rules for the agent

- Build iteratively: (1) schema + RLS + auth, (2) game list + new session + draw, (3) Kostky session screen, (4) ending sessions + winners + inactivity, (5) group statistics, (6) overall statistics, (7) PWA + deploy. Commit after each step.
- Test the session screen keyboard flow carefully (Enter → next player, 0 values, >10 000 dialog, „Zpět“).
- Write unit tests (Vitest) for pure logic: turn order, winner computation incl. incomplete rounds and ties, histogram bucketing, streaks.
- Ask the user before making product decisions not covered here.
