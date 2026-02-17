/**
 * @fileoverview Response Time Metrics Middleware.
 *
 * Tracks response times for every endpoint and calculates percentiles
 * (p50, p95, p99). Exposes metrics via a getter for the /api/metrics endpoint.
 *
 * Why percentiles instead of averages?
 * ─────────────────────────────────────────────────────────────────────
 * Averages lie. If 99 requests take 10ms and 1 takes 10,000ms,
 * the average is 109ms — looks fine! But 1% of your users had a
 * terrible experience. Percentiles reveal the real story:
 *   p50  = 10ms   (half of requests are this fast)
 *   p95  = 10ms   (95% are this fast)
 *   p99  = 10000ms (1% are THIS slow — that's a problem!)
 *
 * Implementation:
 * ─────────────────────────────────────────────────────────────────────
 * Uses a sliding window (last N samples) to avoid unbounded memory.
 * Samples are stored per-route to identify slow endpoints.
 *
 * Interview talking points:
 * ─────────────────────────────────────────────────────────────────────
 * 1. SLOs/SLAs: "99% of requests complete within 200ms"
 * 2. Why p99 > p95 > p50 > average for monitoring
 * 3. Sliding window prevents memory leaks in long-running processes
 * 4. Per-endpoint breakdown identifies bottlenecks
 */

const logger = require("../logger");

/**
 * Fixed-size sliding window for storing response time samples.
 * When full, overwrites the oldest entry (ring buffer).
 */
class SlidingWindow {
    constructor(maxSize = 1000) {
        this._samples = new Float64Array(maxSize);
        this._maxSize = maxSize;
        this._count = 0;
        this._index = 0;
    }

    /**
     * Adds a sample to the window.
     * @param {number} value - Response time in ms.
     */
    push(value) {
        this._samples[this._index] = value;
        this._index = (this._index + 1) % this._maxSize;
        if (this._count < this._maxSize) this._count++;
    }

    /**
     * Calculates a percentile from the current samples.
     * @param {number} p - Percentile (0-100).
     * @returns {number} The value at the given percentile.
     */
    percentile(p) {
        if (this._count === 0) return 0;

        // Extract active samples and sort them
        const active = Array.from(this._samples.subarray(0, this._count));
        active.sort((a, b) => a - b);

        const idx = Math.ceil((p / 100) * active.length) - 1;
        return active[Math.max(0, idx)];
    }

    /**
     * @returns {number} The average of all samples.
     */
    average() {
        if (this._count === 0) return 0;
        let sum = 0;
        for (let i = 0; i < this._count; i++) sum += this._samples[i];
        return sum / this._count;
    }

    /**
     * @returns {number} Total number of recorded samples.
     */
    get count() {
        return this._count;
    }
}

// ─── Global Metrics Store ─────────────────────────────────────────────────────

const _globalWindow = new SlidingWindow(5000); // last 5000 requests
const _routeWindows = new Map();               // per-route windows
const _statusCodes = {};                       // count per status code
let _totalRequests = 0;
let _totalErrors = 0;                          // 4xx/5xx

/**
 * Gets or creates a sliding window for a specific route.
 * @param {string} route
 * @returns {SlidingWindow}
 */
function getRouteWindow(route) {
    if (!_routeWindows.has(route)) {
        _routeWindows.set(route, new SlidingWindow(500));
    }
    return _routeWindows.get(route);
}

/**
 * Normalizes a URL path into a route key.
 * Replaces UUIDs and numeric segments with placeholders.
 *
 * @example
 *   /api/game/abc-123-def/hit  →  /api/game/:id/hit
 *   /api/sessions/123          →  /api/sessions/:id
 *
 * @param {string} path
 * @returns {string}
 */
function normalizeRoute(path) {
    return path
        .replace(
            /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
            ":id"
        )
        .replace(/\/\d+/g, "/:n");
}

// ─── Middleware ────────────────────────────────────────────────────────────────

/**
 * Express middleware that records response time and status code metrics.
 *
 * @returns {Function} Express middleware
 */
function responseMetricsMiddleware() {
    return (req, res, next) => {
        const start = process.hrtime.bigint();

        // Monkey-patch writeHead to inject timing headers before they're sent
        const originalWriteHead = res.writeHead;
        res.writeHead = function (statusCode, ...args) {
            const durationNs = Number(process.hrtime.bigint() - start);
            const durationMs = durationNs / 1_000_000;
            res.setHeader("X-Response-Time", `${durationMs.toFixed(2)}ms`);
            if (req.id) res.setHeader("X-Request-ID", req.id);
            return originalWriteHead.call(this, statusCode, ...args);
        };

        // Record metrics after response completes
        res.on("finish", () => {
            const durationNs = Number(process.hrtime.bigint() - start);
            const durationMs = durationNs / 1_000_000;

            // Record to global and per-route windows
            _globalWindow.push(durationMs);
            const routeKey = `${req.method} ${normalizeRoute(req.path)}`;
            getRouteWindow(routeKey).push(durationMs);

            _totalRequests++;
            _statusCodes[res.statusCode] = (_statusCodes[res.statusCode] || 0) + 1;
            if (res.statusCode >= 400) _totalErrors++;
        });

        next();
    };
}

// ─── Metrics Getter ───────────────────────────────────────────────────────────

/**
 * Returns the current metrics snapshot.
 * @returns {Object}
 */
function getMetrics() {
    const routeMetrics = {};
    for (const [route, window] of _routeWindows) {
        routeMetrics[route] = {
            count: window.count,
            avg: Math.round(window.average() * 100) / 100,
            p50: Math.round(window.percentile(50) * 100) / 100,
            p95: Math.round(window.percentile(95) * 100) / 100,
            p99: Math.round(window.percentile(99) * 100) / 100,
        };
    }

    return {
        uptime: Math.round(process.uptime()),
        totalRequests: _totalRequests,
        totalErrors: _totalErrors,
        errorRate:
            _totalRequests > 0
                ? `${((_totalErrors / _totalRequests) * 100).toFixed(1)}%`
                : "0%",
        statusCodes: { ..._statusCodes },
        global: {
            count: _globalWindow.count,
            avg: Math.round(_globalWindow.average() * 100) / 100,
            p50: Math.round(_globalWindow.percentile(50) * 100) / 100,
            p95: Math.round(_globalWindow.percentile(95) * 100) / 100,
            p99: Math.round(_globalWindow.percentile(99) * 100) / 100,
        },
        routes: routeMetrics,
        memory: {
            rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
            heap: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        },
    };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    responseMetricsMiddleware,
    getMetrics,
};
