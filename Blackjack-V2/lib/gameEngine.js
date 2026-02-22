/**
 * @fileoverview Pure JavaScript port of the Python Blackjack Game Engine.
 *
 * This is a faithful translation of Backend/model/gameplay_full.py and
 * Backend/model/smart_contract.py into self-contained JS classes. Each Game
 * instance is fully independent — no shared global state — which enables
 * the session/room system to create one Game per player.
 *
 * Changes from the Python version:
 *   - Smart_Contract replaced with in-memory BalanceTracker (no blockchain dependency)
 *   - All logic, rules, and payout ratios are identical
 */

// ─── BalanceTracker ───────────────────────────────────────────────────────────
// Replaces Smart_Contract with simple in-memory tracking.
// When the user adds a database later, only this class needs to change.

class BalanceTracker {
    /**
     * @param {number} [houseBalance=10000] - Starting house balance.
     * @param {number} [playerBalance=10000] - Starting player balance.
     */
    constructor(houseBalance = 10000, playerBalance = 10000) {
        this._houseBalance = houseBalance;
        this._playerBalance = playerBalance;
        this._bet = 0;
    }

    getHouseBalance() {
        return this._houseBalance;
    }

    getPlayerBalance() {
        return this._playerBalance;
    }

    getBet() {
        return this._bet;
    }

    addToHouse(amount) {
        this._houseBalance += amount;
    }

    addToPlayer(amount) {
        this._playerBalance += amount;
    }

    subFromHouse(amount) {
        this._houseBalance -= amount;
    }

    subFromPlayer(amount) {
        this._playerBalance -= amount;
    }

    addBet(amount) {
        this._bet += amount;
    }

    zeroBet() {
        this._bet = 0;
    }
}

// ─── Deck ─────────────────────────────────────────────────────────────────────

class Deck {
    constructor() {
        this.cards = [];
        const suits = ["Hearts", "Diamonds", "Clubs", "Spades"];
        const ranks = [
            "2", "3", "4", "5", "6", "7", "8", "9", "10",
            "Jack", "Queen", "King", "Ace",
        ];

        // 5 standard decks (5 × 52 = 260 cards) — same as Python version
        for (let i = 0; i < 5; i++) {
            for (const suit of suits) {
                for (const rank of ranks) {
                    this.cards.push(`${rank} of ${suit}`);
                }
            }
        }
    }

    /** Fisher-Yates shuffle */
    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    /** Deals (pops) the top card, or returns null if empty. */
    dealCard() {
        return this.cards.length > 0 ? this.cards.pop() : null;
    }

    /** Peeks at the top card without removing it. */
    peekCard() {
        return this.cards.length > 0 ? this.cards[this.cards.length - 1] : null;
    }
}

// ─── Shared hand-value calculation ────────────────────────────────────────────

/**
 * Calculates the optimal value of a hand, treating Aces as 11 or 1.
 * This is identical to the Python `calculate_hand_val()` method.
 *
 * @param {string[]} hand - Array of card strings, e.g. ["Ace of Spades", "10 of Hearts"].
 * @returns {number}
 */
function calculateHandValue(hand) {
    let value = 0;
    let aces = 0;

    for (const card of hand) {
        const rank = card.split(" of ")[0];

        if (["Jack", "Queen", "King"].includes(rank)) {
            value += 10;
        } else if (rank === "Ace") {
            aces += 1;
        } else {
            value += parseInt(rank, 10);
        }
    }

    while (aces > 0) {
        if (value + 11 > 21) {
            value += 1;
        } else {
            value += 11;
        }
        aces -= 1;
    }

    return value;
}

// ─── Player ───────────────────────────────────────────────────────────────────

class Player {
    /**
     * @param {BalanceTracker} tracker
     */
    constructor(tracker) {
        this.tracker = tracker;
        this.hand = [];
        this.inGame = true;
    }

    hit(card) {
        this.hand.append ? this.hand.push(card) : this.hand.push(card);
    }

    stand() {
        // Intentionally empty — mirrors Python
    }

    calculateHandVal() {
        return calculateHandValue(this.hand);
    }

    isOver21() {
        return this.calculateHandVal() > 21;
    }

    is21() {
        return this.calculateHandVal() === 21;
    }
}

// ─── House ────────────────────────────────────────────────────────────────────

class House {
    /**
     * @param {BalanceTracker} tracker
     */
    constructor(tracker) {
        this.tracker = tracker;
        this.hand = [];
        this.inGame = true;
    }

    hit(card) {
        this.hand.push(card);
    }

    stand() {
        // Intentionally empty
    }

    calculateHandVal() {
        return calculateHandValue(this.hand);
    }

    isOver21() {
        return this.calculateHandVal() > 21;
    }

    /**
     * House plays its turn — faithful port of Python House.play().
     * Resolves the round and updates balances.
     *
     * @param {Game} game
     */
    play(game) {
        const bet = this.tracker.getBet();
        const playerVal = game.player.calculateHandVal();

        if (playerVal > 21) {
            // Player bust — house wins
            this.tracker.addToHouse(bet);
            this.tracker.subFromPlayer(bet);
        } else if (playerVal === 21) {
            // Player blackjack — pays 3:2
            const payout = Math.floor((bet * 3) / 2);
            this.tracker.addToPlayer(payout);
            this.tracker.subFromHouse(payout);
        } else {
            // Dealer must hit until 17+
            while (this.calculateHandVal() < 17) {
                game.dealSingleCard("house");
            }

            const finalHouseVal = this.calculateHandVal();
            const finalPlayerVal = game.player.calculateHandVal();

            if (finalHouseVal > 21) {
                // House bust
                this.tracker.subFromHouse(bet);
                this.tracker.addToPlayer(bet);
            } else if (finalHouseVal > finalPlayerVal) {
                // House wins
                this.tracker.addToHouse(bet);
                this.tracker.subFromPlayer(bet);
            } else if (finalHouseVal < finalPlayerVal) {
                // Player wins
                this.tracker.subFromHouse(bet);
                this.tracker.addToPlayer(bet);
            } else {
                // Push
                this.tracker.addToHouse(0);
                this.tracker.addToPlayer(0);
            }
        }
    }
}

// ─── Game ─────────────────────────────────────────────────────────────────────

class Game {
    /**
     * @param {number} [playerBalance=10000] - Starting player balance.
     * @param {number} [houseBalance=10000] - Starting house balance.
     */
    constructor(playerBalance = 10000, houseBalance = 10000) {
        this.tracker = new BalanceTracker(houseBalance, playerBalance);

        // Match Python: if player balance <= 0, give them $10,000
        if (this.tracker.getPlayerBalance() <= 0) {
            this.tracker.addToPlayer(10000);
        }

        this.deck = new Deck();
        this.deck.shuffle();

        this.house = new House(this.tracker);
        this.player = new Player(this.tracker);
    }

    /** Reshuffles if fewer than 40 cards remain. */
    cardsLeftCheck() {
        if (this.deck.cards.length <= 40) {
            this.deck = new Deck();
            this.deck.shuffle();
        }
    }

    /** Deals 2 cards to each: house and player. */
    dealInitialHands() {
        this.cardsLeftCheck();

        for (let i = 0; i < 2; i++) {
            this.house.hit(this.deck.dealCard());
            this.player.hit(this.deck.dealCard());
        }
    }

    /**
     * Deals a single card to the specified participant.
     * @param {"house" | "player"} who
     */
    dealSingleCard(who) {
        this.cardsLeftCheck();

        if (who === "house") {
            this.house.hit(this.deck.dealCard());
        } else if (who === "player") {
            this.player.hit(this.deck.dealCard());
        }
    }

    // ── Player actions (mirrors controller.py) ────────────────────────────────

    /**
     * Player hits.
     * If hand value >= 21 after hitting, the player is automatically out.
     */
    playerHit() {
        this.dealSingleCard("player");
        if (this.player.calculateHandVal() >= 21) {
            this.player.inGame = false;
        }
    }

    /** Player stands. */
    playerStand() {
        this.player.inGame = false;
    }

    /**
     * Player performs an action.
     * @param {"H" | "S"} action
     */
    playerAction(action) {
        if (action === "H") {
            this.playerHit();
        } else if (action === "S") {
            this.playerStand();
        }
    }

    /**
     * Player places a bet.
     * @param {number} amount
     */
    playerBet(amount) {
        this.tracker.addBet(amount);
    }

    /** House plays its turn and finishes. */
    housePlay() {
        this.house.play(this);
        this.house.inGame = false;
    }

    /** Resets for a new round: zeros bet, clears hands, deals fresh cards. */
    initializeNewRound() {
        this.tracker.zeroBet();
        this.player.inGame = true;
        this.player.hand = [];
        this.house.hand = [];
        this.house.inGame = true;
        this.dealInitialHands();
    }

    /**
     * Converts the game state to a plain object.
     * Shape is IDENTICAL to the Python Game.to_dict() — ensures frontend compatibility.
     *
     * @returns {import('./types').GameState}
     */
    toDict() {
        return {
            house: {
                money: this.tracker.getHouseBalance(),
                cards: this.house.hand.map(String),
                bet: this.tracker.getBet(),
                player_in_game: this.player.inGame,
                house_in_game: this.house.inGame,
            },
            player: {
                money: this.tracker.getPlayerBalance(),
                bet: this.tracker.getBet(),
                cards: this.player.hand.map(String),
                player_in_game: this.player.inGame,
            },
        };
    }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    Game,
    Deck,
    Player,
    House,
    BalanceTracker,
    calculateHandValue,
};
