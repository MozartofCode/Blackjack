import {
  type PlayAction,
  type TableState,
  cardsRemaining,
  handTotal,
  legalActions,
  rankOf,
  trueCount,
  upcardNumber,
} from '@bj/engine';
import { hiLoBet } from './betting.ts';
import { features } from './features.ts';
import {
  type DecisionTreeJson,
  type DenseNetJson,
  type ForestJson,
  type Prediction,
  type QTableJson,
  predictDense,
  predictForest,
  predictQ,
  predictTree,
} from './models.ts';
import { BOTS, type BotId } from './roster.ts';
import { ACTION_LABEL, MOVE_TO_ACTION, basicStrategy } from './strategy.ts';

/** The exported model weights. Hosts load these however suits them. */
export interface ModelBundle {
  forest: ForestJson;
  tree: DecisionTreeJson;
  nnBot2: DenseNetJson;
  nnPlayer: DenseNetJson;
  q: QTableJson;
}

export interface BotChoice<T> {
  value: T;
  /** Short human-readable reason, shown as a speech chip. */
  note: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function botBet(state: TableState, seatId: number): BotChoice<number> {
  const seat = state.seats[seatId];
  const tc = trueCount(state.runningCount, cardsRemaining(state));
  const amount = hiLoBet(seat.bankroll, tc, state.config);
  return { value: amount, note: `TC ${tc >= 0 ? '+' : ''}${tc} → $${amount}` };
}

function predict(id: BotId, m: ModelBundle, x: Float64Array): Prediction {
  switch (id) {
    case 'bot2': return predictDense(m.nnBot2, x);
    case 'bot3': return predictDense(m.nnPlayer, x);
    case 'bot4': return predictForest(m.forest, x);
    case 'bot5': return predictTree(m.tree, x);
    default: throw new Error(`No model for ${id}`);
  }
}

/**
 * Decide a bot's move for the hand whose turn it is.
 *  - Bot1: full basic strategy every decision.
 *  - Bot2-5: the model makes the first decision of each hand (incl. each
 *    split hand), then "hit below 17", exactly like the original bots.
 *    An illegal model move falls back to basic strategy.
 *  - Bot6: Q-table on every decision (hit/stand only).
 */
export function botPlay(state: TableState, seatId: number, models: ModelBundle): BotChoice<PlayAction> {
  const seat = state.seats[seatId];
  const id = seat.botId as BotId;
  const hand = seat.hands[state.turn!.hand];
  const upcard = state.dealer.cards[0];
  const legal = legalActions(state);
  const { total, soft } = handTotal(hand.cards);
  const label = `${soft ? 'soft ' : ''}${total}`;

  if (id === 'bot1') {
    const action = basicStrategy(hand.cards, upcard, legal);
    return { value: action, note: `${label}: ${ACTION_LABEL[action]}` };
  }

  if (id === 'bot6') {
    // Original Bot6 quirk: any Ace in the hand counts as a "usable ace".
    const usable = hand.cards.some((c) => rankOf(c) === 'A') ? 1 : 0;
    const p = predictQ(models.q, total, upcardNumber(upcard), usable);
    const action = MOVE_TO_ACTION[p.move];
    return { value: action, note: `Q-table on ${label}: ${ACTION_LABEL[action]}` };
  }

  const firstDecision = hand.cards.length === 2;
  if (!firstDecision) {
    const action: PlayAction = total < 17 ? 'hit' : 'stand';
    return { value: action, note: `${label}, ${total < 17 ? 'under' : 'at least'} 17: ${ACTION_LABEL[action]}` };
  }

  const p = predict(id, models, features(hand.cards, upcard, state.runningCount, hand.bet));
  const wanted = MOVE_TO_ACTION[p.move];
  if (legal.includes(wanted)) {
    return { value: wanted, note: `${BOTS[id].handle} says ${ACTION_LABEL[wanted]} (${pct(p.confidence)})` };
  }
  const fallback = basicStrategy(hand.cards, upcard, legal);
  return {
    value: fallback,
    note: `Wanted ${ACTION_LABEL[wanted]} (not allowed), so basic strategy: ${ACTION_LABEL[fallback]}`,
  };
}
