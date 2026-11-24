import { type Card, cardValue, rankOf } from './cards.ts';

export interface HandTotal {
  total: number;
  /** True when an Ace is still counted as 11. */
  soft: boolean;
}

/**
 * Best total of a hand, Aces as 11 when that doesn't bust.
 * Same result as the original `calculate_hand_val()`, plus a soft flag.
 */
export function handTotal(cards: readonly Card[]): HandTotal {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (rankOf(c) === 'A') aces++;
    else total += cardValue(c);
  }
  let soft = false;
  for (let i = 0; i < aces; i++) {
    // Only one Ace can ever be 11; give it 11 if the rest (as 1s) still fit.
    const restAsOnes = aces - i - 1;
    if (!soft && total + 11 + restAsOnes <= 21) {
      total += 11;
      soft = true;
    } else {
      total += 1;
    }
  }
  return { total, soft };
}

export const handValue = (cards: readonly Card[]) => handTotal(cards).total;
export const isBust = (cards: readonly Card[]) => handValue(cards) > 21;

/** Two-card 21. Not a natural after a split (handled by callers via `fromSplit`). */
export const isNatural = (cards: readonly Card[]) => cards.length === 2 && handValue(cards) === 21;

/** Same blackjack value (so K+Q can split, like most casinos). */
export const isPair = (cards: readonly Card[]) =>
  cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]);
