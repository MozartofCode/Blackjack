import type { Card } from './cards.ts';
import type { TableState } from './types.ts';
import { cardsRemaining } from './table.ts';

export interface PublicTable extends Omit<TableState, 'shoe' | 'seed' | 'dealer' | 'runningCount'> {
  shoe: { remaining: number; total: number; cutReached: boolean; shuffleIndex: number };
  dealer: { cards: (Card | null)[]; holeRevealed: boolean };
  runningCount: number | null;
}

export interface PublicViewOptions {
  /** Expose the Hi-Lo running count (practice coach). Off for ranked play. */
  exposeCount?: boolean;
}

/**
 * Strip everything a player must not see: the shoe order, the seed,
 * and the dealer's hole card until it is turned over.
 */
export function publicView(s: TableState, opts: PublicViewOptions = {}): PublicTable {
  const { shoe, seed: _seed, dealer, runningCount, ...rest } = s;
  return structuredClone({
    ...rest,
    shoe: {
      remaining: cardsRemaining(s),
      total: shoe.cards.length,
      cutReached: shoe.pos >= shoe.cutAt,
      shuffleIndex: shoe.shuffleIndex,
    },
    dealer: {
      cards: dealer.cards.map((c, i) => (i === 1 && !dealer.holeRevealed ? null : c)),
      holeRevealed: dealer.holeRevealed,
    },
    runningCount: opts.exposeCount ? runningCount : null,
  });
}
