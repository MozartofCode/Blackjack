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
                .insert({ player_name: playerName, balance: 1000000 })
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

/**
 * Registers a new player with a name and PIN.
 * @param {string} playerName
 * @param {string} pin - 4-digit PIN
 * @returns {Promise<Object|null>}
 */
async function registerPlayer(playerName, pin) {
    if (!isSupabaseEnabled()) return null;

    return dbCircuitBreaker.fire(async () => {
        // Check if name already exists
        const { data: existing } = await supabase
            .from("players")
            .select("id")
            .eq("player_name", playerName)
            .maybeSingle();

        if (existing) {
            const err = new Error("This player name is already taken");
            err.status = 409;
            throw err;
        }

        const { data, error } = await supabase
            .from("players")
            .insert({ player_name: playerName, pin, balance: 1000000 })
            .select("id, player_name, balance, total_sessions, total_rounds, total_wins, total_losses, total_pushes, total_blackjacks, net_profit, biggest_win, biggest_loss, created_at")
            .single();

        if (error) throw new Error(`Error registering player: ${error.message}`);

        log.info("Player registered", { playerName });
        return data;
    }, null);
}

/**
 * Logs in a player by verifying name + PIN.
 * @param {string} playerName
 * @param {string} pin
 * @returns {Promise<Object|null>} Player record or null
 */
async function loginPlayer(playerName, pin) {
    if (!isSupabaseEnabled()) return null;

    return dbCircuitBreaker.fire(async () => {
        const { data, error } = await supabase
            .from("players")
            .select("id, player_name, pin, balance, total_sessions, total_rounds, total_wins, total_losses, total_pushes, total_blackjacks, net_profit, biggest_win, biggest_loss, created_at")
            .eq("player_name", playerName)
            .maybeSingle();

        if (error) throw new Error(`Error looking up player: ${error.message}`);

        if (!data) {
            const err = new Error("We have not recognized this name please register");
            err.status = 404;
            throw err;
        }

        if (data.pin !== pin) {
            const err = new Error("Incorrect password please try again");
            err.status = 401;
            throw err;
        }

        // Strip PIN from response
        const { pin: _, ...player } = data;
        return player;
    }, null);
}

/**
 * Gets a player's full profile with stats.
 * @param {string} playerId
 * @returns {Promise<Object|null>}
 */
async function getPlayerProfile(playerId) {
    if (!isSupabaseEnabled()) return null;

    return dbCircuitBreaker.fire(async () => {
        const { data, error } = await supabase
            .from("players")
            .select("id, player_name, balance, total_sessions, total_rounds, total_wins, total_losses, total_pushes, total_blackjacks, net_profit, biggest_win, biggest_loss, created_at")
            .eq("id", playerId)
            .single();

        if (error) throw new Error(`Error fetching player profile: ${error.message}`);
        return data;
    }, null);
}

/**
 * Gets paginated gameplay history for a player.
 * @param {string} playerId
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<Object[]>}
 */
async function getPlayerHistory(playerId, limit = 50, offset = 0) {
    if (!isSupabaseEnabled()) return [];

    return dbCircuitBreaker.fire(async () => {
        const { data, error, count } = await supabase
            .from("rounds")
            .select("id, session_id, round_number, outcome, player_hand_value, house_hand_value, bet, payout, balance_after, created_at", { count: "exact" })
            .eq("player_id", playerId)
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw new Error(`Error fetching player history: ${error.message}`);
        return { rounds: data || [], total: count || 0 };
    }, { rounds: [], total: 0 });
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
            balance: (player.balance || 0) + payout,
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

// ─── Bot Operations ──────────────────────────────────────────────────────────

/**
 * Gets all bots from the database.
 * @returns {Promise<Object[]>}
 */
async function getBots() {
    if (!isSupabaseEnabled()) return [];

    return getOrFetch('bots_list', async () => {
        return dbCircuitBreaker.fire(async () => {
            const { data, error } = await supabase
                .from("bots")
                .select("*")
                .order("id", { ascending: true });

            if (error) throw new Error(`Error fetching bots: ${error.message}`);
            return data || [];
        }, []);
    }, 60);
}

/**
 * Gets a bot's full profile.
 * @param {number} botId
 * @returns {Promise<Object|null>}
 */
async function getBotProfile(botId) {
    if (!isSupabaseEnabled()) return null;

    return dbCircuitBreaker.fire(async () => {
        const { data, error } = await supabase
            .from("bots")
            .select("*")
            .eq("id", botId)
            .single();

        if (error) throw new Error(`Error fetching bot profile: ${error.message}`);
        return data;
    }, null);
}

/**
 * Gets bot performance history.
 * @param {number} botId
 * @param {number} limit
 * @returns {Promise<Object[]>}
 */
async function getBotPerformance(botId, limit = 50) {
    if (!isSupabaseEnabled()) return [];

    return dbCircuitBreaker.fire(async () => {
        const { data, error } = await supabase
            .from("bot_performance")
            .select("*")
            .eq("bot_id", botId)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (error) throw new Error(`Error fetching bot performance: ${error.message}`);
        return data || [];
    }, []);
}

/**
 * Records a bot's round performance and updates their stats.
 * 
 * @param {Object} params
 * @param {number} params.botId
 * @param {number} params.payout
 * @param {string} params.outcome
 * @param {number} params.handValue
 * @param {number} params.houseValue
 * @param {string} params.action
 * @param {number} params.bet
 * @param {number[]} params.othersHandValues
 * @param {string} params.houseUpCard
 */
async function recordBotRound({
    botId,
    payout,
    outcome,
    handValue,
    houseValue,
    action,
    bet,
    othersHandValues,
    houseUpCard
}) {
    if (!isSupabaseEnabled()) return;

    await dbCircuitBreaker.fire(async () => {
        // 1. Record performance
        const { error: perfError } = await supabase.from("bot_performance").insert({
            bot_id: botId,
            bot_hand_value: handValue,
            house_hand_value: houseValue,
            action_taken: action,
            bet: bet,
            payout: payout,
            others_hand_values: othersHandValues,
            house_up_card: houseUpCard
        });

        if (perfError) throw new Error(`Error recording bot performance: ${perfError.message}`);

        // 2. Update bot stats
        const { data: bot } = await supabase.from("bots").select("*").eq("id", botId).single();
        if (bot) {
            const updates = {
                balance: Number(bot.balance) + payout,
                total_rounds: bot.total_rounds + 1,
                net_profit: Number(bot.net_profit) + payout,
            };

            if (outcome === "player_blackjack") {
                updates.total_wins = bot.total_wins + 1;
                updates.total_blackjacks = bot.total_blackjacks + 1;
            } else if (outcome === "player_win" || outcome === "house_bust") {
                updates.total_wins = bot.total_wins + 1;
            } else if (outcome === "house_win" || outcome === "player_bust") {
                updates.total_losses = bot.total_losses + 1;
            } else if (outcome === "push") {
                updates.total_pushes = bot.total_pushes + 1;
            }

            await supabase.from("bots").update(updates).eq("id", botId);
        }
    });
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
    registerPlayer,
    loginPlayer,
    getPlayerProfile,
    getPlayerHistory,

    // Session
    createSession,
    updateSession,
    endSession,

    // Round
    recordRound,

    // Bot
    getBots,
    getBotProfile,
    getBotPerformance,
    recordBotRound,

    // Queries
    getLeaderboard,
    getGlobalStats,
    getSessionRounds,
};
