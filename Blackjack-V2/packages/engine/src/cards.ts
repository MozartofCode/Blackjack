// Cards are compact 2-char strings: rank + suit, e.g. "AS", "TH", "9C".
// Ranks: 2-9, T, J, Q, K, A. Suits: S, H, D, C.

export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type Suit = 'S' | 'H' | 'D' | 'C';
export type Card = string;

export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUITS: Suit[] = ['H', 'D', 'C', 'S'];

export const rankOf = (c: Card): Rank => c[0] as Rank;
export const suitOf = (c: Card): Suit => c[1] as Suit;

/** Blackjack value of a single card (Ace counted as 11 here). */
export function cardValue(c: Card): number {
  const r = rankOf(c);
  if (r === 'A') return 11;
  if (r === 'T' || r === 'J' || r === 'Q' || r === 'K') return 10;
  return Number(r);
}

/** Dealer upcard as used by the Q-learning bot: Ace = 1, faces = 10. */
export function upcardNumber(c: Card): number {
  const v = cardValue(c);
  return v === 11 ? 1 : v;
}

/** Hi-Lo tag: 2-6 → +1, 7-9 → 0, T-A → -1. */
export function hiLo(c: Card): number {
  const v = cardValue(c);
  if (v <= 6) return 1;
  if (v >= 10) return -1;
  return 0;
}

const LONG_RANK: Record<Rank, string> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  T: '10', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace',
};
const LONG_SUIT: Record<Suit, string> = { H: 'Hearts', D: 'Diamonds', C: 'Clubs', S: 'Spades' };

/** "AS" → "Ace of Spades" (the format the original Python bots and datasets use). */
export function longName(c: Card): string {
  return `${LONG_RANK[rankOf(c)]} of ${LONG_SUIT[suitOf(c)]}`;
}

/** Python `encode_card`: suit_idx * 13 + rank_idx with suits [H, D, C, S]. */
export function encodeCard(c: Card): number {
  return SUITS.indexOf(suitOf(c)) * 13 + RANKS.indexOf(rankOf(c));
}
