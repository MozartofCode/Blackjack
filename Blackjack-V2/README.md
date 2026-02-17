# 🃏 Casino Royale V2 — Blackjack API Server

A modern, session-based Blackjack API server with multi-player support, game history tracking, and rate limiting. Built as a standalone replacement for the legacy Flask + Smart Contract backend.

## ✨ Features

- **Multi-player sessions** — Each player gets an isolated game table with their own deck, hands, and balance
- **Full Blackjack rules** — 5-deck shoe, 3:2 blackjack payout, dealer stands on 17+
- **Game history & stats** — Per-session round history, win rates, streaks, and server-wide statistics
- **Security hardened** — Helmet headers, CORS lockdown, input sanitization, 10kb body limit
- **Rate limiting** — Protect against abuse with configurable request limits
- **Custom error classes** — Typed errors (400, 404, 410, 503) — no fragile string matching
- **Auto-cleanup** — Inactive sessions expire automatically (configurable TTL)
- **Graceful shutdown** — Cleans up sessions and connections on SIGTERM/SIGINT
- **Zero dependencies on legacy backend** — Game engine fully ported to JavaScript
- **Environment-based config** — All settings configurable via `.env`
- **41 E2E tests** — Comprehensive coverage for validation, edge cases, and security

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Copy environment config (optional — defaults are sensible)
cp .env.example .env

# Start the server (with auto-restart on file changes)
npm run dev

# Or start normally
npm start
```

The server runs at **http://localhost:3000** by default.

## 🔌 API Reference

### Health & Info

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Server health, uptime, session count |
| `GET` | `/api/stats` | Global game statistics across all sessions |

### Session Management

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/api/sessions` | `{ playerName?, startingBalance? }` | Create a new game table |
| `GET` | `/api/sessions` | — | List all active sessions |
| `GET` | `/api/sessions/:id` | — | Get session metadata |
| `DELETE` | `/api/sessions/:id` | — | Leave the table (returns final stats) |

### Game Actions

All game routes require a valid `:sessionId` from session creation.

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `GET` | `/api/game/:id/state` | — | Full game state with computed values |
| `POST` | `/api/game/:id/bet` | `{ bet: number }` | Place a bet (min $10) |
| `POST` | `/api/game/:id/hit` | — | Player draws a card |
| `POST` | `/api/game/:id/stand` | — | Player ends their turn |
| `POST` | `/api/game/:id/action` | `{ action: "H"\|"S" }` | Generic player action |
| `POST` | `/api/game/:id/house` | — | House plays (resolves the round) |
| `POST` | `/api/game/:id/new-round` | — | Reset and deal fresh cards |
| `POST` | `/api/game/:id/begin-round` | `{ bet: number }` | New round + bet in one call |

### History & Stats

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/game/:id/history` | Round-by-round history for a session |
| `GET` | `/api/game/:id/stats` | Win rate, net profit, streaks, etc. |

## 🎮 Example: Playing a Full Game

```bash
# 1. Create a session
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"playerName": "Alice"}'
# → Returns sessionId in response

# 2. Place a bet
curl -X POST http://localhost:3000/api/game/{sessionId}/bet \
  -H "Content-Type: application/json" \
  -d '{"bet": 50}'

# 3. Hit or stand
curl -X POST http://localhost:3000/api/game/{sessionId}/hit
curl -X POST http://localhost:3000/api/game/{sessionId}/stand

# 4. House plays (resolves the round)
curl -X POST http://localhost:3000/api/game/{sessionId}/house

# 5. Check your stats
curl http://localhost:3000/api/game/{sessionId}/stats

# 6. Play another round
curl -X POST http://localhost:3000/api/game/{sessionId}/begin-round \
  -H "Content-Type: application/json" \
  -d '{"bet": 100}'
```

## 📊 Game State Response Shape

Every game action returns an enriched state:

```json
{
  "house": {
    "money": 10000,
    "cards": ["King of Spades", "7 of Hearts"],
    "bet": 50,
    "player_in_game": false,
    "house_in_game": false
  },
  "player": {
    "money": 10050,
    "bet": 50,
    "cards": ["Ace of Diamonds", "Jack of Clubs"],
    "player_in_game": false
  },
  "session": {
    "id": "abc-123-...",
    "playerName": "Alice",
    "roundsPlayed": 3
  },
  "computed": {
    "playerHandValue": 21,
    "houseHandValue": 17,
    "outcome": "player_blackjack",
    "isRoundOver": true,
    "isPlayerBust": false,
    "isHouseBust": false,
    "isBlackjack": true
  }
}
```

## ⚙️ Configuration

All settings can be configured via environment variables (`.env` file):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `CORS_ORIGINS` | `*` (open) | Comma-separated allowed origins |
| `SESSION_TTL_MS` | `1800000` | Session inactivity timeout (30 min) |
| `MAX_SESSIONS` | `100` | Max concurrent game tables |
| `RATE_LIMIT_MAX` | `100` | Max requests per window per IP |
| `RATE_LIMIT_WINDOW_MINUTES` | `1` | Rate limit window size |
| `GAME_ENGINE_URL` | `http://127.0.0.1:5000` | Legacy Flask backend URL |

## 🏗️ Architecture

```
server.js                    ← Express HTTP layer (routes, middleware, security)
lib/
├── config.js                ← Environment-based configuration
├── errors.js                ← Custom error classes (ValidationError, NotFoundError, etc.)
├── gameEngine.js            ← Pure JS Blackjack engine (Deck, Player, House, Game)
├── sessionManager.js        ← Multi-player session isolation & TTL
├── gameService.js           ← Business logic, validation, enrichment, sanitization
├── gameHistory.js           ← Round tracking, win/loss statistics
├── gameEngineClient.js      ← Legacy Flask backend HTTP bridge
├── types.js                 ← JSDoc type definitions
├── test-connection.js       ← Legacy Flask connection test
└── test-sessions.js         ← Comprehensive E2E test suite (41 tests)
```

## 🧪 Testing

```bash
# Start the server first
npm run dev

# Run the E2E test suite (in another terminal)
npm run test:sessions
```

## 📜 Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the server |
| `npm run dev` | Start with auto-restart (--watch) |
| `npm test` | Test legacy Flask connection |
| `npm run test:sessions` | Run full E2E test suite |
