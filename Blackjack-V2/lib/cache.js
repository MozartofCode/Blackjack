/**
 * @fileoverview In-process cache layer for Blackjack V2.
 *
 * Caches expensive database queries (leaderboard, global stats) so they
 * don't hit Supabase on every request. Cache entries auto-expire after
 * a configurable TTL.
 *
 * Why not Redis?
 * ─────────────────────────────────────────────────────────────────────
 * This backend runs as a single Node.js process. An in-process cache
 * gives us ~0.001ms lookups with zero infrastructure overhead. Redis
 * would add network hops and operational complexity for no benefit.
 *
 * If/when you scale to multiple server instances behind a load balancer,
 * swap this module for a Redis-backed cache (the API is identical).
 *
 * Cache Strategy
 * ─────────────────────────────────────────────────────────────────────
 * ┌──────────────────┬────────┬─────────────────────────────────────┐
 * │ Key              │ TTL    │ Why                                 │
 * ├──────────────────┼────────┼─────────────────────────────────────┤
 * │ leaderboard      │ 30s    │ Changes only when rounds complete   │
 * │ global_stats     │ 30s    │ Aggregate query, rarely time-critical│
 * │ player:{name}    │ 60s    │ Player lookup cache                 │
 * └──────────────────┴────────┴─────────────────────────────────────┘
 */

const NodeCache = require("node-cache");

// ─── Cache Instance ───────────────────────────────────────────────────────────

const cache = new NodeCache({
    stdTTL: 30,          // Default: 30 seconds
    checkperiod: 10,     // Check for expired keys every 10 seconds
    useClones: false,    // Return references (faster, safe for read-only data)
    deleteOnExpire: true,
});

// ─── Cache Keys ───────────────────────────────────────────────────────────────

const KEYS = {
    LEADERBOARD: "leaderboard",
    GLOBAL_STATS: "global_stats",
    playerKey: (name) => `player:${name}`,
};

// ─── Cache Wrapper ────────────────────────────────────────────────────────────

/**
 * Generic cache-aside (lazy loading) wrapper.
 *
 * 1. Check cache for the key
 * 2. If hit → return cached value (⚡ instant)
 * 3. If miss → call the fetcher function, cache the result, return it
 *
 * @param {string} key - Cache key.
 * @param {Function} fetcher - Async function that returns the fresh data.
 * @param {number} [ttl] - Override the default TTL for this key (seconds).
 * @returns {Promise<*>} The cached or freshly fetched data.
 */
async function getOrFetch(key, fetcher, ttl) {
    const cached = cache.get(key);
    if (cached !== undefined) {
        return cached;
    }

    const fresh = await fetcher();
    if (fresh !== null && fresh !== undefined) {
        cache.set(key, fresh, ttl);
    }
    return fresh;
}

// ─── Invalidation ─────────────────────────────────────────────────────────────

/**
 * Invalidates cache entries that depend on round results.
 * Call this after a round completes to ensure the next read gets fresh data.
 */
function invalidateAfterRound() {
    cache.del([KEYS.LEADERBOARD, KEYS.GLOBAL_STATS]);
}

/**
 * Invalidates a specific player's cache.
 * @param {string} playerName
 */
function invalidatePlayer(playerName) {
    cache.del(KEYS.playerKey(playerName));
}

/**
 * Clears the entire cache.
 */
function flushAll() {
    cache.flushAll();
}

// ─── Stats ────────────────────────────────────────────────────────────────────

/**
 * Returns cache performance metrics.
 * @returns {{ hits: number, misses: number, keys: number, hitRate: string }}
 */
function getStats() {
    const stats = cache.getStats();
    const total = stats.hits + stats.misses;
    return {
        hits: stats.hits,
        misses: stats.misses,
        keys: cache.keys().length,
        hitRate: total > 0 ? `${Math.round((stats.hits / total) * 100)}%` : "0%",
    };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    cache,
    KEYS,
    getOrFetch,
    invalidateAfterRound,
    invalidatePlayer,
    flushAll,
    getStats,
};
