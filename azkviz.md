# azkviz.md — Adding the game "AZ-kvíz"

This file describes the third game type, **AZ-kvíz**. It is used to keep score while watching the Czech TV quiz show AZ-kvíz together: whoever answers a question correctly first gets 1 point.

It extends the existing app described in `CLAUDE.md` (and is independent of `zolik.md`). Follow all conventions from `CLAUDE.md`: Czech UI, exact Czech strings in quotes, Supabase + RLS, Vitest for pure logic.

Implement it as a new module `src/games/azkviz/` implementing the common `GameModule` interface. Do not change the behaviour of other games, except for the generic inactivity change described below.

**This game is used mostly on a phone.** Design the episode screen mobile-first.

## Game summary

- 2 or more players. There is no hard upper limit; typically 2–5, rarely up to 10. The UI must handle 10+ players gracefully.
- Each question is recorded with one tap:
  - on the name of the player who answered first correctly → that player gets **1 point**,
  - or on „Nikdo“ → nobody answered correctly, 0 points for everyone.
- The game never ends as a whole. It is divided into **episodes** („epizoda“), one per TV episode watched.
- The player line-up is **fixed for the whole episode**. Nobody joins or leaves mid-episode.

## Terminology (Czech UI)

| Concept | Czech UI term | DB entity |
|---|---|---|
| game name | „AZ-kvíz“ | `game_types` (`id = 'azkviz'`) |
| one episode (session) | „epizoda“ | `sessions` |
| one question | „otázka“ | `rounds` |
| question winner | — | `rounds.winner_player_id` (null = „Nikdo“) |

Strings to use: „Nová epizoda“, „Začít epizodu“, „Pokračovat v epizodě“, „Konec epizody“, „Nikdo“, „Zpět“, „Průběžné statistiky“, „Zpět k zápisu“, „Vítěz epizody“.

Episodes are identified only by their **date** (the date of recording), e.g. „Epizoda 30. 10. 2026“. No episode number, title or note is needed. If two episodes of the same group share a date, append the time (e.g. „30. 10. 2026, 20:15“).

## Database changes

Add a new migration. Do not edit old migrations.

```sql
insert into game_types (id, name, scoring, config) values
  ('azkviz', 'AZ-kvíz', 'higher_better', '{"inactivity_minutes": 180}')
on conflict (id) do update set name = excluded.name, scoring = excluded.scoring, config = excluded.config;
```

Also add it to `supabase/seed.sql`.

### Per-game inactivity timeout (generic change)

AZ-kvíz episodes auto-end after **3 hours** of inactivity. The other games keep their 1 hour.

- Change `close_stale_sessions()` so each session uses `coalesce((game_types.config->>'inactivity_minutes')::int, 60)`.
- Existing games keep working without config changes.
- If a pg_cron job exists, it stays as is.

### Storage rules for one question

- One `rounds` row per question:
  - `round_no` = question number within the episode
  - `winner_player_id` = the player who scored, or **null for „Nikdo“**
- If a player scored, add one `entries` row for that player with `value = 1`. „Nikdo“ questions have no entries.
- No other new columns are needed.
- Add an RPC `record_azkviz_question(session_id, winner_player_id uuid null)`:
  - validates that the session is active and the winner belongs to the session
  - inserts the round (+ entry) atomically
  - updates `last_activity_at`
  - returns the new round
- Undo: the RPC `undo_last_question(session_id)` deletes the round with the highest `round_no`, including its entry.

## Episode flow

### Starting

- From the game list: „Nová epizoda“.
- Pick players by username or guests (min. 2, no max).
- „Začít epizodu“ starts it.
- **No random draw is needed.** Keep the player order as selected.
- Offer to reuse the line-up of the group's last episode with one tap: „Stejní hráči jako minule“.

### Main screen (score entry)

- A grid of **large buttons, one per player, in a fixed order** that never re-sorts during the episode.
  - Each button shows the player's name and, **under the name, their current score** in large digits.
  - Layout:
    - 2–4 players: buttons fill the screen (1–2 columns)
    - more players: 2 columns on phone, 3–4 on desktop
    - always without horizontal scroll
  - Highlight the current leader subtly (e.g. border or crown icon). Do not move the leader.
- A separate, visually distinct button „Nikdo“ (secondary style, full width, below the grid).
- Tapping a player:
  - immediately adds 1 point (optimistic update)
  - shows short visual feedback: a „+1“ pop animation on the button
  - uses haptic feedback via `navigator.vibrate` where supported
- **Accidental double taps:** ignore a second tap on the *same* button within ~400 ms. Make the window a constant.
- Small header info: „Otázka 14“ (number of the next question) and the episode date.
- „Zpět“ (always visible, smaller): undoes the last question, either a point or „Nikdo“.
  - No confirmation needed, but show a toast that names what was undone: „Vráceno: bod pro Ondru“ / „Vráceno: Nikdo“.
- At the bottom, two buttons:
  - „Průběžné statistiky“
  - „Konec epizody“
- Disable double-tap zoom on the buttons (`touch-action: manipulation`).
- If a save fails, show „Nepodařilo se uložit, zkus to znovu“ and roll back the optimistic update.

### „Průběžné statistiky“ (live stats, does not interrupt the episode)

- A separate view of the **same active episode**, e.g. a sub-route or a full-screen panel. It does not end or pause anything.
- A prominent button „Zpět k zápisu“ returns to the score entry. On desktop it can also be a side panel next to the buttons.
- Content (for the current episode):
  - score table: points, share of points %, share of all questions % (see the „Nikdo“ warning below)
  - progression chart: cumulative score per player over question number (line)
  - current streak (who scored the last N questions in a row) and the longest streak in this episode
  - number of „Nikdo“ questions
  - comparison with each player's all-time average points per episode in this group: „Ondra: 12 (průměr 9,4)“

### Ending an episode

- „Konec epizody“ shows the confirmation „Ukončit epizodu?“ with buttons „Ukončit“ / „Zpět“.
- An episode also ends automatically after 3 h of inactivity.
- **Winner = most points.** Ties → all tied players win. An episode with zero points has no winner.
- Summary: „Vítěz epizody: <jméno>“, final scores, number of questions, longest streak of the episode.

## „Nikdo“ warning

The „Nikdo“ button is optional; users may not always press it. Every statistic that depends on the total number of questions must show a small note:

> „Tato statistika je přesná jen tehdy, když se u neuhodnutých otázek mačká tlačítko „Nikdo“.“

This applies to:
- success rate per question
- share of all questions
- number of unanswered questions
- questions per episode

Statistics based only on points do not need the note:
- points
- share of points
- wins
- streaks of consecutive points

For the share-of-points metric, the denominator is the number of scored questions.

## Statistics (AZ-kvíz)

Same scoping as other games: default per group on „Statistiky“, overall per player on „Celkové statistiky“. Add „AZ-kvíz“ to the game-type selector.

**Summary cards (per player):**
- „Vyhrané epizody“ (plus „Remízy“, win rate %), „Odehrané epizody“
- „Body celkem“, „Průměr bodů na epizodu“
- „Podíl bodů“: average share of the episode's scored points %
- „Úspěšnost“: points / all questions incl. „Nikdo“, with the warning
- „Nejlepší epizoda“ (most points, with date)
- „Nejdelší série otázek“: longest run of consecutive questions won within one episode
- „Nejdelší série vyhraných epizod“

**Charts / tables:**
- Cumulative episode wins over time per player (line)
- Points per episode over time per player (line or grouped bar)
- Average share of points per player (bar)
- Score progression within a selected episode (line, x = question number). Use an episode picker; default = latest.
- Head-to-head table in group view (episode wins of each player vs. each other)
- „Neuhodnuté otázky“: share of „Nikdo“ per episode over time, with the warning

Formatting as in `CLAUDE.md` (cs-CZ numbers, dates `d. M. yyyy`, Czech empty states).

## Tests (Vitest)

- episode winner incl. ties and zero-point episode
- double-tap guard (same button within window ignored, different buttons not)
- undo removes the last question (point or „Nikdo“)
- streak calculation (consecutive questions; a „Nikdo“ breaks the streak)
- share-of-points vs. share-of-questions denominators
- per-game inactivity timeout in `close_stale_sessions()` logic (default 60, AZ-kvíz 180)
- episode label with date, plus time when two episodes share a date

## Working order

1. Migration + seed + RPCs + generic inactivity timeout
2. Module skeleton + „Nová epizoda“
3. Score entry screen (buttons, „Nikdo“, „Zpět“, feedback, double-tap guard)
4. „Průběžné statistiky“ view
5. Ending an episode + summary
6. Statistics pages
7. Commit after each step.

Ask the user before making product decisions not covered here or in `CLAUDE.md`.
