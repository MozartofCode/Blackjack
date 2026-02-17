/**
 * @fileoverview Structured JSON Logger for Blackjack V2.
 *
 * Why structured logging?
 * ─────────────────────────────────────────────────────────────────────
 * In production, `console.log("something broke")` is useless. You need:
 *   - Machine-parseable format (JSON) for log aggregators (Datadog, ELK, CloudWatch)
 *   - Contextual metadata (request ID, session ID, player name)
 *   - Severity levels for filtering
 *   - Timestamps for correlation
 *
 * Interview talking points:
 * ─────────────────────────────────────────────────────────────────────
 * 1. JSON logs are queryable: `jq '.level == "error"' app.log`
 * 2. Request IDs let you trace a single request across all log lines
 * 3. Child loggers avoid passing context through every function call
 * 4. Log levels let you increase verbosity in production without redeploying
 *
 * Usage:
 * ─────────────────────────────────────────────────────────────────────
 *   const logger = require('./logger');
 *
 *   // Basic usage
 *   logger.info('Server started', { port: 3000 });
 *   logger.error('DB failed', { error: err.message, query: 'SELECT...' });
 *
 *   // Child logger (pre-bound context)
 *   const reqLogger = logger.child({ requestId: '123', sessionId: '456' });
 *   reqLogger.info('Processing bet');  // includes requestId + sessionId automatically
 */

const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
};

const IS_DEV = process.env.NODE_ENV !== "production";
const MIN_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || (IS_DEV ? "debug" : "info")];

class Logger {
    /**
     * @param {Object} [baseContext={}] - Default context included in every log line.
     */
    constructor(baseContext = {}) {
        this._baseContext = baseContext;
    }

    /**
     * Creates a child logger with additional pre-bound context.
     * Useful for per-request or per-module loggers.
     *
     * @param {Object} context - Additional context to merge.
     * @returns {Logger}
     *
     * @example
     *   const reqLogger = logger.child({ requestId: req.id });
     *   reqLogger.info('Bet placed', { amount: 500 });
     *   // Output: { "requestId": "abc-123", "msg": "Bet placed", "amount": 500, ... }
     */
    child(context) {
        return new Logger({ ...this._baseContext, ...context });
    }

    debug(msg, meta = {}) {
        this._log("debug", msg, meta);
    }
    info(msg, meta = {}) {
        this._log("info", msg, meta);
    }
    warn(msg, meta = {}) {
        this._log("warn", msg, meta);
    }
    error(msg, meta = {}) {
        this._log("error", msg, meta);
    }
    fatal(msg, meta = {}) {
        this._log("fatal", msg, meta);
    }

    /**
     * Core log method. Builds the structured log entry and writes it.
     *
     * @param {string} level
     * @param {string} msg
     * @param {Object} meta - Additional metadata for this specific log line.
     * @private
     */
    _log(level, msg, meta) {
        if (LOG_LEVELS[level] < MIN_LEVEL) return;

        const entry = {
            timestamp: new Date().toISOString(),
            level,
            msg,
            ...this._baseContext,
            ...meta,
        };

        // In dev, pretty-print for readability. In prod, single-line JSON for log aggregators.
        const output = IS_DEV ? this._prettyFormat(entry) : JSON.stringify(entry);

        if (LOG_LEVELS[level] >= LOG_LEVELS.error) {
            process.stderr.write(output + "\n");
        } else {
            process.stdout.write(output + "\n");
        }
    }

    /**
     * Pretty-formats a log entry for development readability.
     *
     * @param {Object} entry
     * @returns {string}
     * @private
     */
    _prettyFormat(entry) {
        const { timestamp, level, msg, ...rest } = entry;
        const time = timestamp.slice(11, 23); // HH:MM:SS.mmm
        const levelColors = {
            debug: "\x1b[36m", // cyan
            info: "\x1b[32m",  // green
            warn: "\x1b[33m",  // yellow
            error: "\x1b[31m", // red
            fatal: "\x1b[35m", // magenta
        };
        const reset = "\x1b[0m";
        const color = levelColors[level] || reset;
        const lvl = level.toUpperCase().padEnd(5);

        const metaStr = Object.keys(rest).length > 0
            ? ` ${JSON.stringify(rest)}`
            : "";

        return `${time} ${color}${lvl}${reset} ${msg}${metaStr}`;
    }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

const logger = new Logger({ service: "blackjack-v2" });

module.exports = logger;
