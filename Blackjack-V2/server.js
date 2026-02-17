/**
 * @fileoverview Express API Server for Blackjack V2.
 *
 * This is the HTTP layer that exposes the game service to the frontend.
 * It handles routing, request parsing, error formatting, CORS, rate
 * limiting, security headers, and graceful shutdown.
 *
 * API Overview:
 * ─────────────────────────────────────────────────────────────────────
 * Health & Info
 *   GET    /api/health                        — Server health check
 *   GET    /api/stats                         — Global server statistics
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
 * ─────────────────────────────────────────────────────────────────────
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const gameService = require("./lib/gameService");
const config = require("./lib/config");
const { AppError } = require("./lib/errors");

const app = express();

// ─── Security Middleware ──────────────────────────────────────────────────────

// Helmet adds security headers (X-Content-Type-Options, X-Frame-Options, etc.)
app.use(helmet());

// CORS — restrict to specific origins in production
app.use(
    cors({
        origin: config.CORS_ORIGINS,
        methods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        maxAge: 86400, // Cache preflight for 24h
    })
);

app.use(express.json({ limit: "10kb" })); // Limit body size to prevent abuse

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

// Request logging (lightweight)
app.use((req, _res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    next();
});

// ─── Health & Global Stats ────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
    res.json(gameService.healthCheck());
});

/**
 * GET /api/stats
 * Returns server-wide game statistics (total rounds, win rates, etc.)
 */
app.get("/api/stats", (_req, res) => {
    res.json(gameService.getGlobalStats());
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
app.post("/api/sessions", (req, res, next) => {
    try {
        const { playerName, startingBalance } = req.body || {};
        const state = gameService.createSession({ playerName, startingBalance });
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

// ─── Error Handling Middleware ─────────────────────────────────────────────────

// 404 handler
app.use((_req, res) => {
    res.status(404).json({
        error: true,
        message:
            "The requested endpoint does not exist. Check /api/health for available routes.",
    });
});

// Global error handler — reads status from custom AppError classes
// No more fragile string matching!
app.use((err, _req, res, _next) => {
    const status = err instanceof AppError ? err.status : 500;
    const message = err.message || "Internal server error";

    if (status >= 500) {
        console.error(`[ERROR ${status}] ${message}`, err.stack);
    } else {
        console.error(`[ERROR ${status}] ${message}`);
    }

    res.status(status).json({
        error: true,
        message,
    });
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

let server;

function gracefulShutdown(signal) {
    console.log(`\n[${signal}] Shutting down gracefully...`);

    // Stop accepting new connections
    if (server) {
        server.close(() => {
            console.log("[shutdown] HTTP server closed.");
        });
    }

    // Stop session cleanup timer
    const { sessionManager } = require("./lib/sessionManager");
    sessionManager.shutdown();
    console.log(
        `[shutdown] Cleaned up ${sessionManager.activeCount} active session(s).`
    );

    // Give in-flight requests a moment to finish
    setTimeout(() => {
        console.log("[shutdown] Process exiting.");
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
        `║  Stats:       http://localhost:${config.PORT}/api/stats     ║`
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
    console.log("║  ✅ Security headers (Helmet)                    ║");
    console.log("║  ✅ Rate limiting enabled                        ║");
    console.log("║  ✅ Input sanitization                           ║");
    console.log("║  ✅ Game history tracking                        ║");
    console.log("║  ✅ Graceful shutdown handler                    ║");
    console.log("║  ✅ Environment config via .env                  ║");
    console.log("╚══════════════════════════════════════════════════╝");
    console.log("");
});

module.exports = app;
