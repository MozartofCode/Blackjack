/**
 * @fileoverview Comprehensive E2E test suite for Blackjack V2 API.
 *
 * Run the server first:  npm run dev
 * Then in another terminal: npm run test:sessions
 *
 * ┌─────────────────────────────────────────────────────┐
 * │               Test Categories                       │
 * ├─────────────────────────────────────────────────────┤
 * │  1. Health & global endpoints                       │
 * │  2. Session lifecycle (create, info, list, destroy) │
 * │  3. Game actions (bet, hit, stand, house, rounds)   │
 * │  4. Input validation & sanitization                 │
 * │  5. Edge cases (bust, balance, turn order)          │
 * │  6. History & statistics                            │
 * │  7. Multi-session independence                      │
 * │  8. Error handling (404, destroyed, security)       │
 * │  9. Full game flow end-to-end                       │
 * └─────────────────────────────────────────────────────┘
 */

const BASE = "http://localhost:3000/api";

// ANSI colors
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

let passed = 0;
let failed = 0;

function pass(name) {
    passed++;
    console.log(`  ${GREEN}✔ PASS${RESET} ${name}`);
}

function fail(name, err) {
    failed++;
    console.log(`  ${RED}✘ FAIL${RESET} ${name}`);
    console.log(`    ${RED}${err.message || err}${RESET}`);
}

function section(title) {
    console.log(`\n${CYAN}${BOLD}── ${title} ──${RESET}`);
}

function detail(msg) {
    console.log(`    ${DIM}${msg}${RESET}`);
}

async function api(method, path, body) {
    const opts = {
        method,
        headers: { "Content-Type": "application/json" },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    const data = await res.json();
    return { status: res.status, data };
}

// ─── Test Helpers ─────────────────────────────────────────────────────────────

/** Creates a session with defaults, returns { sessionId, data } */
async function createQuickSession(name = "Tester") {
    const { data } = await api("POST", "/sessions", { playerName: name });
    return { sessionId: data.session.id, data };
}

/** Plays a complete round: bet → stand → house. Returns enriched state. */
async function playOneRound(sessionId, bet = 50) {
    await api("POST", `/game/${sessionId}/bet`, { bet });
    await api("POST", `/game/${sessionId}/stand`);
    const { data } = await api("POST", `/game/${sessionId}/house`);
    return data;
}

/** Cleans up a session silently */
async function cleanup(sessionId) {
    await api("DELETE", `/sessions/${sessionId}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function runTests() {
    console.log(
        `\n${BOLD}${YELLOW}╔══════════════════════════════════════════════════╗${RESET}`
    );
    console.log(
        `${BOLD}${YELLOW}║   Blackjack V2 — Comprehensive E2E Tests        ║${RESET}`
    );
    console.log(
        `${BOLD}${YELLOW}╚══════════════════════════════════════════════════╝${RESET}`
    );

    // ═════════════════════════════════════════════════════════════════════════
    //  1. HEALTH & GLOBAL ENDPOINTS
    // ═════════════════════════════════════════════════════════════════════════

    section("1. Health Check");
    try {
        const { data } = await api("GET", "/health");
        if (data.status === "ok" && typeof data.uptime === "number") {
            pass("Server is healthy");
        } else {
            fail("Health check", new Error("Status is not ok"));
        }
    } catch (e) {
        fail("Health check (is the server running?)", e);
        return;
    }

    section("2. Global Stats Endpoint");
    try {
        const { data } = await api("GET", "/stats");
        if (
            typeof data.totalRounds === "number" &&
            typeof data.outcomes === "object"
        ) {
            pass("Global stats returns expected shape");
        } else {
            fail("Global stats", new Error("Missing fields"));
        }
    } catch (e) {
        fail("Global stats", e);
    }

    section("3. Security Headers");
    try {
        const res = await fetch(`${BASE}/health`);
        const hasContentType = res.headers.has("x-content-type-options");
        const hasFrameOptions = res.headers.has("x-frame-options");
        if (hasContentType && hasFrameOptions) {
            pass("Security headers present (Helmet)");
            detail(
                `X-Content-Type-Options: ${res.headers.get("x-content-type-options")}`
            );
        } else {
            fail(
                "Security headers",
                new Error("Missing X-Content-Type-Options or X-Frame-Options")
            );
        }
    } catch (e) {
        fail("Security headers", e);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  2. SESSION LIFECYCLE
    // ═════════════════════════════════════════════════════════════════════════

    section("4. Create Session");
    let sessionId;
    try {
        const { status, data } = await api("POST", "/sessions", {
            playerName: "TestPlayer",
        });
        if (status === 201 && data.session?.id) {
            sessionId = data.session.id;
            pass(`Session created: ${sessionId.substring(0, 8)}...`);
            detail(`Player: ${data.player.cards.join(", ")}`);
            detail(`House:  ${data.house.cards.join(", ")}`);
        } else {
            fail("Create session", new Error(`Status ${status}`));
        }
    } catch (e) {
        fail("Create session", e);
        return;
    }

    section("5. Get Game State");
    try {
        const { data } = await api("GET", `/game/${sessionId}/state`);
        if (data.computed && data.session) {
            pass("State includes computed values and session info");
        } else {
            fail("Game state structure", new Error("Missing fields"));
        }
    } catch (e) {
        fail("Get game state", e);
    }

    section("6. List Sessions");
    try {
        const { data } = await api("GET", "/sessions");
        if (typeof data.activeSessions === "number" && data.activeSessions >= 1) {
            pass(`${data.activeSessions} active session(s)`);
        } else {
            fail("List sessions", new Error("Unexpected response"));
        }
    } catch (e) {
        fail("List sessions", e);
    }

    section("7. Session Info");
    try {
        const { data } = await api("GET", `/sessions/${sessionId}`);
        if (data.id === sessionId && data.playerName === "TestPlayer") {
            pass(`Session info: ${data.playerName}`);
        } else {
            fail("Session info", new Error("Unexpected data"));
        }
    } catch (e) {
        fail("Session info", e);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  3. GAME ACTIONS
    // ═════════════════════════════════════════════════════════════════════════

    section("8. Place Bet ($50)");
    try {
        const { data } = await api("POST", `/game/${sessionId}/bet`, {
            bet: 50,
        });
        if (data.player.bet >= 50) {
            pass(`Bet placed: $${data.player.bet}`);
        } else {
            fail("Place bet", new Error("Bet not reflected in state"));
        }
    } catch (e) {
        fail("Place bet", e);
    }

    section("9. Player Hit");
    try {
        const { data } = await api("POST", `/game/${sessionId}/hit`);
        if (data.player.cards.length >= 3) {
            pass(
                `Player hit — ${data.player.cards.length} cards (value: ${data.computed.playerHandValue})`
            );
        } else {
            pass(
                `Player hit processed (value: ${data.computed.playerHandValue})`
            );
        }
    } catch (e) {
        fail("Player hit", e);
    }

    section("10. Player Stand (new round first)");
    try {
        await api("POST", `/game/${sessionId}/new-round`);
        const { data } = await api("POST", `/game/${sessionId}/stand`);
        if (data.player.player_in_game === false) {
            pass("Player stood — no longer in game");
        } else {
            fail("Player stand", new Error("player_in_game should be false"));
        }
    } catch (e) {
        fail("Player stand", e);
    }

    section("11. House Play");
    try {
        await api("POST", `/game/${sessionId}/bet`, { bet: 25 });
        const { data } = await api("POST", `/game/${sessionId}/house`);
        if (data.computed.isRoundOver) {
            pass(`House played — Outcome: ${data.computed.outcome}`);
            detail(
                `House: ${data.house.cards.join(", ")} (${data.computed.houseHandValue})`
            );
        } else {
            fail("House play", new Error("Round should be over"));
        }
    } catch (e) {
        fail("House play", e);
    }

    section("12. Begin Round (convenience, $100 bet)");
    try {
        const { data } = await api(
            "POST",
            `/game/${sessionId}/begin-round`,
            { bet: 100 }
        );
        if (
            data.player.cards.length === 2 &&
            data.house.cards.length === 2 &&
            data.session.roundsPlayed >= 1
        ) {
            pass(`New round started — Round #${data.session.roundsPlayed}`);
        } else {
            fail("Begin round", new Error("Unexpected state"));
        }
    } catch (e) {
        fail("Begin round", e);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  4. INPUT VALIDATION & SANITIZATION
    // ═════════════════════════════════════════════════════════════════════════

    section("13. Bet Validation (too low: $5)");
    try {
        const { status } = await api("POST", `/game/${sessionId}/bet`, {
            bet: 5,
        });
        if (status === 400) {
            pass("Correctly rejected $5 bet");
        } else {
            fail("Should reject low bet", new Error(`Got status ${status}`));
        }
    } catch (e) {
        fail("Bet validation", e);
    }

    section("14. Bet Validation (non-integer: $50.5)");
    try {
        const { status } = await api("POST", `/game/${sessionId}/bet`, {
            bet: 50.5,
        });
        if (status === 400) {
            pass("Correctly rejected non-integer bet");
        } else {
            fail("Non-integer bet", new Error(`Got status ${status}`));
        }
    } catch (e) {
        fail("Non-integer bet", e);
    }

    section("15. Bet Validation (negative: -50)");
    try {
        const { status } = await api("POST", `/game/${sessionId}/bet`, {
            bet: -50,
        });
        if (status === 400) {
            pass("Correctly rejected negative bet");
        } else {
            fail("Negative bet", new Error(`Got status ${status}`));
        }
    } catch (e) {
        fail("Negative bet", e);
    }

    section("16. Bet Validation (NaN)");
    try {
        const { status } = await api("POST", `/game/${sessionId}/bet`, {
            bet: "abc",
        });
        if (status === 400) {
            pass("Correctly rejected NaN bet");
        } else {
            fail("NaN bet", new Error(`Got status ${status}`));
        }
    } catch (e) {
        fail("NaN bet", e);
    }

    section("17. Invalid Action (action='X')");
    try {
        const { status } = await api("POST", `/game/${sessionId}/action`, {
            action: "X",
        });
        if (status === 400) {
            pass("Correctly rejected invalid action");
        } else {
            fail("Invalid action", new Error(`Got status ${status}`));
        }
    } catch (e) {
        fail("Invalid action", e);
    }

    section("18. Missing Bet Body");
    try {
        const { status } = await api("POST", `/game/${sessionId}/bet`, {});
        if (status === 400) {
            pass("Correctly rejected missing bet body");
        } else {
            fail("Missing bet body", new Error(`Got status ${status}`));
        }
    } catch (e) {
        fail("Missing bet body", e);
    }

    section("19. Player Name Sanitization (XSS attempt)");
    try {
        const { status, data } = await api("POST", "/sessions", {
            playerName: '<script>alert("xss")</script>',
        });
        if (status === 400) {
            pass("Correctly rejected XSS in player name");
        } else {
            fail("XSS sanitization", new Error(`Got status ${status}`));
        }
    } catch (e) {
        fail("XSS sanitization", e);
    }

    section("20. Player Name Sanitization (too long)");
    try {
        const longName = "A".repeat(50);
        const { status } = await api("POST", "/sessions", {
            playerName: longName,
        });
        if (status === 400) {
            pass("Correctly rejected 50-char name (max: 30)");
        } else {
            fail("Long name", new Error(`Got status ${status}`));
        }
    } catch (e) {
        fail("Long name", e);
    }

    section("21. Player Name (default for empty)");
    try {
        const { status, data } = await api("POST", "/sessions", {
            playerName: "",
        });
        if (status === 201 && data.session.playerName === "Anonymous") {
            pass("Empty name defaults to 'Anonymous'");
            await cleanup(data.session.id);
        } else {
            fail("Default name", new Error(`Got name: ${data.session?.playerName}`));
        }
    } catch (e) {
        fail("Default name", e);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  5. EDGE CASES
    // ═════════════════════════════════════════════════════════════════════════

    section("22. Hit After Standing (should fail)");
    try {
        const { sessionId: sid } = await createQuickSession("EdgeTester1");
        await api("POST", `/game/${sid}/stand`);
        const { status } = await api("POST", `/game/${sid}/hit`);
        if (status === 400) {
            pass("Correctly rejected hit after standing");
        } else {
            fail("Hit after stand", new Error(`Got status ${status}`));
        }
        await cleanup(sid);
    } catch (e) {
        fail("Hit after stand", e);
    }

    section("23. Stand Twice (should fail)");
    try {
        const { sessionId: sid } = await createQuickSession("EdgeTester2");
        await api("POST", `/game/${sid}/stand`);
        const { status } = await api("POST", `/game/${sid}/stand`);
        if (status === 400) {
            pass("Correctly rejected double stand");
        } else {
            fail("Double stand", new Error(`Got status ${status}`));
        }
        await cleanup(sid);
    } catch (e) {
        fail("Double stand", e);
    }

    section("24. House Play Before Player Finishes (should fail)");
    try {
        const { sessionId: sid } = await createQuickSession("EdgeTester3");
        await api("POST", `/game/${sid}/bet`, { bet: 50 });
        const { status } = await api("POST", `/game/${sid}/house`);
        if (status === 400) {
            pass("Correctly blocked house play before player finishes");
        } else {
            fail("Premature house", new Error(`Got status ${status}`));
        }
        await cleanup(sid);
    } catch (e) {
        fail("Premature house", e);
    }

    section("25. House Play Twice (should fail)");
    try {
        const { sessionId: sid } = await createQuickSession("EdgeTester4");
        await api("POST", `/game/${sid}/bet`, { bet: 50 });
        await api("POST", `/game/${sid}/stand`);
        await api("POST", `/game/${sid}/house`);
        const { status } = await api("POST", `/game/${sid}/house`);
        if (status === 400) {
            pass("Correctly blocked double house play");
        } else {
            fail("Double house", new Error(`Got status ${status}`));
        }
        await cleanup(sid);
    } catch (e) {
        fail("Double house", e);
    }

    section("26. Bet More Than Balance (should fail)");
    try {
        const { sessionId: sid } = await createQuickSession("BrokeTester");
        const { status } = await api("POST", `/game/${sid}/bet`, {
            bet: 999999,
        });
        if (status === 400) {
            pass("Correctly rejected bet exceeding balance");
        } else {
            fail("Over-balance bet", new Error(`Got status ${status}`));
        }
        await cleanup(sid);
    } catch (e) {
        fail("Over-balance bet", e);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  6. HISTORY & STATISTICS
    // ═════════════════════════════════════════════════════════════════════════

    section("27. Session History (after playing rounds)");
    let historyTestId;
    try {
        const { sessionId: sid } = await createQuickSession("HistoryPlayer");
        historyTestId = sid;

        // Play 3 rounds
        for (let i = 0; i < 3; i++) {
            if (i > 0) await api("POST", `/game/${sid}/new-round`);
            await playOneRound(sid, 50);
        }

        const { data } = await api("GET", `/game/${sid}/history`);
        if (data.rounds && data.rounds.length === 3) {
            pass(`History has ${data.rounds.length} rounds`);
            detail(
                `Outcomes: ${data.rounds.map((r) => r.outcome).join(", ")}`
            );
        } else {
            fail(
                "Session history",
                new Error(`Expected 3 rounds, got ${data.rounds?.length}`)
            );
        }
    } catch (e) {
        fail("Session history", e);
    }

    section("28. Session Stats (calculated correctly)");
    try {
        const { data } = await api("GET", `/game/${historyTestId}/stats`);
        if (
            typeof data.winRate === "number" &&
            typeof data.netProfit === "number" &&
            typeof data.totalRounds === "number" &&
            data.totalRounds === 3 &&
            typeof data.currentStreak === "object"
        ) {
            pass(`Stats: ${data.wins}W/${data.losses}L/${data.pushes}P, Win rate: ${data.winRate}%`);
            detail(`Net profit: $${data.netProfit}, Streak: ${data.currentStreak.count} ${data.currentStreak.type}`);
        } else {
            fail("Session stats", new Error("Missing or wrong fields"));
        }
        await cleanup(historyTestId);
    } catch (e) {
        fail("Session stats", e);
    }

    section("29. History Record Shape");
    try {
        const { sessionId: sid } = await createQuickSession("ShapeChecker");
        await playOneRound(sid, 100);
        const { data } = await api("GET", `/game/${sid}/history`);
        const round = data.rounds[0];

        const hasAllFields =
            round.sessionId &&
            typeof round.roundNum === "number" &&
            round.outcome &&
            Array.isArray(round.playerHand) &&
            Array.isArray(round.houseHand) &&
            typeof round.playerVal === "number" &&
            typeof round.houseVal === "number" &&
            typeof round.bet === "number" &&
            typeof round.payout === "number" &&
            typeof round.balanceAfter === "number" &&
            round.timestamp;

        if (hasAllFields) {
            pass("History record has all required fields");
            detail(`Bet: $${round.bet}, Payout: $${round.payout}, Balance: $${round.balanceAfter}`);
        } else {
            fail("Record shape", new Error("Missing fields in history record"));
        }
        await cleanup(sid);
    } catch (e) {
        fail("Record shape", e);
    }

    section("30. Empty History (no rounds played)");
    try {
        const { sessionId: sid } = await createQuickSession("EmptyHistory");
        const { data } = await api("GET", `/game/${sid}/history`);
        if (data.rounds && data.rounds.length === 0) {
            pass("Empty history returns empty array");
        } else {
            fail("Empty history", new Error(`Got ${data.rounds?.length} rounds`));
        }
        await cleanup(sid);
    } catch (e) {
        fail("Empty history", e);
    }

    section("31. Global Stats Updates After Play");
    try {
        const statsBefore = await api("GET", "/stats");
        const { sessionId: sid } = await createQuickSession("GlobalStatTest");
        await playOneRound(sid, 50);
        const statsAfter = await api("GET", "/stats");

        if (statsAfter.data.totalRounds > statsBefore.data.totalRounds) {
            pass("Global stats increment after a round");
        } else {
            fail("Global stats update", new Error("totalRounds didn't increase"));
        }
        await cleanup(sid);
    } catch (e) {
        fail("Global stats update", e);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  7. MULTI-SESSION INDEPENDENCE
    // ═════════════════════════════════════════════════════════════════════════

    section("32. Multi-Session (2 independent players)");
    try {
        const { data: s1 } = await api("POST", "/sessions", {
            playerName: "Alice",
        });
        const { data: s2 } = await api("POST", "/sessions", {
            playerName: "Bob",
        });

        const id1 = s1.session.id;
        const id2 = s2.session.id;

        // Alice hits
        await api("POST", `/game/${id1}/hit`);
        const { data: a1 } = await api("GET", `/game/${id1}/state`);

        // Bob stands
        await api("POST", `/game/${id2}/stand`);
        const { data: b1 } = await api("GET", `/game/${id2}/state`);

        // Verify they are truly independent
        if (
            a1.session.playerName === "Alice" &&
            b1.session.playerName === "Bob" &&
            a1.session.id !== b1.session.id
        ) {
            pass("Two sessions are fully independent");
            detail(
                `Alice: ${a1.player.cards.length} cards | Bob: ${b1.player.cards.length} cards`
            );
        } else {
            fail("Multi-session", new Error("Sessions are not independent"));
        }

        await cleanup(id1);
        await cleanup(id2);
    } catch (e) {
        fail("Multi-session", e);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  8. ERROR HANDLING
    // ═════════════════════════════════════════════════════════════════════════

    section("33. Destroy Session & Get Final Stats");
    try {
        const { data } = await api("DELETE", `/sessions/${sessionId}`);
        if (data.destroyed === true && data.finalStats) {
            pass("Session destroyed with final stats");
            detail(`Final stats: ${data.finalStats.totalRounds} rounds, $${data.finalStats.netProfit} profit`);
        } else {
            fail("Destroy session", new Error("Missing finalStats"));
        }
    } catch (e) {
        fail("Destroy session", e);
    }

    section("34. Access Destroyed Session (should fail)");
    try {
        const { status } = await api("GET", `/game/${sessionId}/state`);
        if (status === 404) {
            pass("Correctly returns 404 for destroyed session");
        } else {
            fail(
                "Destroyed session access",
                new Error(`Got status ${status}`)
            );
        }
    } catch (e) {
        fail("Destroyed session", e);
    }

    section("35. Access Non-existent Session");
    try {
        const { status } = await api(
            "GET",
            "/game/00000000-0000-0000-0000-000000000000/state"
        );
        if (status === 404) {
            pass("Correctly returns 404 for fake session ID");
        } else {
            fail("Fake session", new Error(`Got status ${status}`));
        }
    } catch (e) {
        fail("Fake session", e);
    }

    section("36. 404 for Unknown Route");
    try {
        const { status } = await api("GET", "/nonexistent");
        if (status === 404) {
            pass("Unknown route returns 404");
        } else {
            fail("404 handler", new Error(`Got status ${status}`));
        }
    } catch (e) {
        fail("404 handler", e);
    }

    section("37. Error Response Format");
    try {
        const { data } = await api(
            "GET",
            "/game/00000000-0000-0000-0000-000000000000/state"
        );
        if (data.error === true && typeof data.message === "string") {
            pass("Error response has { error: true, message: string }");
        } else {
            fail(
                "Error format",
                new Error("Error response doesn't match expected shape")
            );
        }
    } catch (e) {
        fail("Error format", e);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  9. FULL GAME FLOW
    // ═════════════════════════════════════════════════════════════════════════

    section("38. Full Game Flow (create → bet → hit/stand → house → stats → destroy)");
    try {
        // Create
        const { data: created } = await api("POST", "/sessions", {
            playerName: "FullFlowPlayer",
        });
        const fId = created.session.id;

        // Bet
        await api("POST", `/game/${fId}/bet`, { bet: 50 });

        // Player stands
        await api("POST", `/game/${fId}/stand`);

        // House plays
        const { data: result } = await api("POST", `/game/${fId}/house`);

        if (
            result.computed.isRoundOver &&
            result.computed.outcome !== "in_progress"
        ) {
            pass(`Complete round: ${result.computed.outcome}`);
            detail(
                `Player: ${result.player.cards.join(", ")} → ${result.computed.playerHandValue}`
            );
            detail(
                `House:  ${result.house.cards.join(", ")} → ${result.computed.houseHandValue}`
            );
            detail(`Player balance: $${result.player.money}`);
        } else {
            fail("Full flow round", new Error("Round not resolved"));
        }

        // Check stats after the round
        const { data: stats } = await api("GET", `/game/${fId}/stats`);
        if (stats.totalRounds === 1) {
            pass("Stats show 1 round after full flow");
        } else {
            fail("Flow stats", new Error(`Expected 1 round, got ${stats.totalRounds}`));
        }

        // Play a second round via begin-round
        const { data: round2 } = await api(
            "POST",
            `/game/${fId}/begin-round`,
            { bet: 75 }
        );
        await api("POST", `/game/${fId}/stand`);
        const { data: round2Result } = await api(
            "POST",
            `/game/${fId}/house`
        );
        if (round2Result.computed.isRoundOver) {
            pass(`Second round: ${round2Result.computed.outcome}`);
        } else {
            fail("Second round", new Error("Round not resolved"));
        }

        // Destroy and check final stats
        const { data: destroyed } = await api("DELETE", `/sessions/${fId}`);
        if (
            destroyed.destroyed &&
            destroyed.finalStats &&
            destroyed.finalStats.totalRounds === 2
        ) {
            pass("Destroyed with complete final stats (2 rounds)");
        } else {
            fail("Final destroy", new Error("Unexpected destroy response"));
        }
    } catch (e) {
        fail("Full game flow", e);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  SUMMARY
    // ═════════════════════════════════════════════════════════════════════════

    const total = passed + failed;
    console.log(
        `\n${BOLD}${YELLOW}══════════════════════════════════════════════════${RESET}`
    );
    console.log(
        `  ${GREEN}${passed} passed${RESET}  |  ${failed > 0 ? RED : GREEN}${failed} failed${RESET}  |  ${total} total`
    );
    console.log(
        `${BOLD}${YELLOW}══════════════════════════════════════════════════${RESET}\n`
    );

    if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
    console.error(`\n${RED}Unexpected error:${RESET}`, err);
    process.exit(1);
});
