# ♠ Blackjack Daily

A once-a-day blackjack game, Wordle style. Everyone gets the **same shuffled shoe**, plays
**20 hands with $1,000 in play chips**, and sits at a 5-seat table with four of Bertan's AI bots.
Finish with the biggest bankroll to top the daily, monthly and all-time leaderboards, then share
your emoji grid.

Play money only. No real-money gambling.

This folder is a self-contained project inside the repo. It **reads** the original bots and
models in `../Backend/Bots` (via `tools/export_models.py`) but never modifies anything outside
`Blackjack-V2/`.

## Modes

| Mode | Ranked | Runs |
|---|---|---|
| **Daily Table #N** | ✅ (online) | Server-side in a Supabase Edge Function, so the shoe never reaches the browser |
| **Practice** | – | In the browser. Coach toggle shows basic strategy and the Hi-Lo count |
| **Bot Lounge** | – | In the browser. All six bots play nonstop with live profit sparklines |

Without Supabase configured, the Daily Table runs offline (seeded by date, saved on-device,
refresh-proof via action-log replay) and the leaderboard shows your local history.

## Rules

6 decks · dealer stands on soft 17 · blackjack pays 3:2 · dealer peeks on A/10 · double any two
(incl. after split) · split to 4 hands, split Aces get one card · late surrender · insurance 2:1 ·
bets $10–$500 in $10 steps · reshuffle at 75% penetration.

## The bots

| Bot | Model | First move | Later moves | Bets |
|---|---|---|---|---|
| Bot 1 · Counter | Bertan's basic strategy table (exported verbatim) | strategy | strategy | Hi-Lo |
| Bot 2 · Echo | NN trained on Bot 1 | NN | hit < 17 | Hi-Lo |
| Bot 3 · Mirror | NN trained on Bertan | NN | hit < 17 | Hi-Lo |
| Bot 4 · Forest | Random forest (retrained compact, 40 trees) | forest | hit < 17 | Hi-Lo |
| Bot 5 · Sapling | Decision tree (original, exact) | tree | hit < 17 | Hi-Lo |
| Bot 6 · Q | Q-learning table | Q-table | Q-table | Hi-Lo |

Each day seats Forest and Counter plus two rotating bots. A model move that isn't legal
(e.g. split on a non-pair) falls back to basic strategy, and the bot's speech bubble says so.

## Layout

```
packages/engine   pure TS rules: seeded shoe, reducer → events, publicView (zero deps)
packages/bots     bot brains, model runtimes, Hi-Lo betting, runner; models/*.json
web/              Vite + React 19 + Tailwind 4 + Framer Motion + Zustand
supabase/         migrations (schema, RLS, leaderboard views) + `daily` Edge Function
tools/            export_models.py (Python 3.9 + scikit-learn 1.2.2)
scripts/          sim.ts (headless bot sim), sync-shared.mjs
```

## Develop

```bash
npm install
npm test                    # engine, bots (parity with Python), edge-function logic
npm run sim -- --hands 20000
npm run dev                 # http://localhost:5173
```

## Re-export the models (optional)

```bash
/usr/bin/python3 -m venv tools/.venv
tools/.venv/bin/pip install -r tools/requirements.txt
tools/.venv/bin/python tools/export_models.py
```

The random forest is retrained from `blackjack_dataset.csv` because the original pickle is 44 MB.
The compact one has the same holdout accuracy (81.7%) and agrees with the original on ~96% of
decisions. `fixtures.json` holds 2,000 Python predictions, and the TS runtimes must match all of them.

## Online backend (Supabase)

Live project: `blackjack-daily` (`cvriqaeqmzitoikvlrmv`). `web/.env` points at it.

- **Players:** each browser generates a random secret player key (kept in localStorage). The server
  stores only `sha256(key)` as the player id, so there's no signup and no auth provider to enable.
  Clearing site data starts a fresh player.
- **Server:** the `daily` Edge Function (`supabase/functions/daily`, `verify_jwt = false`, it checks the
  player key itself) runs the table and stores state in `daily_runs`. A trigger copies finished runs
  into the public `daily_scores` table, which the leaderboard views read.
- **Models:** the function downloads the bot models from this repo on GitHub, pinned to a commit
  (`MODELS_COMMIT` in `index.ts`). Set the `MODELS_BASE_URL` secret to host them elsewhere.

To redeploy after changing the engine or bots: `npm run sync:shared`, then deploy
`supabase/functions/daily` (CLI: `npx supabase functions deploy daily --project-ref cvriqaeqmzitoikvlrmv`).

To host the web app, deploy `web/` to Vercel (root `Blackjack-V2`, build `npm run build`,
output `web/dist`) with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set.
