import { describe, expect, it } from 'vitest';
import {
  type Action,
  type TableState,
  apply,
  createTable,
  handTotal,
  legalActions,
  publicView,
  seatWorth,
  shareGrid,
  trueCount,
  dayNumber,
  DAILY_CONFIG,
} from '../src/index.ts';

/**
 * Build a 1-human table whose shoe starts with `cards`.
 * Deal order (1 seat): P1, D-up, P2, D-hole, then hits in order.
 */
function rigged(cards: string[], seats = 1): TableState {
  const t = createTable('test', Array.from({ length: seats }, (_, i) => ({ kind: 'human' as const, name: `P${i}` })));
  t.shoe.cards = [...cards, ...t.shoe.cards];
  return t;
}

function run(s: TableState, ...actions: Action[]): TableState {
  for (const a of actions) s = apply(s, a).state;
  return s;
}

const bet = (amount = 100, seat = 0): Action => ({ type: 'bet', seat, amount });

describe('hand totals', () => {
  it('handles soft and hard aces', () => {
    expect(handTotal(['AS', '6H'])).toEqual({ total: 17, soft: true });
    expect(handTotal(['AS', '6H', 'TC'])).toEqual({ total: 17, soft: false });
    expect(handTotal(['AS', 'AH'])).toEqual({ total: 12, soft: true });
    expect(handTotal(['AS', 'AH', '9C'])).toEqual({ total: 21, soft: true });
    expect(handTotal(['KS', 'QH', '2C'])).toEqual({ total: 22, soft: false });
  });
});

describe('payouts', () => {
  it('pays a natural 3:2', () => {
    const s = run(rigged(['AS', '9H', 'KD', '7C']), bet(100));
    expect(s.phase).toBe('settled');
    expect(s.seats[0].bankroll).toBe(1150);
    expect(s.history[0].results).toEqual(['blackjack']);
  });

  it('pays a 21 reached by hitting 1:1 (old engine paid 3:2)', () => {
    // P: 5,6 → hit T = 21. Dealer 9,8 = 17.
    const s = run(rigged(['5S', '9H', '6D', '8C', 'TC']), bet(100), { type: 'hit', seat: 0 });
    expect(s.seats[0].hands[0].result).toBe('win');
    expect(s.seats[0].bankroll).toBe(1100);
  });

  it('dealer stands on soft 17', () => {
    const s = run(
      rigged(['TS', 'AH', '8D', '6C']),
      bet(100),
      { type: 'insurance', seat: 0, take: false },
      { type: 'stand', seat: 0 },
    );
    expect(s.dealer.cards).toHaveLength(2);
    expect(s.seats[0].hands[0].result).toBe('win'); // 18 vs soft 17
  });

  it('busts lose even if the dealer busts too', () => {
    const s = run(rigged(['TS', '6H', '6D', 'TC', 'KH']), bet(100), { type: 'hit', seat: 0 });
    expect(s.seats[0].hands[0].result).toBe('bust');
    expect(s.dealer.cards).toHaveLength(2); // dealer doesn't draw when everyone busted
    expect(s.seats[0].bankroll).toBe(900);
  });

  it('pushes on equal totals', () => {
    const s = run(rigged(['TS', 'TH', '8D', '8C']), bet(100), { type: 'stand', seat: 0 });
    expect(s.seats[0].hands[0].result).toBe('push');
    expect(s.seats[0].bankroll).toBe(1000);
  });
});

describe('peek and insurance', () => {
  it('dealer blackjack with a ten up ends the round immediately', () => {
    const s = run(rigged(['9S', 'KH', '8D', 'AC']), bet(100));
    expect(s.phase).toBe('settled');
    expect(s.seats[0].bankroll).toBe(900);
  });

  it('player natural pushes against dealer natural', () => {
    const s = run(rigged(['AS', 'KH', 'QD', 'AC']), bet(100));
    expect(s.seats[0].hands[0].result).toBe('push');
    expect(s.seats[0].bankroll).toBe(1000);
  });

  it('offers insurance on an ace and pays 2:1', () => {
    let s = run(rigged(['9S', 'AH', '8D', 'KC']), bet(100));
    expect(s.phase).toBe('insurance');
    s = run(s, { type: 'insurance', seat: 0, take: true });
    expect(s.phase).toBe('settled');
    // Lose 100 main bet, win 100 on 50 insurance → even.
    expect(s.seats[0].bankroll).toBe(1000);
  });

  it('insurance is lost when the dealer has no blackjack', () => {
    let s = run(rigged(['TS', 'AH', '9D', '6C']), bet(100), { type: 'insurance', seat: 0, take: true });
    expect(s.phase).toBe('playing');
    s = run(s, { type: 'stand', seat: 0 });
    // P 19 vs dealer A6 = soft 17 → win 100, lose 50 insurance.
    expect(s.seats[0].bankroll).toBe(1050);
  });
});

describe('double, split, surrender', () => {
  it('doubles for exactly one card', () => {
    const s = run(rigged(['5S', '9H', '6D', '7C', 'TC']), bet(100), { type: 'double', seat: 0 });
    expect(s.seats[0].hands[0].cards).toHaveLength(3);
    expect(s.seats[0].hands[0].bet).toBe(200);
    expect(s.seats[0].bankroll).toBe(1200);
  });

  it('splits into two hands and settles each', () => {
    // P 8,8 vs dealer 6 (hole T). Hand1 gets 3 → 11, double gets T → 21.
    // Hand2 gets T → 18, stand. Dealer 16 draws 9 → bust.
    let s = run(rigged(['8S', '6H', '8D', 'TC', '3H', 'TD', 'TS', '9C']), bet(100), { type: 'split', seat: 0 });
    expect(s.seats[0].hands).toHaveLength(2);
    expect(legalActions(s)).toContain('double'); // double after split
    s = run(s, { type: 'double', seat: 0 });
    expect(s.turn).toEqual({ seat: 0, hand: 1 });
    s = run(s, { type: 'stand', seat: 0 });
    expect(s.seats[0].hands.map((h) => h.result)).toEqual(['win', 'win']);
    expect(s.seats[0].bankroll).toBe(1300);
    expect(s.history[0].split).toBe(true);
  });

  it('split aces get one card each and a split 21 is not a blackjack', () => {
    const s = run(rigged(['AS', '9H', 'AD', '8C', 'KH', '5D']), bet(100), { type: 'split', seat: 0 });
    expect(s.phase).toBe('settled');
    const [h1, h2] = s.seats[0].hands;
    expect(h1.cards).toEqual(['AS', 'KH']);
    expect(h1.result).toBe('win'); // 21 vs 17, paid 1:1
    expect(h2.cards).toEqual(['AD', '5D']);
    expect(h2.result).toBe('lose'); // 16 vs 17
    expect(s.seats[0].bankroll).toBe(1000);
  });

  it('allows up to 4 hands', () => {
    let s = run(rigged(['8S', '6H', '8D', 'TC', '8H', '8C', '8S']), bet(100));
    s = run(s, { type: 'split', seat: 0 });
    s = run(s, { type: 'split', seat: 0 });
    s = run(s, { type: 'split', seat: 0 });
    expect(s.seats[0].hands).toHaveLength(4);
    expect(legalActions(s)).not.toContain('split');
  });

  it('surrender returns half the bet and is first-decision only', () => {
    let s = run(rigged(['TS', 'TH', '6D', '8C', '2C']), bet(100));
    expect(legalActions(s)).toContain('surrender');
    s = run(s, { type: 'surrender', seat: 0 });
    expect(s.seats[0].bankroll).toBe(950);
    let t = run(rigged(['TS', 'TH', '2D', '8C', '2C']), bet(100), { type: 'hit', seat: 0 });
    expect(legalActions(t)).not.toContain('surrender');
    expect(legalActions(t)).not.toContain('double');
  });
});

describe('validation', () => {
  it('rejects bad bets and out-of-turn actions', () => {
    const t = rigged(['TS', 'TH', '6D', '8C']);
    expect(() => apply(t, bet(15))).toThrow(/multiple/);
    expect(() => apply(t, bet(600))).toThrow(/between/);
    expect(() => apply(t, bet(5))).toThrow();
    const s = run(t, bet(100));
    expect(() => apply(s, { type: 'split', seat: 0 })).toThrow();
    expect(() => apply(s, { type: 'nextRound' })).toThrow();
  });

  it('waits for every seat to bet before dealing', () => {
    let s = createTable('x', [{ kind: 'bot', name: 'A' }, { kind: 'human', name: 'Me' }]);
    s = run(s, bet(10, 1));
    expect(s.phase).toBe('betting');
    s = run(s, bet(10, 0));
    expect(s.phase).not.toBe('betting');
  });
});

describe('determinism, privacy and conservation', () => {
  /** Plays a whole table with a fixed simple policy. */
  function autoplay(seed: string): TableState {
    let s = createTable(seed, [
      { kind: 'bot', name: 'A' },
      { kind: 'human', name: 'Me' },
      { kind: 'bot', name: 'B' },
    ]);
    let guard = 0;
    while (s.phase !== 'finished' && guard++ < 10_000) {
      if (s.phase === 'betting') {
        const seat = s.seats.find((x) => x.kind !== 'empty' && !x.sittingOut && x.bet === 0)!;
        s = apply(s, bet(Math.min(50, Math.floor(seat.bankroll / 10) * 10), seat.id)).state;
      } else if (s.phase === 'insurance') {
        const seat = s.seats.find((x) => !x.insuranceDecided && !x.sittingOut && x.kind !== 'empty')!;
        s = apply(s, { type: 'insurance', seat: seat.id, take: false }).state;
      } else if (s.phase === 'playing') {
        const legal = legalActions(s);
        const total = handTotal(s.seats[s.turn!.seat].hands[s.turn!.hand].cards).total;
        const action = legal.includes('split') ? 'split' : total < 17 ? 'hit' : 'stand';
        s = apply(s, { type: action, seat: s.turn!.seat }).state;
      } else if (s.phase === 'settled') {
        // Conservation: money only moves via recorded nets.
        const net = s.history.reduce((a, r) => a + r.net, 0);
        const worth = s.seats.reduce((a, x) => a + seatWorth(x), 0);
        expect(worth).toBe(3000 + net);
        s = apply(s, { type: 'nextRound' }).state;
      }
    }
    return s;
  }

  it('same seed + same actions → identical game', () => {
    expect(JSON.stringify(autoplay('2026-11-17'))).toBe(JSON.stringify(autoplay('2026-11-17')));
    expect(JSON.stringify(autoplay('2026-11-17'))).not.toBe(JSON.stringify(autoplay('2026-11-18')));
  });

  it('finishes after the daily round limit', () => {
    const s = autoplay('limit');
    expect(s.round).toBe(DAILY_CONFIG.maxRounds);
    expect(shareGrid(s.history, 1).length).toBeGreaterThan(0);
  });

  it('public view never leaks the shoe, seed or hole card', () => {
    const s = run(rigged(['TS', '9H', '8D', 'KC']), bet(100));
    const view = publicView(s);
    const json = JSON.stringify(view);
    expect(view.dealer.cards).toEqual(['9H', null]);
    expect(json).not.toContain('KC');
    expect(json).not.toContain('"seed"');
    expect(view.runningCount).toBeNull();
    expect((view as any).shoe.cards).toBeUndefined();
  });

  it('reshuffles at the cut card between rounds', () => {
    let s = createTable('cut', [{ kind: 'human', name: 'Me' }], { ...DAILY_CONFIG, maxRounds: 0 });
    s.shoe.pos = s.shoe.cutAt;
    s = run(s, bet(10));
    while (s.phase !== 'settled') {
      s = s.phase === 'insurance'
        ? apply(s, { type: 'insurance', seat: 0, take: false }).state
        : apply(s, { type: 'stand', seat: 0 }).state;
    }
    const { state, events } = apply(s, { type: 'nextRound' });
    expect(events[0]).toEqual({ t: 'shuffle', shuffleIndex: 1 });
    expect(state.shoe.pos).toBe(0);
    expect(state.runningCount).toBe(0);
  });
});

describe('helpers', () => {
  it('true count matches Python floor division', () => {
    expect(trueCount(7, 150)).toBe(2); // 7 // 3
    expect(trueCount(-7, 150)).toBe(-3); // -7 // 3
    expect(trueCount(5, 10)).toBe(5);
  });
  it('numbers days from launch', () => {
    expect(dayNumber('2026-11-17')).toBe(1);
    expect(dayNumber('2026-12-17')).toBe(31);
  });
});
