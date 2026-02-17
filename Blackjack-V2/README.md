# 🃏 Casino Royale V2 — Blackjack API Server

A production-grade, session-based Blackjack API server built with modern backend infrastructure patterns. Designed to be a compelling system design interview showcase.

## ✨ Features

### Core Game
- **Multi-player sessions** — Each player gets an isolated game table with their own deck, hands, and balance
- **Full Blackjack rules** — 5-deck shoe, 3:2 blackjack payout, dealer stands on 17+
- **Game history & stats** — Per-session round history, win rates, streaks, and server-wide statistics
- **Zero dependencies on legacy backend** — Game engine fully ported to JavaScript

### Persistence (Supabase)
- **PostgreSQL via Supabase** — Players, sessions, and rounds persisted to the cloud
- **Leaderboard & global stats** — Database views for aggregated data
- **Graceful degradation** — Works fully in-memory when Supabase is not configured

### System Design Patterns
- **Request Correlation IDs** — Trace any request through the entire system via `X-Request-ID`
- **Structured JSON Logging** — Machine-parseable logs in production, pretty-printed in dev
- **Circuit Breaker** — Fail-fast when Supabase is down (CLOSED → OPEN → HALF_OPEN state machine)
- **Response Time Metrics** — Per-endpoint p50/p95/p99 percentiles via sliding window
- **In-Process TTL Cache** — Cache-aside pattern for DB queries (30s leaderboard, 60s players)

### Security & Reliability
- **Helmet** — Security headers (CSP, X-Content-Type-Options, HSTS, etc.)
- **CORS lockdown** — Configurable origins, locked to specific domains in production
- **Rate limiting** — Per-IP request throttling with configurable window
- **Input sanitization** — XSS prevention, name length limits, bet validation
- **Custom error classes** — Typed errors (400, 404, 410, 503) with consistent response format
- **Graceful shutdown** — Drains connections, flushes cache on SIGTERM/SIGINT
- **41 E2E tests** — Comprehensive coverage for validation, security, and game flow

## 🏗️ Architecture

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    Express Server                       │
                    │                                                         │
  Request ─────────▶  Correlation ID  →  Metrics  →  Logging  →  Rate Limit │
                    │       │                │            │           │        │
                    │       ▼                ▼            ▼           ▼        │
                    │  ┌─────────────────────────────────────────────────┐    │
                    │  │               Route Handlers                    │    │
                    │  └───────────────────┬─────────────────────────────┘    │
                    └─────────────────────┼──────────────────────────────────┘
                                          │
                    ┌─────────────────────┼──────────────────────────────────┐
                    │     gameService.js   │    Business Logic Layer          │
                    │  ┌──────────┐  ┌────┴─────┐  ┌──────────────────┐     │
                    │  │ Session  │  │   Game    │  │   Game History   │     │
                    │  │ Manager  │  │  Engine   │  │   (in-memory)    │     │
                    │  └──────────┘  └──────────┘  └──────────────────┘     │
                    └─────────────────────┬─────────────────────────────────┘
                                          │
                    ┌─────────────────────┼──────────────────────────────────┐
                    │      db.js          │    Data Layer                     │
                    │  ┌──────────┐  ┌────┴─────┐  ┌──────────────────┐     │
                    │  │  Cache   │──│ Circuit   │──│  Supabase Client │     │
                    │  │ (TTL)    │  │ Breaker   │  │  (service_role)  │     │
                    │  └──────────┘  └──────────┘  └────────┬─────────┘     │
                    └────────────────────────────────────────┼───────────────┘
                                                             │
                                                    ┌────────▼─────────┐
                                                    │  Supabase Cloud  │
                                                    │   (PostgreSQL)   │
                                                    └──────────────────┘
```

### File Structure

```
server.js                        ← Express HTTP layer (routes, middleware, security)
lib/
├── config.js                    ← Environment-based configuration
├── errors.js                    ← Custom error classes (ValidationError, NotFoundError, etc.)
├── gameEngine.js                ← Pure JS Blackjack engine (Deck, Player, House, Game)
├── gameService.js               ← Business logic, validation, enrichment, sanitization
├── gameHistory.js               ← Round tracking, win/loss statistics (in-memory)
├── sessionManager.js            ← Multi-player session isolation & TTL
├── supabaseClient.js            ← Supabase singleton + circuit breaker instance
├── db.js                        ← Database operations (CRUD via circuit breaker + cache)
├── cache.js                     ← In-process TTL cache (node-cache, cache-aside pattern)
├── circuitBreaker.js            ← Circuit breaker state machine (CLOSED/OPEN/HALF_OPEN)
├── logger.js                    ← Structured JSON logger with child loggers
├── middleware/
│   ├── requestId.js             ← X-Request-ID correlation middleware
│   └── responseMetrics.js       ← Response time percentile tracking (p50/p95/p99)
├── types.js                     ← JSDoc type definitions
├── test-connection.js           ← Legacy Flask connection test
└── test-sessions.js             ← Comprehensive E2E test suite (41 tests)
```

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

### Health, Metrics & Observability

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Deep readiness probe — dependencies, circuit breaker, memory |
| `GET` | `/api/stats` | Global game statistics (in-memory) |
| `GET` | `/api/metrics` | Response time percentiles (p50/p95/p99), error rates, per-route |
| `GET` | `/api/cache-stats` | Cache hit/miss rates, circuit breaker state |
| `GET` | `/api/leaderboard` | Top players by net profit (from DB) |
| `GET` | `/api/stats/db` | All-time persistent stats (from DB) |

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

## 🎯 System Design Interview Talking Points

### 1. Request Correlation IDs
Every request gets a unique `X-Request-ID` (auto-generated or passed from upstream). The ID flows through middleware, game logic, and DB operations via child loggers. This enables distributed tracing — "give me all logs for request `abc-123`."

### 2. Structured Logging
JSON-formatted logs in production (queryable in CloudWatch/Datadog), pretty-printed in development. Each log entry includes timestamp, level, message, request ID, and contextual metadata. Log levels are configurable via `LOG_LEVEL` env var.

### 3. Circuit Breaker
Protects against Supabase outages using a 3-state machine:
```
CLOSED (normal) → 5 failures → OPEN (fail-fast, 0ms)
                                    ↓ 30s cooldown
                              HALF_OPEN (test 1 request)
                                    ↓ success
                              CLOSED (recovered)
```
When the circuit is OPEN, DB calls return fallback values instantly instead of waiting for connection timeouts. The health endpoint returns `503` when the circuit is open.

### 4. Response Time Metrics
Per-endpoint percentile tracking using a fixed-size ring buffer (sliding window). P50/P95/P99 reveal tail latency that averages hide. UUIDs in paths are normalized to `:id` for route aggregation.

### 5. Cache-Aside Pattern
In-process TTL cache wraps DB queries (30s for leaderboard/stats, 60s for player lookups). Cache is automatically invalidated after game rounds. No external dependencies like Redis needed for single-instance deployments.

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

# 6. Check server metrics
curl http://localhost:3000/api/metrics

# 7. Play another round
curl -X POST http://localhost:3000/api/game/{sessionId}/begin-round \
  -H "Content-Type: application/json" \
  -d '{"bet": 100}'
```

## ⚙️ Configuration

All settings can be configured via environment variables (`.env` file):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment (`production` = JSON logs) |
| `LOG_LEVEL` | `debug` (dev) / `info` (prod) | Minimum log level |
| `CORS_ORIGINS` | `*` (open) | Comma-separated allowed origins |
| `SESSION_TTL_MS` | `1800000` | Session inactivity timeout (30 min) |
| `MAX_SESSIONS` | `100` | Max concurrent game tables |
| `RATE_LIMIT_MAX` | `100` | Max requests per window per IP |
| `RATE_LIMIT_WINDOW_MINUTES` | `1` | Rate limit window size |
| `SUPABASE_URL` | — | Supabase project URL (optional) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Supabase service role key (optional) |

## 🧪 Testing

```bash
# Start the server first
npm run dev

# Run the E2E test suite (in another terminal)
npm run test:sessions
# → 41 passed | 0 failed | 41 total
```

## 📜 Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the server |
| `npm run dev` | Start with auto-restart (--watch) |
| `npm test` | Test legacy Flask connection |
| `npm run test:sessions` | Run full E2E test suite (41 tests) |
