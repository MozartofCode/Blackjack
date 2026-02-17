/**
 * @fileoverview Session-aware Game Service for Blackjack V2.
 *
 * This is the single entry point for all game operations. Every method requires
 * a sessionId, ensuring each player's game is fully isolated.
 *
 * ┌────────────────────┐     ┌──────────────────────┐     ┌────────────────────┐
 * │  Express Routes    │ ──▶ │   gameService.js     │ ──▶ │  sessionManager    │
 * │  (server.js)       │     │  (validation, enrich)│     │  + gameEngine      │
 * └────────────────────┘     └──────────────────────┘     └────────────────────┘
 *
 * The legacy Flask bridge (gameEngineClient.js) is still available for direct
 * use if needed, but the session-based flow is the primary path.
 */

const { sessionManager } = require("./sessionManager");
const { calculateHandValue } = require("./gameEngine");
const history = require("./gameHistory");
const config = require("./config");
const { ValidationError } = require("./errors");
const db = require("./db");
const { isSupabaseEnabled } = require("./supabaseClient");

// ─── Constants ────────────────────────────────────────────────────────────────

const MINIMUM_BET = config.MINIMUM_BET;
const VALID_ACTIONS = ["H", "S"];

/** Max allowed length for player names */
const MAX_PLAYER_NAME_LENGTH = 30;

/** Regex: only allow letters, numbers, spaces, underscores, hyphens */
const PLAYER_NAME_PATTERN = /^[a-zA-Z0-9 _-]+$/;

// ─── Input Sanitization ───────────────────────────────────────────────────────

/**
 * Sanitizes and validates a player name.
 * - Trims whitespace
 * - Enforces max length
 * - Strips dangerous characters (only allows alphanumerics, spaces, hyphens, underscores)
 * - Falls back to "Anonymous" if empty or invalid
 *
 * @param {*} name - Raw player name input.
 * @returns {string} Sanitized player name.
 */
function sanitizePlayerName(name) {
    if (typeof name !== "string" || name.trim().length === 0) {
        return "Anonymous";
    }

    const trimmed = name.trim();

    if (trimmed.length > MAX_PLAYER_NAME_LENGTH) {
        throw new ValidationError(
            `Player name must be ${MAX_PLAYER_NAME_LENGTH} characters or fewer. Received: ${trimmed.length} characters.`
        );
    }

    if (!PLAYER_NAME_PATTERN.test(trimmed)) {
        throw new ValidationError(
            `Player name contains invalid characters. Only letters, numbers, spaces, hyphens, and underscores are allowed.`
        );
    }

    return trimmed;
}

// ─── Enrichment Helpers ───────────────────────────────────────────────────────

/**
 * Determines the outcome of a round based on hand values and game flags.
 *
 * @param {Object} rawState - Game state from Game.toDict().
 * @returns {"player_blackjack" | "player_bust" | "house_bust" | "player_win" | "house_win" | "push" | "in_progress"}
 */
function determineOutcome(rawState) {
    const { house, player } = rawState;

    // Still playing
    if (player.player_in_game || house.house_in_game) {
        return "in_progress";
    }

    const playerValue = calculateHandValue(player.cards);
    const houseValue = calculateHandValue(house.cards);

    if (playerValue === 21 && player.cards.length === 2)
        return "player_blackjack";
    if (playerValue > 21) return "player_bust";
    if (houseValue > 21) return "house_bust";
    if (playerValue > houseValue) return "player_win";
    if (houseValue > playerValue) return "house_win";
    return "push";
}

/**
 * Builds an enriched game state with computed values, outcome, and session info.
 *
 * @param {Object} rawState - Game state from Game.toDict().
 * @param {import('./sessionManager').Session} session - The session this state belongs to.
 * @returns {Object} Enriched state ready for the frontend.
 */
function enrichGameState(rawState, session) {
    const playerHandValue = calculateHandValue(rawState.player.cards);
    const houseHandValue = calculateHandValue(rawState.house.cards);
    const outcome = determineOutcome(rawState);

    return {
        ...rawState,
        session: {
            id: session.id,
            playerName: session.playerName,
            roundsPlayed: session.roundsPlayed,
        },
        computed: {
            playerHandValue,
            houseHandValue,
            outcome,
            isRoundOver: outcome !== "in_progress",
            isPlayerBust: playerHandValue > 21,
            isHouseBust: houseHandValue > 21,
            isBlackjack:
                playerHandValue === 21 && rawState.player.cards.length === 2,
        },
    };
}

// ─── Session Management ───────────────────────────────────────────────────────

/**
 * Creates a new game session.
 *
 * @param {Object} [options]
 * @param {string} [options.playerName] - Display name for the player.
 * @param {number} [options.startingBalance] - Starting chips.
 * @returns {Object} Enriched initial game state with session info.
 */
function createSession(options = {}) {
    // Sanitize inputs
    const playerName = sanitizePlayerName(options.playerName);

    const startingBalance = options.startingBalance
        ? Number(options.startingBalance)
        : config.DEFAULT_PLAYER_BALANCE;

    if (!Number.isFinite(startingBalance) || startingBalance <= 0) {
        throw new ValidationError(
            `Starting balance must be a positive number. Received: ${options.startingBalance}`
        );
    }

    const session = sessionManager.create({
        playerName,
        startingBalance,
        houseBalance: config.DEFAULT_HOUSE_BALANCE,
    });

    // Persist to Supabase (async, fire-and-forget)
    if (isSupabaseEnabled()) {
        db.findOrCreatePlayer(playerName).then((player) => {
            // Store the DB player ID on the session for later use
            session.dbPlayerId = player?.id || null;

            db.createSession({
                sessionId: session.id,
                playerName,
                playerId: session.dbPlayerId,
                startingBalance,
            }).catch((err) =>
                console.error("[DB] Failed to persist session:", err.message)
            );
        });
    }

    const rawState = session.game.toDict();
    return enrichGameState(rawState, session);
}

/**
 * Gets the enriched game state for a session.
 *
 * @param {string} sessionId
 * @returns {Object} Enriched game state.
 */
function getGameState(sessionId) {
    const session = sessionManager.get(sessionId);
    const rawState = session.game.toDict();
    return enrichGameState(rawState, session);
}

/**
 * Gets session summary (metadata only, no game state).
 *
 * @param {string} sessionId
 * @returns {Object} Session summary.
 */
function getSessionInfo(sessionId) {
    const session = sessionManager.get(sessionId);
    return session.toSummary();
}

/**
 * Lists all active sessions.
 *
 * @returns {Object} Active sessions and count.
 */
function listSessions() {
    const sessions = sessionManager.listAll();
    return {
        activeSessions: sessions.length,
        maxSessions: config.MAX_SESSIONS,
        sessions,
    };
}

/**
 * Ends a session.
 *
 * @param {string} sessionId
 * @returns {{ destroyed: boolean, sessionId: string }}
 */
function destroySession(sessionId) {
    // Get the session before destroying (need balance for DB)
    let finalBalance = 0;
    try {
        const session = sessionManager.get(sessionId);
        finalBalance = session.game.tracker.getPlayerBalance();
    } catch {
        // Session may already be expired
    }

    // Get final stats before destroying
    const finalStats = history.getSessionStats(sessionId);
    const destroyed = sessionManager.destroy(sessionId);

    // Mark session as completed in Supabase
    if (isSupabaseEnabled()) {
        db.endSession(sessionId, finalBalance).catch((err) =>
            console.error("[DB] Failed to end session:", err.message)
        );
    }

    // Keep history around for a bit (don't clear immediately)
    // so the frontend can show a "game over" summary
    return { destroyed, sessionId, finalStats };
}

// ─── Game Actions ─────────────────────────────────────────────────────────────

/**
 * Player hits in the given session.
 *
 * @param {string} sessionId
 * @returns {Object} Enriched game state after hitting.
 */
function playerHit(sessionId) {
    const session = sessionManager.get(sessionId);

    if (!session.game.player.inGame) {
        throw new ValidationError(
            "Player has already finished their turn this round."
        );
    }

    session.game.playerHit();
    const rawState = session.game.toDict();
    return enrichGameState(rawState, session);
}

/**
 * Player stands in the given session.
 *
 * @param {string} sessionId
 * @returns {Object} Enriched game state after standing.
 */
function playerStand(sessionId) {
    const session = sessionManager.get(sessionId);

    if (!session.game.player.inGame) {
        throw new ValidationError(
            "Player has already finished their turn this round."
        );
    }

    session.game.playerStand();
    const rawState = session.game.toDict();
    return enrichGameState(rawState, session);
}

/**
 * Player performs an action by name.
 *
 * @param {string} sessionId
 * @param {string} action - "H" for Hit, "S" for Stand.
 * @returns {Object} Enriched game state.
 */
function playerAction(sessionId, action) {
    const upperAction = action.toUpperCase();

    if (!VALID_ACTIONS.includes(upperAction)) {
        throw new ValidationError(
            `Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(", ")}`
        );
    }

    if (upperAction === "H") return playerHit(sessionId);
    return playerStand(sessionId);
}

/**
 * Player places a bet in the given session.
 *
 * @param {string} sessionId
 * @param {number} amount - The bet amount (minimum $10).
 * @returns {Object} Enriched game state after placing the bet.
 */
function placeBet(sessionId, amount) {
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
        throw new ValidationError(
            `Bet must be a valid number. Received: ${amount}`
        );
    }

    if (amount < MINIMUM_BET) {
        throw new ValidationError(
            `Bet must be at least $${MINIMUM_BET}. Received: $${amount}`
        );
    }

    if (!Number.isInteger(amount)) {
        throw new ValidationError(
            `Bet must be a whole number. Received: $${amount}`
        );
    }

    const session = sessionManager.get(sessionId);

    // Check player has enough balance
    const playerBalance = session.game.tracker.getPlayerBalance();
    if (amount > playerBalance) {
        throw new ValidationError(
            `Insufficient balance. You have $${playerBalance} but tried to bet $${amount}.`
        );
    }

    session.game.playerBet(amount);
    const rawState = session.game.toDict();
    return enrichGameState(rawState, session);
}

/**
 * House plays its turn in the given session.
 *
 * @param {string} sessionId
 * @returns {Object} Enriched game state after the house plays.
 */
function housePlay(sessionId) {
    const session = sessionManager.get(sessionId);

    if (session.game.player.inGame) {
        throw new ValidationError(
            "Player must finish their turn (hit or stand) before the house can play."
        );
    }

    if (!session.game.house.inGame) {
        throw new ValidationError("House has already played this round.");
    }

    // Snapshot balance before the round resolves
    const balanceBefore = session.game.tracker.getPlayerBalance();

    session.game.housePlay();
    const rawState = session.game.toDict();
    const enriched = enrichGameState(rawState, session);

    // Record the completed round in memory
    history.recordRound(sessionId, enriched, balanceBefore);

    // Persist round to Supabase (async, fire-and-forget)
    if (isSupabaseEnabled()) {
        const balanceAfter = session.game.tracker.getPlayerBalance();
        const payout = balanceAfter - balanceBefore;

        db.recordRound({
            sessionId,
            playerId: session.dbPlayerId || null,
            roundNumber: session.roundsPlayed,
            outcome: enriched.computed.outcome,
            playerHand: [...rawState.player.cards],
            houseHand: [...rawState.house.cards],
            playerHandValue: enriched.computed.playerHandValue,
            houseHandValue: enriched.computed.houseHandValue,
            bet: rawState.player.bet,
            payout,
            balanceAfter,
        }).catch((err) =>
            console.error("[DB] Failed to persist round:", err.message)
        );

        // Update session state in DB
        db.updateSession(sessionId, balanceAfter, session.roundsPlayed).catch(
            (err) =>
                console.error("[DB] Failed to update session:", err.message)
        );
    }

    return enriched;
}

/**
 * Starts a new round in the given session.
 *
 * @param {string} sessionId
 * @returns {Object} Enriched game state for the new round.
 */
function startNewRound(sessionId) {
    const session = sessionManager.get(sessionId);
    session.game.initializeNewRound();
    session.roundsPlayed += 1;
    const rawState = session.game.toDict();
    return enrichGameState(rawState, session);
}

/**
 * Convenience: Starts a new round and places a bet in one call.
 *
 * @param {string} sessionId
 * @param {number} betAmount
 * @returns {Object} Enriched game state ready for player decisions.
 */
function beginRound(sessionId, betAmount) {
    startNewRound(sessionId);
    return placeBet(sessionId, betAmount);
}

// ─── History & Stats ──────────────────────────────────────────────────────────

/**
 * Gets the round-by-round history for a session.
 *
 * @param {string} sessionId
 * @returns {Object} Session history.
 */
function getSessionHistory(sessionId) {
    // Validate session exists
    sessionManager.get(sessionId);
    return {
        sessionId,
        rounds: history.getSessionHistory(sessionId),
    };
}

/**
 * Gets win/loss statistics for a session.
 *
 * @param {string} sessionId
 * @returns {Object} Session stats.
 */
function getSessionStatsById(sessionId) {
    // Validate session exists
    sessionManager.get(sessionId);
    return history.getSessionStats(sessionId);
}

/**
 * Gets server-wide global statistics.
 *
 * @returns {Object} Global stats.
 */
function getGlobalStats() {
    return history.getGlobalStats();
}

// ─── Health / Info ────────────────────────────────────────────────────────────

/**
 * Server health check.
 *
 * @returns {Object} Health status.
 */
function healthCheck() {
    const global = history.getGlobalStats();
    return {
        status: "ok",
        uptime: process.uptime(),
        activeSessions: sessionManager.activeCount,
        maxSessions: config.MAX_SESSIONS,
        totalRoundsPlayed: global.totalRounds,
        timestamp: new Date().toISOString(),
    };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    // Session management
    createSession,
    getGameState,
    getSessionInfo,
    listSessions,
    destroySession,

    // Game actions
    playerHit,
    playerStand,
    playerAction,
    placeBet,
    housePlay,
    startNewRound,
    beginRound,

    // History & Stats
    getSessionHistory,
    getSessionStatsById,
    getGlobalStats,

    // Info
    healthCheck,

    // Utilities (can also be used client-side)
    calculateHandValue,
    determineOutcome,
    enrichGameState,

    // Constants
    MINIMUM_BET,
    VALID_ACTIONS,
};
