/**
 * @fileoverview Session Manager for Blackjack V2.
 *
 * Each "session" represents one player's game table. It contains:
 *   - A unique session ID
 *   - An independent Game instance (fully isolated state)
 *   - Player display name (optional)
 *   - Timestamps and activity tracking
 *   - Auto-expiry after inactivity (configurable TTL)
 *
 * This is what enables multiple simultaneous players, each with their own
 * hands, decks, and balances — solving the old Flask backend's single-player limitation.
 *
 * ┌──────────┐   ┌──────────┐   ┌──────────┐
 * │ Session  │   │ Session  │   │ Session  │
 * │  abc-123 │   │  def-456 │   │  ghi-789 │
 * │ ┌──────┐ │   │ ┌──────┐ │   │ ┌──────┐ │
 * │ │ Game │ │   │ │ Game │ │   │ │ Game │ │
 * │ └──────┘ │   │ └──────┘ │   │ └──────┘ │
 * └──────────┘   └──────────┘   └──────────┘
 *       ▲               ▲               ▲
 *     Player 1       Player 2       Player 3
 */

const { v4: uuidv4 } = require("uuid");
const { Game } = require("./gameEngine");
const config = require("./config");
const { NotFoundError, GoneError, CapacityError } = require("./errors");

// ─── Session Class ────────────────────────────────────────────────────────────

class Session {
    /**
     * @param {Object} options
     * @param {string} [options.playerName="Anonymous"] - Display name for the player.
     * @param {number} [options.startingBalance=10000] - Player's starting balance.
     * @param {number} [options.houseBalance=10000] - House's starting balance.
     */
    constructor({
        playerName = "Anonymous",
        startingBalance = 10000,
        houseBalance = 10000,
    } = {}) {
        this.id = uuidv4();
        this.playerName = playerName;
        this.game = new Game(startingBalance, houseBalance);
        this.createdAt = new Date();
        this.lastActivityAt = new Date();
        this.roundsPlayed = 0;

        // Deal the initial hand
        this.game.dealInitialHands();
    }

    /** Updates the last activity timestamp. */
    touch() {
        this.lastActivityAt = new Date();
    }

    /** Returns true if this session has been inactive longer than the TTL. */
    isExpired() {
        const elapsed = Date.now() - this.lastActivityAt.getTime();
        return elapsed > config.SESSION_TTL_MS;
    }

    /** Returns session metadata (without the full game object). */
    toSummary() {
        return {
            id: this.id,
            playerName: this.playerName,
            createdAt: this.createdAt.toISOString(),
            lastActivityAt: this.lastActivityAt.toISOString(),
            roundsPlayed: this.roundsPlayed,
            isExpired: this.isExpired(),
        };
    }
}

// ─── Session Manager ──────────────────────────────────────────────────────────

class SessionManager {
    constructor() {
        /** @type {Map<string, Session>} */
        this._sessions = new Map();

        // Periodically clean up expired sessions
        this._cleanupInterval = setInterval(() => {
            this.cleanup();
        }, config.SESSION_CLEANUP_INTERVAL_MS);

        // Allow graceful shutdown
        if (this._cleanupInterval.unref) {
            this._cleanupInterval.unref();
        }
    }

    /**
     * Creates a new game session.
     *
     * @param {Object} [options]
     * @param {string} [options.playerName] - Display name.
     * @param {number} [options.startingBalance] - Player's starting chips.
     * @param {number} [options.houseBalance] - House's starting chips.
     * @returns {Session} The newly created session.
     * @throws {Error} If max session limit is reached.
     */
    create(options = {}) {
        if (this._sessions.size >= config.MAX_SESSIONS) {
            // Try cleaning up first
            this.cleanup();

            if (this._sessions.size >= config.MAX_SESSIONS) {
                throw new CapacityError(
                    `Server is at maximum capacity (${config.MAX_SESSIONS} sessions). Please try again later.`
                );
            }
        }

        const session = new Session(options);
        this._sessions.set(session.id, session);
        return session;
    }

    /**
     * Retrieves a session by ID.
     *
     * @param {string} sessionId
     * @returns {Session}
     * @throws {Error} If the session doesn't exist or has expired.
     */
    get(sessionId) {
        const session = this._sessions.get(sessionId);

        if (!session) {
            throw new NotFoundError(`Session "${sessionId}" not found.`);
        }

        if (session.isExpired()) {
            this._sessions.delete(sessionId);
            throw new GoneError(
                `Session "${sessionId}" has expired due to inactivity. Please start a new game.`
            );
        }

        session.touch();
        return session;
    }

    /**
     * Checks if a session exists and is still valid.
     *
     * @param {string} sessionId
     * @returns {boolean}
     */
    has(sessionId) {
        try {
            this.get(sessionId);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Destroys a session.
     *
     * @param {string} sessionId
     * @returns {boolean} True if the session existed and was deleted.
     */
    destroy(sessionId) {
        return this._sessions.delete(sessionId);
    }

    /**
     * Lists all active (non-expired) sessions as summaries.
     *
     * @returns {Object[]} Array of session summaries.
     */
    listAll() {
        const active = [];
        for (const session of this._sessions.values()) {
            if (session.isExpired()) {
                this._sessions.delete(session.id);
            } else {
                active.push(session.toSummary());
            }
        }
        return active;
    }

    /**
     * Returns the number of active sessions.
     * @returns {number}
     */
    get activeCount() {
        return this._sessions.size;
    }

    /**
     * Removes all expired sessions.
     * @returns {number} Number of sessions cleaned up.
     */
    cleanup() {
        let cleaned = 0;
        for (const [id, session] of this._sessions) {
            if (session.isExpired()) {
                this._sessions.delete(id);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            console.log(`[SessionManager] Cleaned up ${cleaned} expired session(s).`);
        }
        return cleaned;
    }

    /** Stops the cleanup timer (for graceful shutdown). */
    shutdown() {
        clearInterval(this._cleanupInterval);
    }
}

// ─── Singleton ────────────────────────────────────────────────────────────────
// One SessionManager per server process.

const sessionManager = new SessionManager();

module.exports = {
    Session,
    SessionManager,
    sessionManager,
};
