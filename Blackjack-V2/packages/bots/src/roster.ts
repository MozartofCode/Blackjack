import { type SeatInit, pick } from '@bj/engine';

export type BotId = 'bot1' | 'bot2' | 'bot3' | 'bot4' | 'bot5' | 'bot6';
export type BotKind = 'basic' | 'nn' | 'tree' | 'forest' | 'q';

export interface BotProfile {
  id: BotId;
  name: string;
  /** One-word handle shown on chips and seats. */
  handle: string;
  kind: BotKind;
  model: string;
  trainedOn: string;
  blurb: string;
  /** From Backend/Bots/Bots_Comparison.csv (100 runs of up to 300 hands). */
  sim: { avgProfitPct: number; timesOver30: number };
  /** Accent hue for the avatar. */
  hue: number;
}

export const BOTS: Record<BotId, BotProfile> = {
  bot1: {
    id: 'bot1', name: 'Bot 1 · The Counter', handle: 'Counter', kind: 'basic',
    model: 'Basic strategy + Hi-Lo', trainedOn: "Bertan's basic strategy table",
    blurb: 'Plays textbook basic strategy and raises its bet when the Hi-Lo true count climbs.',
    sim: { avgProfitPct: -22.4, timesOver30: 37 }, hue: 42,
  },
  bot2: {
    id: 'bot2', name: 'Bot 2 · Echo', handle: 'Echo', kind: 'nn',
    model: 'Neural network (128-64-32)', trainedOn: "10,000 of Bot 1's decisions",
    blurb: 'A neural net that learned by watching The Counter play.',
    sim: { avgProfitPct: -70.3, timesOver30: 17 }, hue: 200,
  },
  bot3: {
    id: 'bot3', name: 'Bot 3 · Mirror', handle: 'Mirror', kind: 'nn',
    model: 'Neural network (128-64-32)', trainedOn: "Bertan's own hands",
    blurb: 'A neural net trained on how Bertan actually plays, gut calls included.',
    sim: { avgProfitPct: -68.6, timesOver30: 20 }, hue: 280,
  },
  bot4: {
    id: 'bot4', name: 'Bot 4 · Forest', handle: 'Forest', kind: 'forest',
    model: 'Random forest (40 trees)', trainedOn: "10,000 of Bot 1's decisions",
    blurb: 'The best of the bunch in simulation: 40 decision trees vote on every first move.',
    sim: { avgProfitPct: -5.1, timesOver30: 51 }, hue: 140,
  },
  bot5: {
    id: 'bot5', name: 'Bot 5 · Sapling', handle: 'Sapling', kind: 'tree',
    model: 'Decision tree', trainedOn: "Bertan's own hands",
    blurb: "A single decision tree grown from Bertan's play. Small, quick, and occasionally bold.",
    sim: { avgProfitPct: -41.7, timesOver30: 29 }, hue: 95,
  },
  bot6: {
    id: 'bot6', name: 'Bot 6 · Q', handle: 'Q', kind: 'q',
    model: 'Q-learning (RL)', trainedOn: '100,000 self-play episodes',
    blurb: 'Taught itself by trial and error. Only knows hit and stand.',
    sim: { avgProfitPct: -49.7, timesOver30: 17 }, hue: 0,
  },
};

export const HEADLINERS: BotId[] = ['bot4', 'bot1'];
export const ROTATION: BotId[] = ['bot5', 'bot3', 'bot6', 'bot2'];

/** Seat index of the human at the 5-seat Daily Table (center). */
export const HUMAN_SEAT = 2;

/** Today's 4 bots: both headliners plus 2 rotating, picked by the seed. */
export function dailyLineup(seed: string): BotId[] {
  const [a, b] = pick(ROTATION, 2, `${seed}#lineup`);
  // Seats: rotating · Counter · YOU · Forest · rotating
  return [a, 'bot1', 'bot4', b];
}

export function dailySeats(seed: string, humanName: string | null): SeatInit[] {
  const [s0, s1, s3, s4] = dailyLineup(seed);
  const bot = (id: BotId): SeatInit => ({ kind: 'bot', name: BOTS[id].handle, botId: id });
  return [
    bot(s0),
    bot(s1),
    humanName === null ? { kind: 'empty', name: '' } : { kind: 'human', name: humanName },
    bot(s3),
    bot(s4),
  ];
}
