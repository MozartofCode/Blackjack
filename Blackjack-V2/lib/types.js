/**
 * @fileoverview JSDoc type definitions for the Blackjack Game Engine.
 * These mirror the response shape from the old Flask backend's `Game.to_dict()`.
 * Used for IDE autocompletion and documentation — no runtime cost.
 */

/**
 * @typedef {Object} HouseState
 * @property {number} money - House's current balance (from smart contract).
 * @property {string[]} cards - Array of card strings, e.g. ["Ace of Spades", "10 of Hearts"].
 * @property {number} bet - The current bet amount for the round.
 * @property {boolean} player_in_game - Whether the player is still active this round.
 * @property {boolean} house_in_game - Whether the house is still active this round.
 */

/**
 * @typedef {Object} PlayerState
 * @property {number} money - Player's current balance (from smart contract).
 * @property {number} bet - The current bet amount for the round.
 * @property {string[]} cards - Array of card strings, e.g. ["King of Diamonds", "7 of Clubs"].
 * @property {boolean} player_in_game - Whether the player is still active this round.
 */

/**
 * @typedef {Object} GameState
 * @property {HouseState} house - The house's current state.
 * @property {PlayerState} player - The player's current state.
 */

/**
 * @typedef {"H" | "S"} PlayerAction
 * "H" = Hit, "S" = Stand
 */

/**
 * @typedef {Object} GameEngineError
 * @property {boolean} ok - Always false for errors.
 * @property {number} status - HTTP status code from the Game Engine.
 * @property {string} message - Human-readable error description.
 * @property {string} endpoint - The endpoint that was called.
 */

module.exports = {};
