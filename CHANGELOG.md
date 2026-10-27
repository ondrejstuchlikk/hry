# Changelog

All notable changes to the app. Newest first. Dates are deploy dates (push to `main`).

## 2026-10-27

### Žolík game page
- A partie now ends after **4 h** without a recorded hand (was 1 h). „Pokračovat v partii“ works within the same 4 h. Existing hands are regrouped accordingly (the split is derived, nothing in the DB changes).
- Big score table next to the entry panel: „Dnešní partie“ (points, hands won) and „Celá hra“ (points, hands won, partie won) in one table. Replaces the small „Dnešní partie“ table.
- „Tabulka kol“ moved to the bottom of the page, below the statistics.
- Progress chart opens in the „Celá hra“ view by default; „Partie“ is still one click away.
- Progress chart moved above the summary table and gained the „Celá hra“ / „Partie“ switch. The whole-game view shows running totals over all hands, with dashed lines where each partie starts.

### Žolík
- New game type Žolík (migration `005_zolik.sql`): one hand per „kolo“, winner gets 0, losers ≥ 1, lower total wins.
- Recording flow: „Kdo vyhrál?“ → jokers kept („Počet žolíků do dalšího kola“) → losers' points; saved atomically via `record_zolik_hand`.
- Random dealer before every hand („Rozdává: …“) and joker reminder across partie.
- Partie are derived inside the endless game (1 h pause or „Pro dnešek konec“; „Pokračovat v partii“ reopens). „Poslední partie“ card on the game page.
- Statistics: summary table, partie wins over time, average per hand, loss histogram, dealer advantage, kept jokers, head-to-head; comparison table in „Celkové statistiky“.
- Terminology: a hand is „kolo“; „hra“ is the whole endless game.

## 2026-10-26

### Appearance and settings
- Dark theme, accent colors, settings page, nicer charts.

### Endless games
- Games never end (migration `004_endless_games.sql`); evenings are derived from a ≥ 1 h pause. Turn order is redrawn on the first visit of each new day.
- Group statistics shown directly on the game page.

### Kostky and basics
- Username + password auth (password ≥ 5 characters), schema, RLS.
- Game list, „Nová hra“ dialog, starting player draw.
- Kostky session screen with keyboard flow, > 10 000 confirmation and „Zpět“ undo.
- Winners, group statistics with charts, overall player statistics and comparison table.
- PWA manifest and icons, GitHub Pages deploy, README.
