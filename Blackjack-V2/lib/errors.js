/**
 * @fileoverview Custom error classes for Blackjack V2.
 *
 * Instead of throwing generic Error objects and matching error messages
 * by substring in the error handler (fragile!), each error type carries
 * its own HTTP status code. The server's error handler simply reads
 * `err.status` — no string matching needed.
 *
 * Hierarchy:
 *   AppError (base)
 *   ├── ValidationError   (400)  — bad input, invalid bets, wrong actions
 *   ├── NotFoundError     (404)  — session not found
 *   ├── GoneError         (410)  — session expired
 *   └── CapacityError     (503)  — server at max sessions
 */

class AppError extends Error {
    /**
     * @param {string} message - Human-readable error message.
     * @param {number} status  - HTTP status code.
     */
    constructor(message, status = 500) {
        super(message);
        this.name = this.constructor.name;
        this.status = status;
    }
}

/** 400 — Bad request / invalid input */
class ValidationError extends AppError {
    constructor(message) {
        super(message, 400);
    }
}

/** 404 — Resource not found */
class NotFoundError extends AppError {
    constructor(message) {
        super(message, 404);
    }
}

/** 410 — Resource existed but is now gone (expired session) */
class GoneError extends AppError {
    constructor(message) {
        super(message, 410);
    }
}

/** 503 — Service temporarily unavailable (at capacity) */
class CapacityError extends AppError {
    constructor(message) {
        super(message, 503);
    }
}

module.exports = {
    AppError,
    ValidationError,
    NotFoundError,
    GoneError,
    CapacityError,
};
