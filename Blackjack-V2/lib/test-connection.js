/**
 * @fileoverview Smoke test for the Blackjack V2 backend-to-backend connection.
 *
 * Run this script with the OLD Flask backend already running on port 5000:
 *   1. cd Backend && python app.py
 *   2. node Blackjack-V2/lib/test-connection.js
 *
 * It exercises every single Game Engine endpoint and prints results.
 */

const gameService = require("./gameService");

// ANSI colors for pretty output
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function log(label, data) {
    console.log(`\n${CYAN}${BOLD}── ${label} ──${RESET}`);
    if (data !== undefined) {
        console.log(JSON.stringify(data, null, 2));
    }
}

function pass(testName) {
    console.log(`  ${GREEN}✔ PASS${RESET} ${testName}`);
}

function fail(testName, error) {
    console.log(`  ${RED}✘ FAIL${RESET} ${testName}`);
    console.log(`    ${RED}${error.message}${RESET}`);
}

async function runTests() {
    console.log(`\n${BOLD}${YELLOW}╔══════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BOLD}${YELLOW}║   Blackjack V2 — Game Engine Connection Tests    ║${RESET}`);
    console.log(`${BOLD}${YELLOW}╚══════════════════════════════════════════════════╝${RESET}`);

    let passed = 0;
    let failed = 0;

    // ── Test 1: Health Check ──────────────────────────────────────────────────
    log("Test 1: Health Check");
    try {
        const health = await gameService.healthCheck();
        if (health.connected) {
            pass("Game Engine is reachable");
            passed++;
        } else {
            fail("Game Engine is reachable", new Error(health.message));
            failed++;
            console.log(`\n${RED}${BOLD}Cannot reach the Flask backend. Make sure it is running:${RESET}`);
            console.log(`  ${YELLOW}cd Backend && python app.py${RESET}\n`);
            return; // No point continuing
        }
    } catch (e) {
        fail("Health Check", e);
        failed++;
        return;
    }

    // ── Test 2: Get Game State ────────────────────────────────────────────────
    log("Test 2: Get Game State");
    try {
        const state = await gameService.getGameState();
        if (state.house && state.player && state.computed) {
            pass("Game state has house, player, and computed fields");
            passed++;
        } else {
            fail("Game state structure", new Error("Missing expected fields"));
            failed++;
        }
        console.log(`  Player cards: ${state.player.cards.join(", ")}`);
        console.log(`  House cards:  ${state.house.cards.join(", ")}`);
        console.log(`  Player hand value: ${state.computed.playerHandValue}`);
        console.log(`  House hand value:  ${state.computed.houseHandValue}`);
    } catch (e) {
        fail("Get Game State", e);
        failed++;
    }

    // ── Test 3: Initialize New Round ──────────────────────────────────────────
    log("Test 3: Initialize New Round (startNewRound)");
    try {
        const state = await gameService.startNewRound();
        if (state.player.cards.length === 2 && state.house.cards.length === 2) {
            pass("New round dealt 2 cards to each player");
            passed++;
        } else {
            fail(
                "Card dealing",
                new Error(
                    `Expected 2 cards each, got player=${state.player.cards.length}, house=${state.house.cards.length}`
                )
            );
            failed++;
        }
    } catch (e) {
        fail("Initialize New Round", e);
        failed++;
    }

    // ── Test 4: Place a Bet ───────────────────────────────────────────────────
    log("Test 4: Place a Bet ($50)");
    try {
        const state = await gameService.placeBet(50);
        pass("Bet placed successfully");
        console.log(`  Current bet: $${state.player.bet}`);
        passed++;
    } catch (e) {
        fail("Place Bet", e);
        failed++;
    }

    // ── Test 5: Bet Validation (too low) ──────────────────────────────────────
    log("Test 5: Bet Validation (bet too low: $5)");
    try {
        await gameService.placeBet(5);
        fail("Should have rejected $5 bet", new Error("No error thrown"));
        failed++;
    } catch (e) {
        if (e.message.includes("at least")) {
            pass("Correctly rejected bet below minimum");
            passed++;
        } else {
            fail("Bet validation", e);
            failed++;
        }
    }

    // ── Test 6: Bet Validation (not a number) ─────────────────────────────────
    log("Test 6: Bet Validation (not a number)");
    try {
        await gameService.placeBet("fifty");
        fail("Should have rejected string bet", new Error("No error thrown"));
        failed++;
    } catch (e) {
        if (e.message.includes("valid number")) {
            pass("Correctly rejected non-numeric bet");
            passed++;
        } else {
            fail("Bet validation", e);
            failed++;
        }
    }

    // ── Test 7: Player Hit ────────────────────────────────────────────────────
    log("Test 7: Player Hit");
    try {
        const before = await gameService.getGameState();
        const beforeCardCount = before.player.cards.length;
        const state = await gameService.playerHit();

        if (state.player.cards.length > beforeCardCount || state.computed.isPlayerBust) {
            pass(`Player hit — now has ${state.player.cards.length} cards (value: ${state.computed.playerHandValue})`);
            passed++;
        } else {
            fail("Player Hit", new Error("Card count did not increase"));
            failed++;
        }
    } catch (e) {
        fail("Player Hit", e);
        failed++;
    }

    // ── Test 8: Player Stand ──────────────────────────────────────────────────
    log("Test 8: Player Stand");
    try {
        // Start a fresh round for a clean test
        await gameService.startNewRound();
        const state = await gameService.playerStand();
        pass("Player stood successfully");
        console.log(`  Player in game: ${state.player.player_in_game}`);
        passed++;
    } catch (e) {
        fail("Player Stand", e);
        failed++;
    }

    // ── Test 9: Player Action (generic) ───────────────────────────────────────
    log("Test 9: Player Action (generic, action='S')");
    try {
        await gameService.startNewRound();
        const state = await gameService.playerAction("S");
        pass("Generic playerAction('S') worked");
        passed++;
    } catch (e) {
        fail("Player Action", e);
        failed++;
    }

    // ── Test 10: Invalid Action Validation ────────────────────────────────────
    log("Test 10: Invalid Action Validation (action='X')");
    try {
        await gameService.playerAction("X");
        fail("Should have rejected invalid action", new Error("No error thrown"));
        failed++;
    } catch (e) {
        if (e.message.includes("Invalid action")) {
            pass("Correctly rejected invalid action");
            passed++;
        } else {
            fail("Action validation", e);
            failed++;
        }
    }

    // ── Test 11: House Play ───────────────────────────────────────────────────
    log("Test 11: House Play");
    try {
        await gameService.startNewRound();
        await gameService.placeBet(10);
        await gameService.playerStand(); // Player must finish first
        const state = await gameService.housePlay();
        pass("House played its turn");
        console.log(`  House cards: ${state.house.cards.join(", ")}`);
        console.log(`  House hand value: ${state.computed.houseHandValue}`);
        console.log(`  Outcome: ${state.computed.outcome}`);
        passed++;
    } catch (e) {
        fail("House Play", e);
        failed++;
    }

    // ── Test 12: Begin Round (convenience) ────────────────────────────────────
    log("Test 12: Begin Round (convenience method, $100 bet)");
    try {
        const state = await gameService.beginRound(100);
        if (state.player.cards.length === 2 && state.house.cards.length === 2) {
            pass("beginRound dealt cards and placed bet in one call");
            console.log(`  Player: ${state.player.cards.join(", ")} (${state.computed.playerHandValue})`);
            console.log(`  House:  ${state.house.cards.join(", ")} (${state.computed.houseHandValue})`);
            passed++;
        } else {
            fail("Begin Round", new Error("Unexpected card count"));
            failed++;
        }
    } catch (e) {
        fail("Begin Round", e);
        failed++;
    }

    // ── Test 13: calculateHandValue utility ───────────────────────────────────
    log("Test 13: calculateHandValue utility (local, no API call)");
    try {
        const val1 = gameService.calculateHandValue(["Ace of Spades", "King of Hearts"]);
        const val2 = gameService.calculateHandValue(["Ace of Spades", "Ace of Hearts", "9 of Clubs"]);
        const val3 = gameService.calculateHandValue(["5 of Diamonds", "6 of Clubs", "King of Spades"]);

        if (val1 === 21) { pass(`Ace + King = 21`); passed++; } else { fail("Ace + King", new Error(`Expected 21, got ${val1}`)); failed++; }
        if (val2 === 21) { pass(`Ace + Ace + 9 = 21`); passed++; } else { fail("Ace + Ace + 9", new Error(`Expected 21, got ${val2}`)); failed++; }
        if (val3 === 21) { pass(`5 + 6 + King = 21`); passed++; } else { fail("5 + 6 + King", new Error(`Expected 21, got ${val3}`)); failed++; }
    } catch (e) {
        fail("calculateHandValue", e);
        failed++;
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log(`\n${BOLD}${YELLOW}══════════════════════════════════════════════════${RESET}`);
    console.log(`  ${GREEN}${passed} passed${RESET}  |  ${failed > 0 ? RED : GREEN}${failed} failed${RESET}`);
    console.log(`${BOLD}${YELLOW}══════════════════════════════════════════════════${RESET}\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error(`${RED}Unexpected error:${RESET}`, err);
    process.exit(1);
});
