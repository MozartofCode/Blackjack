import {
  type ApplyResult,
  type GameEvent,
  type TableState,
  apply,
  seatsAwaitingBet,
  seatsAwaitingInsurance,
} from '@bj/engine';
import { type ModelBundle, botBet, botPlay } from './brain.ts';

/** What the table is waiting for once bots have acted. */
export type Waiting =
  | { for: 'bet'; seat: number }
  | { for: 'insurance'; seat: number }
  | { for: 'play'; seat: number; hand: number }
  | { for: 'nextRound' }
  | { for: 'nothing' };

export function waitingFor(s: TableState): Waiting {
  switch (s.phase) {
    case 'betting': {
      const seat = seatsAwaitingBet(s)[0];
      return seat ? { for: 'bet', seat: seat.id } : { for: 'nothing' };
    }
    case 'insurance': {
      const seat = seatsAwaitingInsurance(s)[0];
      return seat ? { for: 'insurance', seat: seat.id } : { for: 'nothing' };
    }
    case 'playing':
      return s.turn ? { for: 'play', seat: s.turn.seat, hand: s.turn.hand } : { for: 'nothing' };
    case 'settled':
      return { for: 'nextRound' };
    default:
      return { for: 'nothing' };
  }
}

/**
 * Let every bot act until a human decision is needed (or the round settles).
 * Bots bet first, so during betting only human seats are left waiting.
 */
export function runBots(state: TableState, models: ModelBundle, autoNextRound = false): ApplyResult {
  let s = state;
  const events: GameEvent[] = [];
  const step = (r: ApplyResult) => {
    s = r.state;
    events.push(...r.events);
  };

  for (let guard = 0; guard < 10_000; guard++) {
    if (s.phase === 'betting') {
      const bot = seatsAwaitingBet(s).find((x) => x.kind === 'bot');
      if (!bot) break;
      const choice = botBet(s, bot.id);
      events.push({ t: 'note', seat: bot.id, text: choice.note });
      step(apply(s, { type: 'bet', seat: bot.id, amount: choice.value }));
    } else if (s.phase === 'insurance') {
      const bot = seatsAwaitingInsurance(s).find((x) => x.kind === 'bot');
      if (!bot) break;
      // None of the bots take insurance (basic strategy says no).
      step(apply(s, { type: 'insurance', seat: bot.id, take: false }));
    } else if (s.phase === 'playing' && s.turn) {
      const seat = s.seats[s.turn.seat];
      if (seat.kind !== 'bot') break;
      const choice = botPlay(s, seat.id, models);
      events.push({ t: 'note', seat: seat.id, text: choice.note });
      step(apply(s, { type: choice.value, seat: seat.id }));
    } else if (s.phase === 'settled' && autoNextRound) {
      step(apply(s, { type: 'nextRound' }));
    } else {
      break;
    }
  }
  return { state: s, events };
}

/** Apply a human action, then let the bots catch up to the next human decision. */
export function humanAct(
  state: TableState,
  action: Parameters<typeof apply>[1],
  models: ModelBundle,
): ApplyResult {
  const first = apply(state, action);
  const rest = runBots(first.state, models);
  return { state: rest.state, events: [...first.events, ...rest.events] };
}

/** Run a bots-only table to completion (official bot scores, lounge, sims). */
export function simulateToEnd(state: TableState, models: ModelBundle): TableState {
  return runBots(state, models, true).state;
}
