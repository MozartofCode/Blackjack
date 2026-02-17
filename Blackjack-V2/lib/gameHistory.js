/**
 * @fileoverview In-memory Game History Tracker for Blackjack V2.
 *
 * Records the outcome of every completed round per session. Provides
 * per-session and server-wide statistics. When the user adds a database
 * later, this module's storage can be swapped to persistent storage
 * without changing the public API.
 *
 * ┌────────────────────────────────────────────────────────────────────┐
 * │               Tracked Per Round                                   │
 * ├────────────┬───────────────────────────────────────────────────────┤
 * │ sessionId  │ Which session this round belongs to                  │
 * │ roundNum   │ Sequential round number within the session           │
 * │ outcome    │ player_blackjack | player_win | house_win | ...      │
 * │ playerHand │ Cards the player had                                 │
 * │ houseHand  │ Cards the house had                                  │
 * │ playerVal  │ Final hand value                                     │
 * │ houseVal   │ Final hand value                                     │
 * │ bet        │ The bet amount                                       │
 * │ payout     │ Net change to player balance (+win, -loss, 0 push)   │
 * │ balanceAfter│ Player balance after the round                      │
 * │ timestamp  │ When the round completed                             │
 * └────────────┴───────────────────────────────────────────────────────┘
 */

const { calculateHandValue } = require("./gameEngine");

// ─── Storage ──────────────────────────────────────────────────────────────────

/**
 * @type {Map<string, Object[]>}
 * Maps sessionId → array of round records.
 */
const _history = new Map();

/** Global stats counters */
const _globalStats = {
    totalRounds: 0,
    outcomes: {
        player_blackjack: 0,
        player_win: 0,
        player_bust: 0,
        house_win: 0,
        house_bust: 0,
        push: 0,
    },
};

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Records a completed round.
 *
 * @param {string} sessionId - The session this round belongs to.
 * @param {Object} enrichedState - The enriched game state after the round.
 * @param {number} balanceBefore - Player balance before the round resolved.
 */
function recordRound(sessionId, enrichedState, balanceBefore) {
    const { house, player, computed, session } = enrichedState;

    // Only record completed rounds
    if (computed.outcome === "in_progress") return;

    const balanceAfter = player.money;
    const payout = balanceAfter - balanceBefore;

    const record = {
        sessionId,
        roundNum: session.roundsPlayed,
        outcome: computed.outcome,
        playerHand: [...player.cards],
        houseHand: [...house.cards],
        playerVal: computed.playerHandValue,
        houseVal: computed.houseHandValue,
        bet: player.bet,
        payout,
        balanceAfter,
        timestamp: new Date().toISOString(),
    };

    // Store per-session
    if (!_history.has(sessionId)) {
        _history.set(sessionId, []);
    }
    _history.get(sessionId).push(record);

    // Update global counters
    _globalStats.totalRounds++;
    if (_globalStats.outcomes[computed.outcome] !== undefined) {
        _globalStats.outcomes[computed.outcome]++;
    }
}

/**
 * Gets the round history for a specific session.
 *
 * @param {string} sessionId
 * @returns {Object[]} Array of round records, most recent last.
 */
function getSessionHistory(sessionId) {
    return _history.get(sessionId) || [];
}

/**
 * Gets statistics for a specific session.
 *
 * @param {string} sessionId
 * @returns {Object} Session stats.
 */
function getSessionStats(sessionId) {
    const rounds = _history.get(sessionId) || [];

    if (rounds.length === 0) {
        return {
            sessionId,
            totalRounds: 0,
            wins: 0,
            losses: 0,
            pushes: 0,
            blackjacks: 0,
            winRate: 0,
            netProfit: 0,
            biggestWin: 0,
            biggestLoss: 0,
            currentStreak: { type: "none", count: 0 },
        };
    }

    let wins = 0;
    let losses = 0;
    let pushes = 0;
    let blackjacks = 0;
    let netProfit = 0;
    let biggestWin = 0;
    let biggestLoss = 0;

    for (const round of rounds) {
        netProfit += round.payout;

        if (round.payout > biggestWin) biggestWin = round.payout;
        if (round.payout < biggestLoss) biggestLoss = round.payout;

        if (round.outcome === "player_blackjack") {
            wins++;
            blackjacks++;
        } else if (
            round.outcome === "player_win" ||
            round.outcome === "house_bust"
        ) {
            wins++;
        } else if (
            round.outcome === "house_win" ||
            round.outcome === "player_bust"
        ) {
            losses++;
        } else if (round.outcome === "push") {
            pushes++;
        }
    }

    // Calculate current streak
    let streakType = "none";
    let streakCount = 0;
    for (let i = rounds.length - 1; i >= 0; i--) {
        const r = rounds[i];
        const isWin =
            r.outcome === "player_win" ||
            r.outcome === "player_blackjack" ||
            r.outcome === "house_bust";
        const isLoss =
            r.outcome === "house_win" || r.outcome === "player_bust";

        if (streakCount === 0) {
            if (isWin) {
                streakType = "win";
                streakCount = 1;
            } else if (isLoss) {
                streakType = "loss";
                streakCount = 1;
            }
            // Skip pushes for streak tracking
        } else if (
            (streakType === "win" && isWin) ||
            (streakType === "loss" && isLoss)
        ) {
            streakCount++;
        } else {
            break;
        }
    }

    const totalDecided = wins + losses; // Exclude pushes from win rate

    return {
        sessionId,
        totalRounds: rounds.length,
        wins,
        losses,
        pushes,
        blackjacks,
        winRate: totalDecided > 0 ? Math.round((wins / totalDecided) * 100) : 0,
        netProfit,
        biggestWin,
        biggestLoss,
        currentStreak: { type: streakType, count: streakCount },
    };
}

/**
 * Gets server-wide statistics across all sessions.
 *
 * @returns {Object} Global stats.
 */
function getGlobalStats() {
    const totalDecided =
        _globalStats.outcomes.player_blackjack +
        _globalStats.outcomes.player_win +
        _globalStats.outcomes.house_bust +
        _globalStats.outcomes.house_win +
        _globalStats.outcomes.player_bust;

    const totalWins =
        _globalStats.outcomes.player_blackjack +
        _globalStats.outcomes.player_win +
        _globalStats.outcomes.house_bust;

    return {
        ..._globalStats,
        activeSessions: _history.size,
        playerWinRate:
            totalDecided > 0 ? Math.round((totalWins / totalDecided) * 100) : 0,
    };
}

/**
 * Cleans up history for a destroyed session.
 *
 * @param {string} sessionId
 * @returns {boolean} True if history existed and was removed.
 */
function clearSessionHistory(sessionId) {
    return _history.delete(sessionId);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    recordRound,
    getSessionHistory,
    getSessionStats,
    getGlobalStats,
    clearSessionHistory,
};
