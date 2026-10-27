# Hry – skóre

A small web app for logging tabletop game results among friends (first game: **Kostky**) with statistics and charts.
React + Vite + TypeScript, Tailwind, Recharts, Supabase; hosted on GitHub Pages.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → run these files in order (paste each file's contents and click *Run*):
   1. `supabase/migrations/001_schema.sql`
   2. `supabase/migrations/002_functions.sql`
   3. `supabase/migrations/003_rls.sql`
   4. `supabase/migrations/004_endless_games.sql`
   5. `supabase/migrations/005_zolik.sql`
   6. `supabase/seed.sql`
3. **Authentication → Sign In / Providers → Email**: turn **off „Confirm email“**.
   (Users sign in with a username; the app maps it to a synthetic email `<username>@ondrejstuchlikk.github.io`
   — see `AUTH_EMAIL_DOMAIN` in `src/lib/auth.ts`. No mail is ever sent. If signup fails with an
   "invalid email" error, change that constant to another domain.)
4. **Project Settings → API**: copy the *Project URL* and the *anon public* key.

Passwords: any characters, at least 5. Supabase requires at least 6, so the app appends the hidden suffix
`#hry` (`PASSWORD_SUFFIX` in `src/lib/auth.ts`). Keep Supabase's **Password requirements** at "No required characters".

Password reset: there is no reset flow. An admin can set a new password in **Authentication → Users** —
enter the new password **with `#hry` appended** (user's password `abcde` → enter `abcde#hry`).

### 2. GitHub Pages

1. Repository **Settings → Secrets and variables → Actions** → add secrets
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. **Settings → Pages** → Source: **GitHub Actions**.
3. Push to `main` (or run the workflow manually). The app is served at `https://<user>.github.io/<repo>/`.
   The base path is taken from the repository name automatically (`VITE_BASE`).

### 3. Local development

```sh
npm install
cp .env.example .env.local   # fill in the Supabase URL and anon key
npm run dev
```

Other scripts: `npm test` (Vitest), `npm run build`, `npm run lint`, `npm run icons` (regenerate PWA icons).

## How games work

Games never end: there is one endless game per game type and set of players („Nová hra“ with the
same players opens it). The turn order is redrawn on the first visit of each new day. For wins and
statistics, a game is split into evenings — a pause of at least an hour starts a new evening
(`src/games/kostky/evenings.ts`). The game page shows the entry panel, the group's charts and the
score table; „Celkové statistiky“ compares players across all games.

## Structure

```
src/lib/          Supabase client, auth (username ↔ email), API calls, formatting
src/games/        GameModule interface (types.ts) + registry (index.ts)
src/games/kostky/ Kostky: turn/winner logic, session screen, result, statistics
src/pages/        Login, Games, Session, Stats, OverallStats
src/components/   Shared UI (Dialog, NewSessionDialog, charts, …)
supabase/         SQL migrations, seed, optional pg_cron job
```

Adding a game (e.g. Žolík): create `src/games/zolik/` implementing `GameModule` and register it in
`src/games/index.ts`. The database already supports it (`game_types.scoring`/`config.round_complete`,
`rounds.winner_player_id`, entries not required for every player).
