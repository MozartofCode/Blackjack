import { describe, expect, it } from 'vitest';
import { type Card, DAILY_CONFIG, createTable, legalActions } from '@bj/engine';
import fixtures from '../models/fixtures.json' with { type: 'json' };
import { models } from '../src/bundle.ts';
import {
  BOTS,
  HUMAN_SEAT,
  basicStrategy,
  chartMove,
  dailyLineup,
  dailySeats,
  features,
  hiLoBet,
  originalBettingStrategy,
  predictDense,
  predictForest,
  predictQ,
  predictTree,
  runBots,
  simulateToEnd,
  tableMove,
  waitingFor,
} from '../src/index.ts';

interface Fixture {
  hand: string[];
  upcard: string;
  count: number;
  bet: number;
  dt: string;
  rf: string;
  nn_bot2: string;
  nn_player: string;
}

const LONG: Record<string, string> = { '10': 'T', Jack: 'J', Queen: 'Q', King: 'K', Ace: 'A' };
const SUIT: Record<string, string> = { Hearts: 'H', Diamonds: 'D', Clubs: 'C', Spades: 'S' };
const short = (c: string): Card => {
  const [r, s] = c.split(' of ');
  return (LONG[r] ?? r) + SUIT[s];
};

describe('model parity with the Python originals (2,000 random states)', () => {
  const rows = (fixtures as Fixture[]).map((f) => ({
    f,
    x: features(f.hand.map(short), short(f.upcard), f.count, f.bet),
  }));

  it('decision tree (Bot5) matches exactly', () => {
    for (const { f, x } of rows) expect(predictTree(models.tree, x).move).toBe(f.dt);
  });
  it('random forest (Bot4) matches exactly', () => {
    for (const { f, x } of rows) expect(predictForest(models.forest, x).move).toBe(f.rf);
  });
  it('neural nets (Bot2, Bot3) match exactly', () => {
    for (const { f, x } of rows) {
      expect(predictDense(models.nnBot2, x).move).toBe(f.nn_bot2);
      expect(predictDense(models.nnPlayer, x).move).toBe(f.nn_player);
    }
  });
});

describe('basic strategy (Bot1)', () => {
  it("uses Bertan's table for 2-card hands", () => {
    expect(tableMove(['8S', '8H'], 'TC')).toBe('SP');
    expect(tableMove(['AS', '7H'], '3C')).toBe('D');
    expect(tableMove(['7H', 'AS'], '3C')).toBe('D'); // order-insensitive
    expect(tableMove(['TS', '6H'], 'TC')).toBe('SU');
    expect(tableMove(['5S', '6H', '2C'], 'TC')).toBeNull();
  });
  it('falls back to the chart when the move is not allowed', () => {
    expect(basicStrategy(['TS', '6H'], 'TC', ['hit', 'stand'])).toBe('hit');
    expect(basicStrategy(['AS', '7H'], '3C', ['hit', 'stand'])).toBe('stand');
    expect(chartMove(['5S', '6H', '2C'], '4C')).toBe('S'); // hard 13 vs 4
    expect(chartMove(['AS', '2H', '4C'], '9C')).toBe('H'); // soft 17
  });
});

describe('betting', () => {
  it('ports the original Hi-Lo bet ladder', () => {
    expect(originalBettingStrategy(5000, 0)).toBe(10);
    expect(originalBettingStrategy(5000, 3)).toBe(50);
    expect(originalBettingStrategy(5000, 6)).toBe(500);
    expect(originalBettingStrategy(150, 5)).toBe(150);
  });
  it('fits table limits', () => {
    expect(hiLoBet(5000, 9, DAILY_CONFIG)).toBe(500);
    expect(hiLoBet(155, 5, DAILY_CONFIG)).toBe(150);
    expect(hiLoBet(1000, -3, DAILY_CONFIG)).toBe(10);
  });
});

describe('Q-table (Bot6)', () => {
  it('stands on 20 and hits on 8', () => {
    expect(predictQ(models.q, 20, 10, 0).move).toBe('S');
    expect(predictQ(models.q, 8, 10, 0).move).toBe('H');
  });
});

describe('daily table', () => {
  it('seats the headliners every day and rotates the rest', () => {
    for (const day of ['2026-11-17', '2026-11-18', '2026-11-19']) {
      const lineup = dailyLineup(day);
      expect(lineup).toContain('bot1');
      expect(lineup).toContain('bot4');
      expect(new Set(lineup).size).toBe(4);
    }
    expect(dailySeats('d', 'Me')[HUMAN_SEAT].kind).toBe('human');
  });

  it('bots act until the human is needed', () => {
    const s0 = createTable('2026-11-17', dailySeats('2026-11-17', 'Me'));
    const { state, events } = runBots(s0, models);
    expect(waitingFor(state)).toEqual({ for: 'bet', seat: HUMAN_SEAT });
    expect(events.filter((e) => e.t === 'bet')).toHaveLength(4);
  });

  it('a bots-only table plays all 20 hands deterministically', () => {
    const run = () => simulateToEnd(createTable('2026-11-17', dailySeats('2026-11-17', null)), models);
    const a = run();
    expect(a.phase).toBe('finished');
    expect(a.round).toBe(20);
    expect(JSON.stringify(a)).toBe(JSON.stringify(run()));
    for (const seat of a.seats.filter((x) => x.kind === 'bot')) {
      expect(BOTS[seat.botId as keyof typeof BOTS]).toBeDefined();
    }
  });

  it('bots only ever choose legal moves over many rounds', () => {
    let s = createTable('legal', dailySeats('legal', null), { ...DAILY_CONFIG, maxRounds: 300 });
    s = simulateToEnd(s, models); // apply() throws on any illegal move
    expect(s.phase).toBe('finished');
    expect(legalActions(s)).toEqual([]);
  });
});
