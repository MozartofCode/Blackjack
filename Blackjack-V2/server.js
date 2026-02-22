/**
 * @fileoverview Express API Server for Blackjack V2.
 *
 * This is the HTTP layer that exposes the game service to the frontend.
 * It handles routing, request parsing, error formatting, CORS, rate
 * limiting, security headers, and graceful shutdown.
 *
 * Infrastructure Patterns:
 * ─────────────────────────────────────────────────────────────────────
 * • Request correlation IDs  — trace any request through the entire system
 * • Structured JSON logging  — queryable logs for production debugging
 * • Circuit breaker          — fail-fast when Supabase is down
 * • Response time metrics    — p50/p95/p99 per-endpoint tracking
 * • TTL cache                — in-process cache for DB query results
 * • Rate limiting            — per-IP request throttling
 * • Graceful shutdown        — drain connections before exit
 *
 * API Overview:
 * ─────────────────────────────────────────────────────────────────────
 * Health & Info
 *   GET    /api/health                        — Server health check (deep)
 *   GET    /api/stats                         — Global server statistics
 *   GET    /api/metrics                       — Response time metrics
 *   GET    /api/cache-stats                   — Cache performance
 *
 * Session Management
 *   POST   /api/sessions                      — Create a new game session
 *   GET    /api/sessions                      — List all active sessions
 *   GET    /api/sessions/:sessionId           — Get session info
 *   DELETE /api/sessions/:sessionId           — End a session
 *
 * Game Actions (all require :sessionId)
 *   GET    /api/game/:sessionId/state         — Get current game state
 *   POST   /api/game/:sessionId/bet           — Place a bet        { bet: number }
 *   POST   /api/game/:sessionId/hit           — Player hits
 *   POST   /api/game/:sessionId/stand         — Player stands
 *   POST   /api/game/:sessionId/action        — Generic action     { action: "H"|"S" }
 *   POST   /api/game/:sessionId/house         — House plays its turn
 *   POST   /api/game/:sessionId/new-round     — Start a new round
 *   POST   /api/game/:sessionId/begin-round   — New round + bet    { bet: number }
 *
 * History & Stats
 *   GET    /api/game/:sessionId/history       — Round-by-round history
 *   GET    /api/game/:sessionId/stats         — Session win/loss stats
 *   GET    /api/leaderboard                   — Top players from DB
 *   GET    /api/stats/db                      — All-time persistent stats
 *
 * Bot Management
 *   GET    /api/bots                          — List all bots
 *   GET    /api/bots/:botId/profile           — Get bot profile/stats
 *   GET    /api/bots/:botId/performance       — Get bot performance history
 *   POST   /api/bots/:botId/record-round      — Record a bot's round result
 * ─────────────────────────────────────────────────────────────────────
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const gameService = require("./lib/gameService");
const config = require("./lib/config");
const { AppError } = require("./lib/errors");
const db = require("./lib/db");
const { isSupabaseEnabled, dbCircuitBreaker } = require("./lib/supabaseClient");
const cacheLayer = require("./lib/cache");
const logger = require("./lib/logger");

// ─── Middleware ───────────────────────────────────────────────────────────────
const requestIdMiddleware = require("./lib/middleware/requestId");
const { responseMetricsMiddleware, getMetrics } = require("./lib/middleware/responseMetrics");

const app = express();

// ─── Security Middleware ──────────────────────────────────────────────────────

// Helmet adds security headers (X-Content-Type-Options, X-Frame-Options, etc.)
app.use(helmet());

// CORS — restrict to specific origins in production
app.use(
    cors({
        origin: config.CORS_ORIGINS,
        methods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
        exposedHeaders: ["X-Request-ID", "X-Response-Time"],
        maxAge: 86400, // Cache preflight for 24h
    })
);

app.use(express.json({ limit: "10kb" })); // Limit body size to prevent abuse

// ─── Observability Middleware ─────────────────────────────────────────────────

// 1. Assign correlation ID to every request (must come first)
app.use(requestIdMiddleware());

// 2. Track response times and status codes
app.use(responseMetricsMiddleware());

// 3. Structured request logging (replaces console.log)
app.use((req, res, next) => {
    const start = Date.now();

    res.on("finish", () => {
        const duration = Date.now() - start;
        const meta = {
            requestId: req.id,
            status: res.statusCode,
            duration: `${duration}ms`,
        };

        // Log at appropriate level based on status code
        if (res.statusCode >= 500) {
            req.log.error("Request completed", meta);
        } else if (res.statusCode >= 400) {
            req.log.warn("Request completed", meta);
        } else {
            req.log.info("Request completed", meta);
        }
    });

    next();
});

// Rate limiting — prevent abuse
const limiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    max: config.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: true,
        message: `Too many requests. Limit: ${config.RATE_LIMIT_MAX} requests per ${config.RATE_LIMIT_WINDOW_MINUTES} minute(s). Please slow down.`,
    },
});
app.use("/api/", limiter);

// ─── Health & Observability Endpoints ─────────────────────────────────────────

/**
 * GET /api/health
 * Deep health check — reports status of all dependencies.
 *
 * Interview talking point: Liveness vs Readiness probes
 * - Liveness:  "Is the process alive?" (just return 200)
 * - Readiness: "Can it serve traffic?" (check dependencies)
 * This endpoint works as a readiness probe.
 */
app.get("/api/health", (_req, res) => {
    const circuitState = dbCircuitBreaker.getStats();
    const health = {
        ...gameService.healthCheck(),
        dependencies: {
            supabase: {
                configured: isSupabaseEnabled(),
                circuitBreaker: circuitState.state,
                failureCount: circuitState.failureCount,
            },
            cache: cacheLayer.getStats(),
        },
        uptime: Math.round(process.uptime()),
        memory: {
            rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
            heap: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        },
    };

    // If circuit breaker is OPEN, signal degraded health
    const httpStatus = circuitState.state === "OPEN" ? 503 : 200;
    res.status(httpStatus).json(health);
});

/**
 * GET /api/stats
 * Returns server-wide game statistics (total rounds, win rates, etc.)
 */
app.get("/api/stats", (_req, res) => {
    res.json(gameService.getGlobalStats());
});

/**
 * GET /api/metrics
 * Returns response time percentiles (p50/p95/p99), error rates,
 * per-route breakdown, and memory usage.
 *
 * Interview talking point: This is what you'd feed into Grafana/Datadog
 * dashboards. The p99 tells you the worst-case latency experienced by
 * 1% of your users — much more useful than averages.
 */
app.get("/api/metrics", (_req, res) => {
    res.json(getMetrics());
});

/**
 * GET /api/cache-stats
 * Returns cache performance metrics (hits, misses, hit rate, keys).
 */
app.get("/api/cache-stats", (_req, res) => {
    res.json({
        cache: cacheLayer.getStats(),
        circuitBreaker: dbCircuitBreaker.getStats(),
        supabaseEnabled: isSupabaseEnabled(),
    });
});

// ─── Auth & Player Routes ─────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Registers a new player with a name and 4-digit PIN.
 * Body: { playerName: string, pin: string }
 */
app.post("/api/auth/register", async (req, res, next) => {
    try {
        const { playerName, pin } = req.body || {};
        if (!playerName || !pin) {
            return res.status(400).json({ error: true, message: "playerName and pin are required." });
        }
        if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
            return res.status(400).json({ error: true, message: "PIN must be exactly 4 digits." });
        }
        if (playerName.length < 2 || playerName.length > 20) {
            return res.status(400).json({ error: true, message: "Player name must be 2-20 characters." });
        }

        const player = await db.registerPlayer(playerName.trim(), pin);
        if (!player) {
            return res.status(503).json({ error: true, message: "Database is temporarily unavailable. Please try again later." });
        }
        req.log.info("Player registered", { playerName });
        res.status(201).json({ player });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/auth/login
 * Logs in with player name + PIN.
 * Body: { playerName: string, pin: string }
 */
app.post("/api/auth/login", async (req, res, next) => {
    try {
        const { playerName, pin } = req.body || {};
        if (!playerName || !pin) {
            return res.status(400).json({ error: true, message: "playerName and pin are required." });
        }

        const player = await db.loginPlayer(playerName.trim(), pin);
        if (!player) {
            return res.status(503).json({ error: true, message: "Database is temporarily unavailable. Please try again later." });
        }
        req.log.info("Player logged in", { playerName });
        res.json({ player });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/players/:playerId/profile
 * Gets a player's full profile with lifetime stats.
 */
app.get("/api/players/:playerId/profile", async (req, res, next) => {
    try {
        const player = await db.getPlayerProfile(req.params.playerId);
        if (!player) {
            return res.status(404).json({ error: true, message: "Player not found." });
        }
        res.json({ player });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/players/:playerId/history
 * Gets paginated gameplay history for a player.
 * Query: ?limit=50&offset=0
 */
app.get("/api/players/:playerId/history", async (req, res, next) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
        const offset = parseInt(req.query.offset, 10) || 0;
        const result = await db.getPlayerHistory(req.params.playerId, limit, offset);
        res.json(result);
    } catch (err) {
        next(err);
    }
});

// ─── Session Routes ───────────────────────────────────────────────────────────

/**
 * POST /api/sessions
 * Creates a new game session.
 *
 * Body (all optional):
 *   { playerName: string, startingBalance: number }
 *
 * Returns: Enriched game state with session info.
 */
app.post("/api/sessions", async (req, res, next) => {
    try {
        const { playerName, startingBalance } = req.body || {};
        const state = await gameService.createSession({ playerName, startingBalance });
        req.log.info("Session created", {
            sessionId: state.session.id,
            playerName: state.session.playerName,
        });
        res.status(201).json(state);
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/sessions
 * Lists all active sessions (admin/debug use).
 */
app.get("/api/sessions", (_req, res, next) => {
    try {
        res.json(gameService.listSessions());
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/sessions/:sessionId
 * Gets session metadata.
 */
app.get("/api/sessions/:sessionId", (req, res, next) => {
    try {
        res.json(gameService.getSessionInfo(req.params.sessionId));
    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/sessions/:sessionId
 * Ends a session (player leaves the table).
 * Returns final stats as a "game over" summary.
 */
app.delete("/api/sessions/:sessionId", (req, res, next) => {
    try {
        const result = gameService.destroySession(req.params.sessionId);
        req.log.info("Session destroyed", { sessionId: req.params.sessionId });
        res.json(result);
    } catch (err) {
        next(err);
    }
});

// ─── Game Routes ──────────────────────────────────────────────────────────────

/**
 * GET /api/game/:sessionId/state
 * Returns the full enriched game state for a session.
 */
app.get("/api/game/:sessionId/state", (req, res, next) => {
    try {
        const state = gameService.getGameState(req.params.sessionId);
        res.json(state);
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/game/:sessionId/bet
 * Places a bet for the current round.
 * Body: { bet: number }
 */
app.post("/api/game/:sessionId/bet", (req, res, next) => {
    try {
        const bet = req.body?.bet;
        if (bet === undefined) {
            return res
                .status(400)
                .json({ error: true, message: 'Missing "bet" in request body.' });
        }
        const state = gameService.placeBet(req.params.sessionId, Number(bet));
        res.json(state);
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/game/:sessionId/hit
 * Player hits (draws a card).
 */
app.post("/api/game/:sessionId/hit", (req, res, next) => {
    try {
        const state = gameService.playerHit(req.params.sessionId);
        res.json(state);
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/game/:sessionId/stand
 * Player stands (ends their turn).
 */
app.post("/api/game/:sessionId/stand", (req, res, next) => {
    try {
        const state = gameService.playerStand(req.params.sessionId);
        res.json(state);
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/game/:sessionId/action
 * Generic player action.
 * Body: { action: "H" | "S" }
 */
app.post("/api/game/:sessionId/action", (req, res, next) => {
    try {
        const action = req.body?.action;
        if (!action) {
            return res
                .status(400)
                .json({ error: true, message: 'Missing "action" in request body.' });
        }
        const state = gameService.playerAction(req.params.sessionId, action);
        res.json(state);
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/game/:sessionId/house
 * House plays its turn (hits until 17+, resolves the round).
 */
app.post("/api/game/:sessionId/house", (req, res, next) => {
    try {
        const state = gameService.housePlay(req.params.sessionId);
        res.json(state);
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/game/:sessionId/new-round
 * Starts a new round (zeros bet, clears hands, deals fresh cards).
 */
app.post("/api/game/:sessionId/new-round", (req, res, next) => {
    try {
        const state = gameService.startNewRound(req.params.sessionId);
        res.json(state);
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/game/:sessionId/begin-round
 * Convenience: starts a new round AND places a bet in one call.
 * Body: { bet: number }
 */
app.post("/api/game/:sessionId/begin-round", (req, res, next) => {
    try {
        const bet = req.body?.bet;
        if (bet === undefined) {
            return res
                .status(400)
                .json({ error: true, message: 'Missing "bet" in request body.' });
        }
        const state = gameService.beginRound(req.params.sessionId, Number(bet));
        res.json(state);
    } catch (err) {
        next(err);
    }
});

// ─── History & Stats Routes ───────────────────────────────────────────────────

/**
 * GET /api/game/:sessionId/history
 * Returns the round-by-round history for a session.
 */
app.get("/api/game/:sessionId/history", (req, res, next) => {
    try {
        const data = gameService.getSessionHistory(req.params.sessionId);
        res.json(data);
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/game/:sessionId/stats
 * Returns win/loss statistics for a session.
 */
app.get("/api/game/:sessionId/stats", (req, res, next) => {
    try {
        const data = gameService.getSessionStatsById(req.params.sessionId);
        res.json(data);
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/leaderboard
 * Returns the top players sorted by net profit.
 * Query: ?limit=10 (default: 10)
 */
app.get("/api/leaderboard", async (req, res, next) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
        const data = await db.getLeaderboard(limit);
        res.json({ leaderboard: data, count: data.length });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/stats/db
 * Returns global stats from the database (persistent, all-time).
 */
app.get("/api/stats/db", async (_req, res, next) => {
    try {
        const data = await db.getGlobalStats();
        if (!data) {
            return res.json({
                message: "Database not configured. Using in-memory stats.",
                stats: gameService.getGlobalStats(),
            });
        }
        res.json(data);
    } catch (err) {
        next(err);
    }
});

// ─── Bot Routes ───────────────────────────────────────────────────────────────

/**
 * GET /api/bots
 * Lists all bots.
 */
app.get("/api/bots", async (_req, res, next) => {
    try {
        const bots = await db.getBots();
        res.json({ bots });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/bots/:botId/profile
 * Gets a bot's profile.
 */
app.get("/api/bots/:botId/profile", async (req, res, next) => {
    try {
        const botId = parseInt(req.params.botId, 10);
        const bot = await db.getBotProfile(botId);
        if (!bot) {
            return res.status(404).json({ error: true, message: "Bot not found." });
        }
        res.json({ bot });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/bots/:botId/performance
 * Gets a bot's performance history.
 */
app.get("/api/bots/:botId/performance", async (req, res, next) => {
    try {
        const botId = parseInt(req.params.botId, 10);
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
        const history = await db.getBotPerformance(botId, limit);
        res.json({ history });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/bots/:botId/record-round
 * Records a bot's round result.
 */
app.post("/api/bots/:botId/record-round", async (req, res, next) => {
    try {
        const botId = parseInt(req.params.botId, 10);
        const {
            payout,
            outcome,
            handValue,
            houseValue,
            action,
            bet,
            othersHandValues,
            houseUpCard
        } = req.body;

        await db.recordBotRound({
            botId,
            payout,
            outcome,
            handValue,
            houseValue,
            action,
            bet,
            othersHandValues,
            houseUpCard
        });

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// ─── Error Handling Middleware ─────────────────────────────────────────────────

// 404 handler
app.use((req, res) => {
    req.log.warn("Route not found");
    res.status(404).json({
        error: true,
        message:
            "The requested endpoint does not exist. Check /api/health for available routes.",
    });
});

// Global error handler — reads status from custom AppError classes
app.use((err, req, res, _next) => {
    const status = err.status || (err instanceof AppError ? err.status : 500);
    const message = err.message || "Internal server error";

    if (status >= 500) {
        (req.log || logger).error("Unhandled error", {
            status,
            error: message,
            stack: err.stack,
        });
    } else {
        (req.log || logger).warn("Client error", { status, error: message });
    }

    res.status(status).json({
        error: true,
        message,
    });
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

let server;

function gracefulShutdown(signal) {
    logger.info(`Shutting down gracefully`, { signal });

    // Stop accepting new connections
    if (server) {
        server.close(() => {
            logger.info("HTTP server closed");
        });
    }

    // Stop session cleanup timer
    const { sessionManager } = require("./lib/sessionManager");
    sessionManager.shutdown();
    logger.info("Sessions cleaned up", {
        activeSessions: sessionManager.activeCount,
    });

    // Flush cache
    cacheLayer.flushAll();

    // Give in-flight requests a moment to finish
    setTimeout(() => {
        logger.info("Process exiting");
        process.exit(0);
    }, 1000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ─── Start Server ─────────────────────────────────────────────────────────────

server = app.listen(config.PORT, () => {
    console.log("");
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║       🃏 Casino Royale V2 — API Server 🃏       ║");
    console.log("╠══════════════════════════════════════════════════╣");
    console.log(
        `║  Server:      http://localhost:${config.PORT}              ║`
    );
    console.log(
        `║  Health:      http://localhost:${config.PORT}/api/health    ║`
    );
    console.log(
        `║  Metrics:     http://localhost:${config.PORT}/api/metrics   ║`
    );
    console.log(
        `║  Max seats:   ${String(config.MAX_SESSIONS).padEnd(35)}║`
    );
    console.log(
        `║  Session TTL: ${String(config.SESSION_TTL_MS / 1000 / 60 + " min").padEnd(35)}║`
    );
    console.log(
        `║  Rate limit:  ${String(config.RATE_LIMIT_MAX + " req/" + config.RATE_LIMIT_WINDOW_MINUTES + " min").padEnd(35)}║`
    );
    console.log(
        `║  CORS:        ${String(config.CORS_ORIGINS === "*" ? "open (dev)" : config.CORS_ORIGINS.length + " origin(s)").padEnd(35)}║`
    );
    console.log("╠══════════════════════════════════════════════════╣");
    console.log("║  ✅ Request correlation IDs (X-Request-ID)       ║");
    console.log("║  ✅ Structured JSON logging                      ║");
    console.log("║  ✅ Response time metrics (p50/p95/p99)          ║");
    console.log("║  ✅ Circuit breaker (Supabase)                   ║");
    console.log("║  ✅ In-process TTL cache                         ║");
    console.log("║  ✅ Rate limiting                                ║");
    console.log("║  ✅ Security headers (Helmet)                    ║");
    console.log("║  ✅ Input sanitization                           ║");
    console.log("║  ✅ Graceful shutdown handler                    ║");
    console.log(
        isSupabaseEnabled()
            ? "║  ✅ Supabase DB connected                        ║"
            : "║  ⚠️  Supabase DB not configured (in-memory only)  ║"
    );
    console.log("╚══════════════════════════════════════════════════╝");
    console.log("");
});

module.exports = app;
