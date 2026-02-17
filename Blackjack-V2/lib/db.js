/**
 * @fileoverview Supabase Database Layer for Blackjack V2.
 *
 * This module provides all database operations for game persistence.
 * It mirrors the in-memory API from gameHistory.js but writes to Supabase.
 * The gameHistory.js module still works as the in-memory "hot" cache,
 * while this module handles the persistent "cold" storage.
 *
 * Architecture:
 * ┌────────────┐     ┌───────────┐     ┌────────────────┐     ┌───────────────┐
 * │ gameService│ ──▶ │  db.js    │ ──▶ │ CircuitBreaker  │ ──▶ │ Supabase      │
 * │            │     │ (+ cache) │     │ (fail-fast gate)│     │ (Postgres)    │
 * └────────────┘     └───────────┘     └────────────────┘     └───────────────┘
 *
 * Design Decisions:
 * - All DB operations are async and fire-and-forget where possible
 *   (game speed takes priority over write guarantees)
 * - Errors are logged but don't crash the game (graceful degradation)
 * - Circuit breaker prevents cascading failures when Supabase is down
 * - The in-memory session/game state is the source of truth during play
 * - Supabase is the source of truth for history/stats/leaderboard
 */

const { supabase, isSupabaseEnabled, dbCircuitBreaker } = require("./supabaseClient");
const { getOrFetch, KEYS, invalidateAfterRound, invalidatePlayer } = require("./cache");
const logger = require("./logger");

const log = logger.child({ component: "db" });

// ─── Player Operations ────────────────────────────────────────────────────────

/**
 * Finds or creates a player by name.
 * Uses upsert with the unique player_name constraint.
 *
 * @param {string} playerName
 * @returns {Promise<Object|null>} The player record, or null if DB is disabled.
 */
async function findOrCreatePlayer(playerName) {
    if (!isSupabaseEnabled()) return null;

    // Check cache first (60s TTL for player lookups)
    return getOrFetch(KEYS.playerKey(playerName), async () => {
        return dbCircuitBreaker.fire(async () => {
            // Try to find existing player
            const { data: existing, error: findError } = await supabase
                .from("players")
                .select("*")
                .eq("player_name", playerName)
                .maybeSingle();

            if (findError) {
                throw new Error(`Error finding player: ${findError.message}`);
            }

            if (existing) return existing;

            // Create new player
            const { data: newPlayer, error: createError } = await supabase
                .from("players")
                .insert({ player_name: playerName })
                .select()
                .single();

            if (createError) {
                throw new Error(`Error creating player: ${createError.message}`);
            }

            log.info("Player created", { playerName });
            return newPlayer;
        }, null); // fallback: null
    }, 60);
}

// ─── Session Operations ───────────────────────────────────────────────────────

/**
 * Persists a new session to the database.
 *
 * @param {Object} params
 * @param {string} params.sessionId - The in-memory session UUID.
 * @param {string} params.playerName
 * @param {string|null} params.playerId - The DB player UUID.
 * @param {number} params.startingBalance
 * @returns {Promise<Object|null>}
 */
async function createSession({ sessionId, playerName, playerId, startingBalance }) {
    if (!isSupabaseEnabled()) return null;

    return dbCircuitBreaker.fire(async () => {
        const { data, error } = await supabase
            .from("sessions")
            .insert({
                id: sessionId,
                player_id: playerId,
                player_name: playerName,
                starting_balance: startingBalance,
                current_balance: startingBalance,
                status: "active",
            })
            .select()
            .single();

        if (error) {
            throw new Error(`Error creating session: ${error.message}`);
        }

        // Increment player's session count
        if (playerId) {
            const { data: player } = await supabase
                .from("players")
                .select("total_sessions")
                .eq("id", playerId)
                .single();

            if (player) {
                await supabase
                    .from("players")
                    .update({ total_sessions: player.total_sessions + 1 })
                    .eq("id", playerId);
            }
        }

        log.info("Session created", { sessionId, playerName });
        return data;
    }, null);
}

/**
 * Updates session activity timestamp and balance.
 *
 * @param {string} sessionId
 * @param {number} currentBalance
 * @param {number} roundsPlayed
 */
async function updateSession(sessionId, currentBalance, roundsPlayed) {
    if (!isSupabaseEnabled()) return;

    await dbCircuitBreaker.fire(async () => {
        const { error } = await supabase
            .from("sessions")
            .update({
                current_balance: currentBalance,
                rounds_played: roundsPlayed,
                last_activity_at: new Date().toISOString(),
            })
            .eq("id", sessionId);

        if (error) throw new Error(`Error updating session: ${error.message}`);
    });
}

/**
 * Marks a session as completed.
 *
 * @param {string} sessionId
 * @param {number} finalBalance
 */
async function endSession(sessionId, finalBalance) {
    if (!isSupabaseEnabled()) return;

    await dbCircuitBreaker.fire(async () => {
        const { error } = await supabase
            .from("sessions")
            .update({
                status: "completed",
                current_balance: finalBalance,
                ended_at: new Date().toISOString(),
            })
            .eq("id", sessionId);

        if (error) throw new Error(`Error ending session: ${error.message}`);
        log.info("Session ended", { sessionId, finalBalance });
    });
}

// ─── Round Operations ─────────────────────────────────────────────────────────

/**
 * Records a completed round to the database.
 * Also updates the player's lifetime stats.
 *
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {string|null} params.playerId
 * @param {number} params.roundNumber
 * @param {string} params.outcome
 * @param {string[]} params.playerHand
 * @param {string[]} params.houseHand
 * @param {number} params.playerHandValue
 * @param {number} params.houseHandValue
 * @param {number} params.bet
 * @param {number} params.payout
 * @param {number} params.balanceAfter
 */
async function recordRound({
    sessionId,
    playerId,
    roundNumber,
    outcome,
    playerHand,
    houseHand,
    playerHandValue,
    houseHandValue,
    bet,
    payout,
    balanceAfter,
}) {
    if (!isSupabaseEnabled()) return;

    await dbCircuitBreaker.fire(async () => {
        // Insert the round
        const { error } = await supabase.from("rounds").insert({
            session_id: sessionId,
            player_id: playerId,
            round_number: roundNumber,
            outcome,
            player_hand: playerHand,
            house_hand: houseHand,
            player_hand_value: playerHandValue,
            house_hand_value: houseHandValue,
            bet,
            payout,
            balance_after: balanceAfter,
        });

        if (error) {
            throw new Error(`Error recording round: ${error.message}`);
        }

        // Update player lifetime stats
        if (playerId) {
            await updatePlayerStats(playerId, outcome, payout);
        }

        // Invalidate cached leaderboard/stats (they're now stale)
        invalidateAfterRound();

        log.debug("Round recorded", { sessionId, roundNumber, outcome, payout });
    });
}

/**
 * Updates a player's lifetime stats after a round.
 *
 * @param {string} playerId
 * @param {string} outcome
 * @param {number} payout
 */
async function updatePlayerStats(playerId, outcome, payout) {
    if (!isSupabaseEnabled()) return;

    // NOTE: This runs inside the circuit breaker from recordRound,
    //       so we don't double-wrap it.
    try {
        // Fetch current stats
        const { data: player, error: fetchError } = await supabase
            .from("players")
            .select("*")
            .eq("id", playerId)
            .single();

        if (fetchError || !player) return;

        // Calculate new stats
        const updates = {
            total_rounds: player.total_rounds + 1,
            net_profit: player.net_profit + payout,
        };

        if (payout > player.biggest_win) updates.biggest_win = payout;
        if (payout < player.biggest_loss) updates.biggest_loss = payout;

        if (outcome === "player_blackjack") {
            updates.total_wins = player.total_wins + 1;
            updates.total_blackjacks = player.total_blackjacks + 1;
        } else if (outcome === "player_win" || outcome === "house_bust") {
            updates.total_wins = player.total_wins + 1;
        } else if (outcome === "house_win" || outcome === "player_bust") {
            updates.total_losses = player.total_losses + 1;
        } else if (outcome === "push") {
            updates.total_pushes = player.total_pushes + 1;
        }

        await supabase.from("players").update(updates).eq("id", playerId);
    } catch (err) {
        log.error("Error updating player stats", { playerId, error: err.message });
    }
}

// ─── Query Operations ─────────────────────────────────────────────────────────

/**
 * Gets the leaderboard from the database.
 *
 * @param {number} [limit=10] - Number of players to return.
 * @returns {Promise<Object[]>} Top players sorted by net profit.
 */
async function getLeaderboard(limit = 10) {
    if (!isSupabaseEnabled()) return [];

    // Cache key includes limit to avoid serving wrong page sizes
    const cacheKey = `${KEYS.LEADERBOARD}:${limit}`;

    return getOrFetch(cacheKey, async () => {
        return dbCircuitBreaker.fire(async () => {
            const { data, error } = await supabase
                .from("leaderboard")
                .select("*")
                .limit(limit);

            if (error) {
                throw new Error(`Error fetching leaderboard: ${error.message}`);
            }

            return data || [];
        }, []); // fallback: empty array
    }, 30);
}

/**
 * Gets global stats from the database.
 *
 * @returns {Promise<Object|null>}
 */
async function getGlobalStats() {
    if (!isSupabaseEnabled()) return null;

    return getOrFetch(KEYS.GLOBAL_STATS, async () => {
        return dbCircuitBreaker.fire(async () => {
            const { data, error } = await supabase
                .from("global_stats")
                .select("*")
                .single();

            if (error) {
                throw new Error(`Error fetching global stats: ${error.message}`);
            }

            return data;
        }, null); // fallback: null
    }, 30);
}

/**
 * Gets round history for a session from the database.
 *
 * @param {string} sessionId
 * @returns {Promise<Object[]>}
 */
async function getSessionRounds(sessionId) {
    if (!isSupabaseEnabled()) return [];

    return dbCircuitBreaker.fire(async () => {
        const { data, error } = await supabase
            .from("rounds")
            .select("*")
            .eq("session_id", sessionId)
            .order("round_number", { ascending: true });

        if (error) {
            throw new Error(`Error fetching session rounds: ${error.message}`);
        }

        return data || [];
    }, []); // fallback: empty array
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    // Player
    findOrCreatePlayer,

    // Session
    createSession,
    updateSession,
    endSession,

    // Round
    recordRound,

    // Queries
    getLeaderboard,
    getGlobalStats,
    getSessionRounds,
};
