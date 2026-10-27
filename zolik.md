# zolik.md — Adding the game "Žolík"

This file describes the second game type, **Žolík** (a rummy-like card game). It extends the existing app described in `CLAUDE.md`. Follow all conventions from `CLAUDE.md` (Czech UI, exact Czech strings in quotes, responsive laptop + phone, per-game module in `src/games/`, Supabase + RLS, Vitest for pure logic).

Implement Žolík as a new module `src/games/zolik/` implementing the common `GameModule` interface. Do not break or change Kostky behaviour.

## Game summary

- 2 or more players.
- In each hand one player **wins**. The winner gets **0 points**.
- **Every other player** counts the value of their remaining cards. That value is recorded as their points for the hand. The value is always **≥ 1**; 0 is not allowed for a loser.
- **Fewer points is better** (`scoring = 'lower_better'`).
- Before each hand a player shuffles and deals. The dealer is **drawn randomly before every hand**.
- If the winner has jokers left, they can keep them for the next hand: **0–4 jokers**. Only the winner can keep jokers.
- There is no target score and the game never "ends" as a whole. Only individual evenings (sessions) end.

## Terminology (Czech UI)

| Concept | Czech UI term | DB entity |
|---|---|---|
| one hand | „kolo“ (e.g. „Kolo 7“) | `rounds` |
| one evening (part of the endless game) | „partie“ | derived from `rounds` (1 h pause or `ends_partie`) |
| hand winner | „výherce“ | `rounds.winner_player_id` |
| dealer | „rozdává“ | `rounds.dealer_player_id` |
| jokers kept for next hand | „žolíky do dalšího kola“ | `rounds.jokers_kept` |

Like Kostky, a Žolík **game** („hra“) is endless and defined by the game type + the set of players; it is created with „Nová hra“ / „Začít hru“ and listed under „Moje hry“. Inside a game, rounds are grouped into **partie** (one evening each): a partie ends with „Pro dnešek konec“ (sets `rounds.ends_partie` on its last round) or after a pause of ≥ 1 h, and the next recorded round automatically starts a new partie. „Pokračovat v partii“ reopens a partie ended by mistake (within 1 h). Use „Vítěz partie“ for the partie result. Do not rename anything in Kostky.

## Database changes

Add a new migration. Do not edit old migrations.

```sql
-- game type
insert into game_types (id, name, scoring, config) values
  ('zolik', 'Žolík', 'lower_better',
   '{"max_warning": 200, "max_jokers": 4, "min_loser_value": 1}')
on conflict (id) do update set name = excluded.name, scoring = excluded.scoring, config = excluded.config;

-- per-hand metadata (nullable, unused by Kostky)
alter table rounds add column dealer_player_id uuid references players(id);
alter table rounds add column jokers_kept int check (jokers_kept between 0 and 4);
```

Also add `zolik` to `supabase/seed.sql`.

### Storage rules for one hand

- One `rounds` row with `winner_player_id`, `dealer_player_id`, `jokers_kept`.
- One `entries` row for **every** player of the partie:
  - the winner gets `value = 0`
  - each loser gets their points, `value ≥ 1`

  Every player therefore has an entry in every hand, and totals are plain sums.
- A hand is saved **atomically and only when complete**: winner, jokers and all losers' points. Add an RPC `record_zolik_hand(session_id, dealer_player_id, winner_player_id, jokers_kept, loser_values jsonb)`. It validates the input, inserts the round and all entries in one transaction, and updates `last_activity_at`. Partially entered hands live only in client state and are discarded if the partie ends.
- The dealer for the *upcoming* hand is drawn client-side and is only persisted together with the hand.
  - Persist the draw in `localStorage` keyed by session id, so a page reload does not redraw.
  - Wrap `localStorage` access in try/catch.

## Partie flow

### Starting a partie

Same as Kostky: „Nová hra“, select players by username or guests (min. 2), then „Začít hru“ (opens the existing game of the same players). Turn order is not relevant for Žolík. Store a random order anyway for display.

### Before each hand

1. Randomly draw the dealer with a short animation and show it big: „Rozdává: <jméno>“.
2. **Joker reminder.** If the most recent completed hand of the **same group** (`group_key`) had `jokers_kept > 0`, show a clearly visible notice:
   - „<jméno> má z minulého kola 1 žolíka“
   - Use the correct Czech plural: 1 žolíka, 2–4 žolíky.

   This must work **across partie boundaries**: if the last hand of the group was played last week in a previous partie, the reminder still appears at the start of the first hand of the new partie. This is the main purpose of the reminder. Once the next hand is recorded, the reminder is gone (it then reflects that hand's `jokers_kept`).

### Recording a hand — minimize clicks

Sequence: **1) winner → 2) jokers → 3) losers' points.**

1. **Výběr výherce.** Header „Kdo vyhrál?“ with one large button per player (big touch targets; on mobile a full-width stack). A single click selects the winner.
2. **Jokers dialog** opens immediately: title „Počet žolíků do dalšího kola“.
   - Large number display, default **0**.
   - Big buttons „−“ and „+“, clamped to 0–4.
   - Button „OK“ (primary, focused by default, so Enter confirms 0).
   - A link „Zpět“ to go back to winner selection.
3. **Points of losers.** Focus jumps automatically to the points input of the first loser.
   - Show one input per loser, in the partie's player order, labelled „Body: <jméno>“.
   - Enter (or „Zapsat“) moves focus to the next loser.
   - After the last loser, the hand is saved via `record_zolik_hand`, the next dealer is drawn, and the screen resets to step 1.
   - With 2 players there is exactly one loser input, so the flow is click winner → OK → type points → Enter.
   - Validation: integer ≥ 1. If the value is 0 or empty, show the inline error „Proherce musí mít alespoň 1 bod“ and do not save.
   - If any value is > 200, show a confirmation dialog „Opravdu <hodnota>? To je víc než 200.“ with buttons „Ano“ / „Opravit“, the same pattern as Kostky. The threshold comes from `game_types.config.max_warning`.
   - Inputs use `inputMode="numeric"`.

**„Zpět“ (undo):**
- While entering a hand, it steps back one step (points → jokers → winner).
- On an empty, fresh hand, it offers „Smazat poslední kolo?“. On confirmation it deletes the last saved hand (round + entries).

No keyboard shortcuts are required beyond Enter/Tab/focus handling.

### Score table (next to the entry panel)

- One big table, rows = players, two column groups:
  - „Dnešní partie“: „Body“ and „Kola“ (hands won) of the partie in progress; „–“ when no partie is in progress. 👑 next to the name marks the partie leader (**lowest** total).
  - „Celá hra“: „Body“, „Kola“ (hands won) and „Partie“ (finished partie won) over the whole endless game; the lowest total is highlighted.
- Large type on both phone and laptop; it is the main thing players look at between hands.

### „Tabulka kol“ (bottom of the game page)

- Table with columns = players and rows = hands („Kolo 1“, „Kolo 2“, …, numbered within the partie), newest on top on mobile.
- Each row shows the points; mark the winner (e.g. ★ and „0“) and the dealer (small icon/label).
- Show a joker icon with the count when `jokers_kept > 0`.
- Totals row; highlight the current leader, which is the **lowest** total.
- Placed below the statistics: it is a detail, not needed during play.

### Ending a partie

- „Pro dnešek konec“ ends the partie manually. As with Kostky, it also ends automatically after 1 h of inactivity (existing `close_stale_sessions()`).
- Since hands are saved only when complete, there is no incomplete-round dialog for Žolík. If a hand is partially entered, ask „Rozehrané kolo se neuloží. Ukončit?“ with buttons „Ukončit“ / „Zpět“.
- **Winner of the partie = lowest total.** Ties → all tied players win. A partie with zero hands has no winner.
  - Make the existing winner logic generic via `game_types.scoring`, if it isn't already.
- Summary card „Poslední partie“ on the game page: „Vítěz partie: <jméno>“, totals, number of hands won per player, worst loss of the evening.

### Game page layout (top to bottom)

1. Entry panel + score table (side by side on laptop, stacked on phone)
2. „Poslední partie“ card
3. „Statistiky“: progress chart, summary table, other charts
4. „Tabulka kol“

## Statistics (Žolík)

Same scoping as Kostky: default per group on „Statistiky“, overall per player on „Celkové statistiky“. Add a game-type selector (Kostky / Žolík) if not present.

**Summary cards (per player):**
- „Vyhrané partie“ (plus „Remízy“, win rate %), „Odehrané partie“
- „Vyhraná kola“, „Odehraná kola“, win rate of hands %
- „Průměr bodů při prohře“ (mean of entries with value ≥ 1)
- „Průměr bodů na kolo“ (including 0 for wins)
- „Nejhorší prohra“ (max single value, with date)
- „Nejlepší partie“ (lowest partie total, with date), „Nejhorší partie“

**Charts / tables:**
- Cumulative partie wins over time per player (line)
- Average points per hand per partie over time (line)
- „Průběh celé hry“ / „Průběh partie“ (line, x = hand number), shown **above** the summary table. Switch „Celá hra“ (default; running totals over the whole endless game, dashed line where each partie starts) / „Partie“ (one partie, picker, default = latest). „Celkové statistiky“ only has the partie view.
- Distribution of losing values (histogram; buckets as constants, e.g. 1–10, 11–25, 26–50, 51–100, 101–200, >200)
- **Dealer advantage:** win rate of the dealer vs. non-dealers, and per player „Vyhrává, když rozdává“ vs. „Vyhrává, když nerozdává“. Show the expected baseline 1/n for comparison.
- **Jokers:**
  - „Ponechané žolíky“: how often and how many jokers each player kept
  - win rate of the hand *following* a hand where the player kept ≥ 1 joker, vs. their overall hand win rate
  - joker carry-overs count across partie boundaries too: use the previous hand in the same group
- Head-to-head table in group view (partie wins of each player vs. each other)
- Streaks: „Nejdelší série vyhraných kol“, „Nejdelší série vyhraných partií“

Formatting as in `CLAUDE.md` (cs-CZ numbers, dates `d. M. yyyy`, Czech empty states).

## Tests (Vitest)

- dealer draw (uniform, from session players only)
- jokers clamp 0–4
- loser validation (≥ 1, warning > 200)
- partie winner with `lower_better`, including ties and empty partie
- joker reminder lookup across partie boundaries (same `group_key`, latest hand)
- Czech plural for „žolík“ (1 žolíka / 2–4 žolíky)
- dealer-advantage and post-joker win-rate calculations

## Working order

1. Migration + seed + RPC `record_zolik_hand`
2. Žolík module skeleton + „Nová hra“
3. Hand recording flow (winner → jokers → points), dealer draw, joker reminder
4. Scoreboard + ending a partie + generic winner logic
5. Statistics
6. Commit after each step.

Ask the user before making product decisions not covered here or in `CLAUDE.md`.
