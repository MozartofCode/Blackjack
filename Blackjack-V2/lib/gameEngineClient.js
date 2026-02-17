/**
 * @fileoverview Low-level HTTP client for the old Flask Game Engine backend.
 *
 * This module is the ONLY place that knows how to make raw HTTP calls to the
 * legacy Flask server. All methods return parsed JSON or throw a structured error.
 *
 * No game logic lives here — that belongs in `gameService.js`.
 */

const config = require("./config");

/**
 * Custom error class for Game Engine communication failures.
 */
class GameEngineError extends Error {
    /**
     * @param {string} message - Human-readable error description.
     * @param {string} endpoint - The Flask endpoint that was called.
     * @param {number} [status] - HTTP status code (if a response was received).
     * @param {any} [responseBody] - The raw response body (if available).
     */
    constructor(message, endpoint, status = null, responseBody = null) {
        super(message);
        this.name = "GameEngineError";
        this.endpoint = endpoint;
        this.status = status;
        this.responseBody = responseBody;
    }
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Builds the full URL for a given Flask endpoint.
 * @param {string} path - e.g. "/game-state"
 * @returns {string} Full URL, e.g. "http://127.0.0.1:5000/game-state"
 */
function buildUrl(path) {
    return `${config.GAME_ENGINE_URL}${path}`;
}

/**
 * Performs a fetch with timeout via AbortController.
 * Parses JSON on success, throws GameEngineError on failure.
 *
 * @param {string} endpoint - The Flask route, e.g. "/game-state".
 * @param {RequestInit} [options={}] - Standard fetch options.
 * @returns {Promise<any>} Parsed JSON response.
 * @throws {GameEngineError} On network error, timeout, or non-2xx response.
 */
async function request(endpoint, options = {}) {
    const url = buildUrl(endpoint);
    const controller = new AbortController();
    const timeoutId = setTimeout(
        () => controller.abort(),
        config.REQUEST_TIMEOUT_MS
    );

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            let body = null;
            try {
                body = await response.text();
            } catch {
                // Ignore if we can't read the body
            }
            throw new GameEngineError(
                `Game Engine returned HTTP ${response.status} for ${endpoint}`,
                endpoint,
                response.status,
                body
            );
        }

        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);

        // Re-throw our own errors as-is
        if (error instanceof GameEngineError) {
            throw error;
        }

        // Wrap network / abort errors
        if (error.name === "AbortError") {
            throw new GameEngineError(
                `Request to Game Engine timed out after ${config.REQUEST_TIMEOUT_MS}ms (${endpoint})`,
                endpoint
            );
        }

        throw new GameEngineError(
            `Failed to connect to Game Engine at ${url}: ${error.message}`,
            endpoint
        );
    }
}

// ─── Public API (mirrors Flask endpoints 1:1) ──────────────────────────────────

/**
 * GET /game-state
 * Fetches the current game state from the Flask backend.
 *
 * @returns {Promise<import('./types').GameState>} The full game state object.
 * @throws {GameEngineError}
 */
async function getGameState() {
    return request("/game-state", { method: "GET" });
}

/**
 * POST /player-action
 * Sends a player action (Hit or Stand) to the Flask backend.
 *
 * @param {import('./types').PlayerAction} action - "H" for Hit, "S" for Stand.
 * @returns {Promise<import('./types').GameState>} Updated game state after the action.
 * @throws {GameEngineError}
 */
async function postPlayerAction(action) {
    return request("/player-action", {
        method: "POST",
        body: JSON.stringify({ action }),
    });
}

/**
 * POST /player-bet
 * Submits a player's bet for the current round.
 *
 * @param {number} bet - The bet amount (minimum $10).
 * @returns {Promise<import('./types').GameState>} Updated game state after placing the bet.
 * @throws {GameEngineError}
 */
async function postPlayerBet(bet) {
    return request("/player-bet", {
        method: "POST",
        body: JSON.stringify({ bet }),
    });
}

/**
 * POST /house-action
 * Triggers the house to play its turn (hits until 17+, resolves the round).
 *
 * @returns {Promise<import('./types').GameState>} Updated game state after house plays.
 * @throws {GameEngineError}
 */
async function postHouseAction() {
    return request("/house-action", { method: "POST" });
}

/**
 * POST /house-bet
 * Sends a house bet. (Currently a no-op in the Flask backend, included for completeness.)
 *
 * @param {number} bet - The house bet amount.
 * @returns {Promise<import('./types').GameState>} Current game state (unchanged).
 * @throws {GameEngineError}
 */
async function postHouseBet(bet) {
    return request("/house-bet", {
        method: "POST",
        body: JSON.stringify({ bet }),
    });
}

/**
 * POST /initialize-round
 * Resets the game for a new round: zeros bets, clears hands, deals new cards.
 *
 * @returns {Promise<import('./types').GameState>} Fresh game state for the new round.
 * @throws {GameEngineError}
 */
async function postInitializeRound() {
    return request("/initialize-round", { method: "POST" });
}

module.exports = {
    GameEngineError,
    getGameState,
    postPlayerAction,
    postPlayerBet,
    postHouseAction,
    postHouseBet,
    postInitializeRound,
};
