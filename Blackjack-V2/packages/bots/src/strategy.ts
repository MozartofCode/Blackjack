import { type Card, type PlayAction, RANKS, cardValue, handTotal, rankOf } from '@bj/engine';
import BASIC from '../models/basic_strategy.json' with { type: 'json' };
import type { Move } from './models.ts';

const TABLE = BASIC as Record<string, Move>;

export const MOVE_TO_ACTION: Record<Move, PlayAction> = {
  H: 'hit',
  S: 'stand',
  D: 'double',
  SP: 'split',
  SU: 'surrender',
};

export const ACTION_LABEL: Record<PlayAction, string> = {
  hit: 'Hit',
  stand: 'Stand',
  double: 'Double',
  split: 'Split',
  surrender: 'Surrender',
};

/**
 * Bertan's original Basic_Strategy.py decision for a 2-card hand
 * (exported verbatim to basic_strategy.json by tools/export_models.py).
 */
export function tableMove(cards: readonly Card[], upcard: Card): Move | null {
  if (cards.length !== 2) return null;
  const [a, b] = cards.map(rankOf).sort((x, y) => RANKS.indexOf(x) - RANKS.indexOf(y));
  return TABLE[`${a}${b}|${rankOf(upcard)}`] ?? null;
}

/** Standard hit/stand chart for hands of 3+ cards (or when the table's move isn't allowed). */
export function chartMove(cards: readonly Card[], upcard: Card): 'H' | 'S' {
  const { total, soft } = handTotal(cards);
  const up = cardValue(upcard); // 2..11
  if (soft) {
    if (total >= 19) return 'S';
    if (total === 18) return up <= 8 ? 'S' : 'H';
    return 'H';
  }
  if (total >= 17) return 'S';
  if (total >= 13) return up <= 6 ? 'S' : 'H';
  if (total === 12) return up >= 4 && up <= 6 ? 'S' : 'H';
  return 'H';
}

/** Full basic strategy restricted to what is legal right now. */
export function basicStrategy(cards: readonly Card[], upcard: Card, legal: readonly PlayAction[]): PlayAction {
  const m = tableMove(cards, upcard);
  if (m && legal.includes(MOVE_TO_ACTION[m])) return MOVE_TO_ACTION[m];
  return MOVE_TO_ACTION[chartMove(cards, upcard)];
}
