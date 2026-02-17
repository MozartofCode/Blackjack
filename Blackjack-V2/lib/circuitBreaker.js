/**
 * @fileoverview Circuit Breaker for external service calls (Supabase).
 *
 * The Problem:
 * ─────────────────────────────────────────────────────────────────────
 * When Supabase is down, every game action still tries to write to the DB.
 * Each attempt waits for the connection timeout (e.g., 10s), which:
 *   - Slows down every request
 *   - Wastes resources on doomed connections
 *   - Prevents the DB from recovering (request storms)
 *
 * The Solution — Circuit Breaker Pattern:
 * ─────────────────────────────────────────────────────────────────────
 *
 *   ┌──────────┐  success   ┌──────────┐
 *   │  CLOSED  │◄───────────│HALF_OPEN │
 *   │ (normal) │            │ (testing)│
 *   └────┬─────┘            └────┬─────┘
 *        │ failure threshold      │ failure
 *        ▼ reached                ▼
 *   ┌──────────┐  timeout   ┌──────────┐
 *   │   OPEN   │───────────▶│HALF_OPEN │
 *   │(failing) │            │ (testing)│
 *   └──────────┘            └──────────┘
 *
 *   CLOSED    → All requests pass through normally.
 *   OPEN      → All requests fail immediately (no DB call). Fast failure.
 *   HALF_OPEN → Allow ONE test request. If it succeeds → CLOSED. If not → OPEN.
 *
 * Interview talking points:
 * ─────────────────────────────────────────────────────────────────────
 * 1. Prevents cascading failures (DB overload → API overload → user overload)
 * 2. Gives the failing service time to recover
 * 3. Fail-fast reduces latency during outages (0ms vs 10s timeout)
 * 4. Half-open state provides automatic recovery detection
 * 5. Real-world usage: Netflix Hystrix, AWS App Mesh, Envoy proxy
 */

const logger = require("./logger");

const STATES = {
    CLOSED: "CLOSED",
    OPEN: "OPEN",
    HALF_OPEN: "HALF_OPEN",
};

class CircuitBreaker {
    /**
     * @param {Object} options
     * @param {string} options.name - Name for logging (e.g., "supabase").
     * @param {number} [options.failureThreshold=5] - Failures before opening.
     * @param {number} [options.resetTimeoutMs=30000] - How long to stay OPEN before trying HALF_OPEN.
     * @param {number} [options.halfOpenMaxAttempts=1] - Requests to allow in HALF_OPEN.
     * @param {number} [options.successThreshold=2] - Successes in HALF_OPEN before closing.
     */
    constructor({
        name,
        failureThreshold = 5,
        resetTimeoutMs = 30000,
        halfOpenMaxAttempts = 1,
        successThreshold = 2,
    } = {}) {
        this.name = name || "circuit-breaker";
        this.failureThreshold = failureThreshold;
        this.resetTimeoutMs = resetTimeoutMs;
        this.halfOpenMaxAttempts = halfOpenMaxAttempts;
        this.successThreshold = successThreshold;

        // ─── Internal State ───
        this._state = STATES.CLOSED;
        this._failureCount = 0;
        this._successCount = 0;
        this._halfOpenAttempts = 0;
        this._lastFailureTime = null;
        this._nextAttemptTime = null;

        // ─── Metrics ───
        this._stats = {
            totalCalls: 0,
            totalSuccesses: 0,
            totalFailures: 0,
            totalRejected: 0, // Requests rejected while OPEN
            stateChanges: [],
        };

        this._log = logger.child({ component: `circuit-breaker:${this.name}` });
    }

    /**
     * Current state of the circuit breaker.
     * @returns {string} "CLOSED" | "OPEN" | "HALF_OPEN"
     */
    get state() {
        // Auto-transition from OPEN → HALF_OPEN when timeout expires
        if (
            this._state === STATES.OPEN &&
            this._nextAttemptTime &&
            Date.now() >= this._nextAttemptTime
        ) {
            this._transition(STATES.HALF_OPEN);
        }
        return this._state;
    }

    /**
     * Executes a function through the circuit breaker.
     *
     * @param {Function} fn - Async function to execute.
     * @param {*} [fallback=null] - Value to return when the circuit is OPEN.
     * @returns {Promise<*>} The function's result or the fallback.
     */
    async fire(fn, fallback = null) {
        this._stats.totalCalls++;

        const currentState = this.state; // triggers auto-transition check

        // ─── OPEN: Reject immediately (fail-fast) ───
        if (currentState === STATES.OPEN) {
            this._stats.totalRejected++;
            this._log.debug("Circuit OPEN — request rejected (fail-fast)");
            return fallback;
        }

        // ─── HALF_OPEN: Allow limited test requests ───
        if (currentState === STATES.HALF_OPEN) {
            if (this._halfOpenAttempts >= this.halfOpenMaxAttempts) {
                this._stats.totalRejected++;
                this._log.debug("Circuit HALF_OPEN — max test requests reached, rejecting");
                return fallback;
            }
            this._halfOpenAttempts++;
        }

        // ─── CLOSED or HALF_OPEN test: Execute the function ───
        try {
            const result = await fn();
            this._onSuccess();
            return result;
        } catch (err) {
            this._onFailure(err);
            return fallback;
        }
    }

    /**
     * Records a successful call.
     * @private
     */
    _onSuccess() {
        this._stats.totalSuccesses++;

        if (this._state === STATES.HALF_OPEN) {
            this._successCount++;
            if (this._successCount >= this.successThreshold) {
                this._transition(STATES.CLOSED);
            }
        }

        // Reset failure count on success in CLOSED state
        if (this._state === STATES.CLOSED) {
            this._failureCount = 0;
        }
    }

    /**
     * Records a failed call.
     * @param {Error} err
     * @private
     */
    _onFailure(err) {
        this._stats.totalFailures++;
        this._lastFailureTime = Date.now();

        this._log.warn("Call failed", { error: err.message });

        if (this._state === STATES.HALF_OPEN) {
            // Test request failed — back to OPEN
            this._transition(STATES.OPEN);
            return;
        }

        // CLOSED state
        this._failureCount++;
        if (this._failureCount >= this.failureThreshold) {
            this._transition(STATES.OPEN);
        }
    }

    /**
     * Transitions to a new state.
     * @param {string} newState
     * @private
     */
    _transition(newState) {
        const oldState = this._state;
        this._state = newState;

        this._stats.stateChanges.push({
            from: oldState,
            to: newState,
            at: new Date().toISOString(),
        });

        this._log.info(`State transition: ${oldState} → ${newState}`);

        if (newState === STATES.OPEN) {
            this._nextAttemptTime = Date.now() + this.resetTimeoutMs;
            this._successCount = 0;
            this._halfOpenAttempts = 0;
        } else if (newState === STATES.HALF_OPEN) {
            this._halfOpenAttempts = 0;
            this._successCount = 0;
        } else if (newState === STATES.CLOSED) {
            this._failureCount = 0;
            this._successCount = 0;
            this._halfOpenAttempts = 0;
            this._nextAttemptTime = null;
        }
    }

    /**
     * Returns circuit breaker metrics.
     * @returns {Object}
     */
    getStats() {
        return {
            name: this.name,
            state: this.state,
            failureCount: this._failureCount,
            stats: { ...this._stats },
            recentStateChanges: this._stats.stateChanges.slice(-5),
        };
    }

    /**
     * Manually resets the circuit breaker to CLOSED state.
     */
    reset() {
        this._transition(STATES.CLOSED);
        this._log.info("Circuit manually reset");
    }
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = { CircuitBreaker, STATES };
