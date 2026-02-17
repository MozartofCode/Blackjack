/**
 * Configuration for the Blackjack V2 backend.
 * Loads from .env file first, then falls back to sensible defaults.
 */

require("dotenv").config();

const config = {
    // ── Server ──────────────────────────────────────────────────────────────────
    /** Port for the Express API server */
    PORT: parseInt(process.env.PORT, 10) || 3000,

    // ── CORS ────────────────────────────────────────────────────────────────────
    /**
     * Allowed origins for CORS requests.
     * In development: "*" allows all origins.
     * In production: set CORS_ORIGINS to a comma-separated list of origins.
     * Example: CORS_ORIGINS=https://casino.example.com,https://admin.example.com
     */
    CORS_ORIGINS: process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim())
        : "*",

    // ── Legacy Flask Backend (Game Engine) ──────────────────────────────────────
    /** Base URL of the old Flask backend */
    GAME_ENGINE_URL: process.env.GAME_ENGINE_URL || "http://127.0.0.1:5000",

    /** Timeout in milliseconds for requests to the Game Engine */
    REQUEST_TIMEOUT_MS: parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 10000,

    // ── Session Management ──────────────────────────────────────────────────────
    /** How long a session lives without activity (default: 30 minutes) */
    SESSION_TTL_MS: parseInt(process.env.SESSION_TTL_MS, 10) || 30 * 60 * 1000,

    /** How often to sweep for expired sessions (default: every 5 minutes) */
    SESSION_CLEANUP_INTERVAL_MS:
        parseInt(process.env.SESSION_CLEANUP_INTERVAL_MS, 10) || 5 * 60 * 1000,

    /** Maximum concurrent sessions (protect server memory) */
    MAX_SESSIONS: parseInt(process.env.MAX_SESSIONS, 10) || 100,

    // ── Rate Limiting ───────────────────────────────────────────────────────────
    /** Max requests per window per IP */
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,

    /** Rate limit window in minutes */
    RATE_LIMIT_WINDOW_MINUTES:
        parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 10) || 1,

    // ── Game Defaults ───────────────────────────────────────────────────────────
    /** Default starting balance for a new player */
    DEFAULT_PLAYER_BALANCE: 10000,

    /** Default starting balance for the house */
    DEFAULT_HOUSE_BALANCE: 10000,

    /** Minimum bet amount */
    MINIMUM_BET: 10,
};

module.exports = config;
