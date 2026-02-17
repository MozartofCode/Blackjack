/**
 * @fileoverview Request Correlation ID Middleware.
 *
 * Assigns a unique ID to every incoming request so you can trace it
 * through the entire system — from the initial HTTP call, through
 * game logic, database operations, and back to the response.
 *
 * How it works:
 * ─────────────────────────────────────────────────────────────────────
 *   Client → [Load Balancer] → Express Middleware → Game Logic → DB
 *            X-Request-ID        req.id              child logger
 *            (optional)          (assigned here)     (inherits ID)
 *
 * If the client or a load balancer already set X-Request-ID, we reuse it.
 * Otherwise, we generate a new UUID. The ID is:
 *   1. Stored on `req.id` for use in handlers
 *   2. Returned in the `X-Request-ID` response header
 *   3. Available to the logger via `req.log` (child logger with pre-bound ID)
 *
 * Interview talking points:
 * ─────────────────────────────────────────────────────────────────────
 * 1. Distributed tracing: correlate logs across microservices
 * 2. Debug production issues: "give me all logs for request abc-123"
 * 3. Load balancer integration: reuse upstream request IDs
 * 4. Observability pillar: logs + traces + metrics work together
 */

const { randomUUID } = require("crypto");
const logger = require("../logger");

/**
 * Express middleware that assigns a correlation ID to each request
 * and attaches a child logger with the ID pre-bound.
 *
 * @returns {Function} Express middleware
 */
function requestIdMiddleware() {
    return (req, _res, next) => {
        // Reuse upstream ID (from load balancer, API gateway) or generate new
        req.id = req.headers["x-request-id"] || randomUUID();

        // Attach child logger with request context pre-bound
        req.log = logger.child({
            requestId: req.id,
            method: req.method,
            path: req.path,
        });

        next();
    };
}

module.exports = requestIdMiddleware;
