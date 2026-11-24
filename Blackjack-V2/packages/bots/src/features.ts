import { type Card, encodeCard } from '@bj/engine';

/**
 * The 106-dim input the original models were trained on
 * (Random_Forest.py / NN.py / Decision_Tree.py `preprocess_input`):
 *   [0..51]   one-hot player cards (suit*13 + rank)
 *   [52..103] one-hot dealer upcard
 *   [104]     running count
 *   [105]     bet
 */
export function features(hand: readonly Card[], upcard: Card, count: number, bet: number): Float64Array {
  const x = new Float64Array(106);
  for (const c of hand) x[encodeCard(c)] = 1;
  x[52 + encodeCard(upcard)] = 1;
  x[104] = count;
  x[105] = bet;
  return x;
}
