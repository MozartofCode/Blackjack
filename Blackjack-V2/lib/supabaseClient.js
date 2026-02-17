/**
 * @fileoverview Supabase Client for Blackjack V2.
 *
 * Creates a singleton Supabase client using the service_role key.
 * The service_role key bypasses Row Level Security, which is correct
 * for server-side operations. Never expose this key to the frontend.
 *
 * Now includes a circuit breaker so that if Supabase becomes unreachable,
 * we fail fast instead of blocking game actions on connection timeouts.
 *
 * ┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐
 * │  Backend     │ ──▶ │ Circuit Breaker  │ ──▶ │  supabaseClient  │ ──▶ │  Supabase DB │
 * │  (db.js)     │     │ (fail-fast gate) │     │  (service_role)  │     │  (Postgres)  │
 * └──────────────┘     └─────────────────┘     └──────────────────┘     └──────────────┘
 */

const { createClient } = require("@supabase/supabase-js");
const config = require("./config");
const logger = require("./logger");
const { CircuitBreaker } = require("./circuitBreaker");

if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
    logger.warn("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. Database features disabled.");
}

/**
 * Supabase client instance.
 * Will be null if credentials are not configured.
 */
const supabase =
    config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY
        ? createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        })
        : null;

/**
 * Circuit breaker for Supabase operations.
 *
 * Configuration rationale:
 * - failureThreshold: 5 → Allow some transient errors before tripping
 * - resetTimeoutMs: 30s → Give Supabase time to recover
 * - successThreshold: 2 → Require 2 successful test calls before fully closing
 */
const dbCircuitBreaker = new CircuitBreaker({
    name: "supabase",
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    successThreshold: 2,
});

/**
 * Returns whether the Supabase connection is configured.
 * @returns {boolean}
 */
function isSupabaseEnabled() {
    return supabase !== null;
}

module.exports = {
    supabase,
    isSupabaseEnabled,
    dbCircuitBreaker,
};
