import type { GameEvent, Hand, PublicTable } from '@bj/engine';

export type Speed = 1 | 2 | 0; // 0 = skip animations

/** How long to linger after each event (ms at 1×). */
export function eventDelay(e: GameEvent, humanSeat: number | null): number {
  switch (e.t) {
    case 'deal':
      return 190;
    case 'reveal':
      return 520;
    case 'note':
      return e.seat === humanSeat ? 0 : 430;
    case 'action':
      return e.seat === humanSeat ? 60 : 160;
    case 'bet':
      return e.seat === humanSeat ? 80 : 110;
    case 'peek':
      return 650;
    case 'result':
      return 140;
    case 'shuffle':
      return 900;
    case 'insuranceOffer':
      return 300;
    default:
      return 0;
  }
}

const blankHand = (bet: number): Hand => ({
  cards: [],
  bet,
  doubled: false,
  fromSplit: false,
  splitAces: false,
  surrendered: false,
  done: false,
});

/**
 * Advance the on-screen table by one event. The authoritative view replaces
 * the display once playback finishes, so this only needs to look right.
 */
export function applyToDisplay(d: PublicTable, e: GameEvent): PublicTable {
  const v: PublicTable = structuredClone(d);
  switch (e.t) {
    case 'bet': {
      const seat = v.seats[e.seat];
      seat.bet = e.amount;
      seat.bankroll -= e.amount;
      break;
    }
    case 'deal': {
      // The display is cleared (clearForNextRound) before a new round's deal.
      if (v.phase === 'betting') v.phase = 'playing';
      if (e.to === 'dealer') {
        v.dealer.cards.push(e.card);
      } else {
        const seat = v.seats[e.to];
        while (seat.hands.length <= e.hand) seat.hands.push(blankHand(seat.bet));
        if (e.card) seat.hands[e.hand].cards.push(e.card);
      }
      break;
    }
    case 'reveal':
      v.dealer.cards[1] = e.card;
      v.dealer.holeRevealed = true;
      v.turn = null;
      break;
    case 'turn':
      v.turn = { seat: e.seat, hand: e.hand };
      break;
    case 'action': {
      const seat = v.seats[e.seat];
      const hand = seat.hands[e.hand];
      if (!hand) break;
      if (e.action === 'double') {
        seat.bankroll -= hand.bet;
        hand.bet *= 2;
        hand.doubled = true;
      } else if (e.action === 'split') {
        seat.bankroll -= hand.bet;
        const moved = hand.cards.pop()!;
        hand.fromSplit = true;
        seat.hands.splice(e.hand + 1, 0, { ...blankHand(hand.bet), cards: [moved], fromSplit: true });
      } else if (e.action === 'surrender') {
        hand.surrendered = true;
      }
      break;
    }
    case 'result': {
      const hand = v.seats[e.seat].hands[e.hand];
      if (hand) {
        hand.result = e.result;
        hand.net = e.net;
      }
      break;
    }
    case 'insuranceOffer':
      v.phase = 'insurance';
      break;
    case 'roundEnd':
      v.phase = 'settled';
      v.turn = null;
      break;
    default:
      break;
  }
  return v;
}

/** Start-of-round reset so the table clears before new bets go out. */
export function clearForNextRound(d: PublicTable): PublicTable {
  const v: PublicTable = structuredClone(d);
  v.dealer = { cards: [], holeRevealed: false };
  v.turn = null;
  v.phase = 'betting';
  for (const seat of v.seats) {
    seat.hands = [];
    seat.bet = 0;
    seat.insurance = 0;
  }
  return v;
}
