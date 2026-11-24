import { type Card, RANKS, SUITS, cardValue, hiLo, rankOf } from './cards.ts';
import { handTotal, isBust, isNatural, isPair } from './hand.ts';
import { shuffle } from './rng.ts';
import {
  type Action,
  type ApplyResult,
  DAILY_CONFIG,
  type GameEvent,
  type Hand,
  type PlayAction,
  type Seat,
  type SeatInit,
  type Shoe,
  type TableConfig,
  type TableState,
} from './types.ts';

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

// ─── Shoe ────────────────────────────────────────────────────────────────────

export function buildShoe(seed: string, config: TableConfig, shuffleIndex: number): Shoe {
  const ordered: Card[] = [];
  for (let d = 0; d < config.decks; d++) {
    for (const s of SUITS) for (const r of RANKS) ordered.push(r + s);
  }
  const cards = shuffle(ordered, `${seed}#shoe${shuffleIndex}`);
  return { cards, pos: 0, cutAt: Math.floor(cards.length * config.penetration), shuffleIndex };
}

function reshuffle(s: TableState, events: GameEvent[]) {
  s.shoe = buildShoe(s.seed, s.config, s.shoe.shuffleIndex + 1);
  s.runningCount = 0;
  events.push({ t: 'shuffle', shuffleIndex: s.shoe.shuffleIndex });
}

function draw(s: TableState, events: GameEvent[]): Card {
  // Emergency reshuffle if the shoe somehow runs dry mid-round.
  if (s.shoe.pos >= s.shoe.cards.length) reshuffle(s, events);
  return s.shoe.cards[s.shoe.pos++];
}

export const cardsRemaining = (s: Pick<TableState, 'shoe'>) => s.shoe.cards.length - s.shoe.pos;

/**
 * Hi-Lo true count exactly like the original Bot1.get_true_count:
 * running_count // ceil(cards_left / 52) (Python floor division).
 */
export function trueCount(runningCount: number, remaining: number): number {
  const decksLeft = Math.max(1, Math.ceil(remaining / 52));
  return Math.floor(runningCount / decksLeft);
}

// ─── Creation ────────────────────────────────────────────────────────────────

export function createTable(
  seed: string,
  seats: SeatInit[],
  config: TableConfig = DAILY_CONFIG,
): TableState {
  if (seats.length < 1 || seats.length > 7) throw new RuleError('A table needs 1-7 seats');
  return {
    config,
    seed,
    shoe: buildShoe(seed, config, 0),
    runningCount: 0,
    round: 1,
    phase: 'betting',
    seats: seats.map((init, id) => ({
      id,
      kind: init.kind,
      name: init.name,
      botId: init.botId,
      bankroll: init.kind === 'empty' ? 0 : (init.bankroll ?? config.startingBankroll),
      bet: 0,
      insurance: 0,
      insuranceDecided: true,
      hands: [],
      sittingOut: init.kind === 'empty',
    })),
    dealer: { cards: [], holeRevealed: false },
    turn: null,
    history: [],
    decisions: [],
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export const isActive = (seat: Seat) => seat.kind !== 'empty' && !seat.sittingOut;
export const activeSeats = (s: TableState) => s.seats.filter(isActive);

/** Seats that still need to place a bet this round. */
export function seatsAwaitingBet(s: TableState): Seat[] {
  if (s.phase !== 'betting') return [];
  return activeSeats(s).filter((seat) => seat.bet === 0);
}

/** Seats that still need to decide on insurance. */
export function seatsAwaitingInsurance(s: TableState): Seat[] {
  if (s.phase !== 'insurance') return [];
  return activeSeats(s).filter((seat) => !seat.insuranceDecided);
}

export function currentHand(s: TableState): Hand | null {
  if (!s.turn) return null;
  return s.seats[s.turn.seat].hands[s.turn.hand] ?? null;
}

/** Works on full or public table state (only reads phase/turn/seats/config). */
export function legalActions(s: Pick<TableState, 'phase' | 'turn' | 'seats' | 'config'>): PlayAction[] {
  if (s.phase !== 'playing' || !s.turn) return [];
  const seat = s.seats[s.turn.seat];
  const hand = seat.hands[s.turn.hand];
  if (!hand || hand.done) return [];
  const out: PlayAction[] = ['hit', 'stand'];
  if (hand.cards.length === 2) {
    if (seat.bankroll >= hand.bet) out.push('double');
    if (
      isPair(hand.cards) &&
      !hand.splitAces &&
      seat.hands.length < s.config.maxHands &&
      seat.bankroll >= hand.bet
    ) {
      out.push('split');
    }
    if (!hand.fromSplit && seat.hands.length === 1) out.push('surrender');
  }
  return out;
}

/** Largest legal bet for a seat right now. */
export function maxBetFor(s: Pick<TableState, 'config'>, seat: Pick<Seat, 'bankroll'>): number {
  const cap = Math.min(s.config.maxBet, seat.bankroll);
  return Math.floor(cap / s.config.betStep) * s.config.betStep;
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

/**
 * Pure reducer: returns a new state plus the ordered list of things that
 * happened (for the UI to animate). Throws RuleError on illegal actions.
 */
export function apply(state: TableState, action: Action): ApplyResult {
  const s: TableState = structuredClone(state);
  const events: GameEvent[] = [];

  switch (action.type) {
    case 'bet':
      placeBet(s, action.seat, action.amount, events);
      break;
    case 'insurance':
      decideInsurance(s, action.seat, action.take, events);
      break;
    case 'nextRound':
      nextRound(s, events);
      break;
    case 'hit':
    case 'stand':
    case 'double':
    case 'split':
    case 'surrender':
      play(s, action.seat, action.type, events);
      break;
    default:
      throw new RuleError(`Unknown action ${(action as Action).type}`);
  }
  return { state: s, events };
}

function placeBet(s: TableState, seatId: number, amount: number, events: GameEvent[]) {
  if (s.phase !== 'betting') throw new RuleError('Not accepting bets right now');
  const seat = s.seats[seatId];
  if (!seat || !isActive(seat)) throw new RuleError('Seat is not in play');
  if (seat.bet > 0) throw new RuleError('Bet already placed');
  const { minBet, betStep } = s.config;
  if (!Number.isInteger(amount) || amount % betStep !== 0) {
    throw new RuleError(`Bets must be a multiple of $${betStep}`);
  }
  if (amount < minBet || amount > maxBetFor(s, seat)) {
    throw new RuleError(`Bet must be between $${minBet} and $${maxBetFor(s, seat)}`);
  }
  seat.bankroll -= amount;
  seat.bet = amount;
  events.push({ t: 'bet', seat: seatId, amount });
  if (seatsAwaitingBet(s).length === 0) dealRound(s, events);
}

function newHand(bet: number): Hand {
  return { cards: [], bet, doubled: false, fromSplit: false, splitAces: false, surrendered: false, done: false };
}

function dealTo(s: TableState, seat: Seat, handIdx: number, events: GameEvent[]) {
  const card = draw(s, events);
  s.runningCount += hiLo(card);
  seat.hands[handIdx].cards.push(card);
  events.push({ t: 'deal', to: seat.id, hand: handIdx, card });
  return card;
}

function dealRound(s: TableState, events: GameEvent[]) {
  const seats = activeSeats(s);
  for (const seat of seats) seat.hands = [newHand(seat.bet)];
  s.dealer = { cards: [], holeRevealed: false };

  for (let pass = 0; pass < 2; pass++) {
    for (const seat of seats) dealTo(s, seat, 0, events);
    const card = draw(s, events);
    s.dealer.cards.push(card);
    if (pass === 0) {
      s.runningCount += hiLo(card);
      events.push({ t: 'deal', to: 'dealer', hand: 0, card });
    } else {
      // Hole card: hidden and not counted until it is revealed.
      events.push({ t: 'deal', to: 'dealer', hand: 0, card: null });
    }
  }

  const up = s.dealer.cards[0];
  if (rankOf(up) === 'A') {
    s.phase = 'insurance';
    events.push({ t: 'insuranceOffer' });
    for (const seat of seats) {
      // Seats that can't afford insurance are auto-declined.
      seat.insuranceDecided = seat.bankroll < seat.bet / 2;
    }
    if (seatsAwaitingInsurance(s).length === 0) resolvePeek(s, events);
  } else {
    resolvePeek(s, events);
  }
}

function decideInsurance(s: TableState, seatId: number, take: boolean, events: GameEvent[]) {
  if (s.phase !== 'insurance') throw new RuleError('Insurance is not on offer');
  const seat = s.seats[seatId];
  if (!seat || !isActive(seat) || seat.insuranceDecided) throw new RuleError('No insurance decision pending');
  if (take) {
    const amount = seat.bet / 2;
    if (seat.bankroll < amount) throw new RuleError('Not enough chips for insurance');
    seat.bankroll -= amount;
    seat.insurance = amount;
    events.push({ t: 'insurance', seat: seatId, amount });
  }
  seat.insuranceDecided = true;
  if (seatsAwaitingInsurance(s).length === 0) resolvePeek(s, events);
}

function revealHole(s: TableState, events: GameEvent[]) {
  if (s.dealer.holeRevealed) return;
  s.dealer.holeRevealed = true;
  const hole = s.dealer.cards[1];
  s.runningCount += hiLo(hole);
  events.push({ t: 'reveal', card: hole });
}

function resolvePeek(s: TableState, events: GameEvent[]) {
  const upValue = cardValue(s.dealer.cards[0]);
  if (upValue >= 10) {
    const dealerBlackjack = isNatural(s.dealer.cards);
    events.push({ t: 'peek', dealerBlackjack });
    if (dealerBlackjack) {
      revealHole(s, events);
      settle(s, events);
      return;
    }
  }
  s.phase = 'playing';
  for (const seat of activeSeats(s)) {
    const hand = seat.hands[0];
    if (isNatural(hand.cards)) hand.done = true;
  }
  advanceTurn(s, events);
}

function advanceTurn(s: TableState, events: GameEvent[]) {
  for (const seat of activeSeats(s)) {
    for (let h = 0; h < seat.hands.length; h++) {
      const hand = seat.hands[h];
      if (hand.done) continue;
      // Split hands get their second card when their turn comes up.
      if (hand.cards.length === 1) {
        dealTo(s, seat, h, events);
        if (hand.splitAces || handTotal(hand.cards).total === 21) {
          hand.done = true;
          continue;
        }
      }
      s.turn = { seat: seat.id, hand: h };
      events.push({ t: 'turn', seat: seat.id, hand: h });
      return;
    }
  }
  s.turn = null;
  dealerPlay(s, events);
}

function play(s: TableState, seatId: number, action: PlayAction, events: GameEvent[]) {
  if (s.phase !== 'playing' || !s.turn) throw new RuleError('No hand is being played');
  if (s.turn.seat !== seatId) throw new RuleError("It's not this seat's turn");
  const legal = legalActions(s);
  if (!legal.includes(action)) throw new RuleError(`Can't ${action} right now`);

  const seat = s.seats[seatId];
  const handIdx = s.turn.hand;
  const hand = seat.hands[handIdx];

  if (seat.kind === 'human') {
    s.decisions.push({
      round: s.round,
      seat: seatId,
      hand: handIdx,
      cards: hand.cards.slice(),
      upcard: s.dealer.cards[0],
      action,
      legal,
      firstDecision: hand.cards.length === 2,
    });
  }
  events.push({ t: 'action', seat: seatId, hand: handIdx, action });

  switch (action) {
    case 'hit': {
      dealTo(s, seat, handIdx, events);
      const total = handTotal(hand.cards).total;
      if (total >= 21) hand.done = true;
      break;
    }
    case 'stand':
      hand.done = true;
      break;
    case 'double':
      seat.bankroll -= hand.bet;
      hand.bet *= 2;
      hand.doubled = true;
      dealTo(s, seat, handIdx, events);
      hand.done = true;
      break;
    case 'split': {
      seat.bankroll -= hand.bet;
      const aces = rankOf(hand.cards[0]) === 'A';
      const moved = hand.cards.pop()!;
      const sibling: Hand = { ...newHand(hand.bet), cards: [moved], fromSplit: true, splitAces: aces };
      hand.fromSplit = true;
      hand.splitAces = aces;
      seat.hands.splice(handIdx + 1, 0, sibling);
      dealTo(s, seat, handIdx, events);
      if (aces || handTotal(hand.cards).total === 21) hand.done = true;
      break;
    }
    case 'surrender':
      hand.surrendered = true;
      hand.done = true;
      break;
  }

  if (hand.done) advanceTurn(s, events);
}

function dealerPlay(s: TableState, events: GameEvent[]) {
  revealHole(s, events);
  const needsPlay = activeSeats(s).some((seat) =>
    seat.hands.some(
      (h) => !h.surrendered && !isBust(h.cards) && !(isNatural(h.cards) && !h.fromSplit),
    ),
  );
  if (needsPlay) {
    for (;;) {
      const { total, soft } = handTotal(s.dealer.cards);
      const hits = total < 17 || (s.config.dealerHitsSoft17 && total === 17 && soft);
      if (!hits) break;
      const card = draw(s, events);
      s.runningCount += hiLo(card);
      s.dealer.cards.push(card);
      events.push({ t: 'deal', to: 'dealer', hand: 0, card });
    }
  }
  settle(s, events);
}

function settle(s: TableState, events: GameEvent[]) {
  s.phase = 'settled';
  s.turn = null;
  const dealerCards = s.dealer.cards;
  const dealerBJ = s.dealer.holeRevealed && isNatural(dealerCards);
  const dealerTotal = handTotal(dealerCards).total;
  const dealerBust = dealerTotal > 21;

  for (const seat of activeSeats(s)) {
    let roundNet = 0;
    seat.hands.forEach((hand, idx) => {
      const pt = handTotal(hand.cards).total;
      const natural = isNatural(hand.cards) && !hand.fromSplit;
      let result: Hand['result'];
      let net: number;
      if (hand.surrendered) {
        result = 'surrender';
        net = -hand.bet / 2;
      } else if (pt > 21) {
        result = 'bust';
        net = -hand.bet;
      } else if (dealerBJ) {
        result = natural ? 'push' : 'lose';
        net = natural ? 0 : -hand.bet;
      } else if (natural) {
        result = 'blackjack';
        net = (hand.bet * 3) / 2;
      } else if (dealerBust || pt > dealerTotal) {
        result = 'win';
        net = hand.bet;
      } else if (pt === dealerTotal) {
        result = 'push';
        net = 0;
      } else {
        result = 'lose';
        net = -hand.bet;
      }
      hand.result = result;
      hand.net = net;
      hand.done = true;
      seat.bankroll += hand.bet + net;
      roundNet += net;
      events.push({ t: 'result', seat: seat.id, hand: idx, result, net });
    });

    let insuranceNet = 0;
    if (seat.insurance > 0) {
      insuranceNet = dealerBJ ? seat.insurance * 2 : -seat.insurance;
      seat.bankroll += seat.insurance + insuranceNet;
      events.push({ t: 'insurancePaid', seat: seat.id, net: insuranceNet });
    }

    s.history.push({
      round: s.round,
      seat: seat.id,
      bet: seat.bet,
      net: roundNet + insuranceNet,
      results: seat.hands.map((h) => h.result!),
      split: seat.hands.length > 1,
      doubled: seat.hands.some((h) => h.doubled),
      insurance: seat.insurance,
    });
  }

  events.push({ t: 'roundEnd', round: s.round });

  if (isTableFinished(s)) {
    s.phase = 'finished';
    events.push({ t: 'finished' });
  }
}

function isTableFinished(s: TableState): boolean {
  if (s.config.maxRounds > 0 && s.round >= s.config.maxRounds) return true;
  const { minBet } = s.config;
  const humans = s.seats.filter((x) => x.kind === 'human');
  if (humans.length > 0) return humans.every((h) => h.bankroll < minBet);
  return s.seats.filter((x) => x.kind === 'bot').every((b) => b.bankroll < minBet);
}

function nextRound(s: TableState, events: GameEvent[]) {
  if (s.phase !== 'settled') throw new RuleError('The round is not over yet');
  s.round += 1;
  s.phase = 'betting';
  s.dealer = { cards: [], holeRevealed: false };
  s.turn = null;
  for (const seat of s.seats) {
    seat.bet = 0;
    seat.insurance = 0;
    seat.insuranceDecided = true;
    seat.hands = [];
    if (seat.kind !== 'empty' && seat.bankroll < s.config.minBet) seat.sittingOut = true;
  }
  if (s.shoe.pos >= s.shoe.cutAt) reshuffle(s, events);
}

/** Total chips a seat owns, including anything currently on the table. */
export function seatWorth(seat: Seat): number {
  let worth = seat.bankroll;
  if (seat.hands.length === 0) worth += seat.bet; // bet placed, cards not dealt yet
  else if (seat.hands.some((h) => h.result === undefined)) {
    worth += seat.hands.reduce((a, h) => a + h.bet, 0) + seat.insurance;
  }
  return worth;
}
