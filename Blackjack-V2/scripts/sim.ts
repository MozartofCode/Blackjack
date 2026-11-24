// Headless simulation: all six bots at one table for N rounds.
// Usage: npm run sim -- --hands 100000
import { DAILY_CONFIG, apply, createTable } from '@bj/engine';
import { BOTS, type BotId, runBots } from '@bj/bots';
import { models } from '@bj/bots/bundle';

const arg = process.argv.indexOf('--hands');
const hands = arg > -1 ? Number(process.argv[arg + 1]) : 20_000;
const ids = Object.keys(BOTS) as BotId[];

const BANK = 1e9; // effectively unlimited so nobody busts out
let s = createTable(
  `sim-${hands}`,
  ids.map((id) => ({ kind: 'bot' as const, name: BOTS[id].handle, botId: id, bankroll: BANK })),
  { ...DAILY_CONFIG, maxRounds: hands, startingBankroll: BANK },
);

// Play one round at a time and drain history so state clones stay small.
const all: typeof s.history = [];
const t0 = Date.now();
while (s.phase !== 'finished') {
  s = runBots(s, models, false).state; // bots play until the round settles
  all.push(...s.history);
  s.history = [];
  s.decisions = [];
  if (s.phase === 'settled') s = apply(s, { type: 'nextRound' }).state;
}

console.log(`\n${hands.toLocaleString()} rounds in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
console.log('bot      wagered        net      ROI   win%');
for (const seat of s.seats) {
  const rows = all.filter((r) => r.seat === seat.id);
  const wagered = rows.reduce((a, r) => a + r.bet, 0);
  const net = rows.reduce((a, r) => a + r.net, 0);
  const wins = rows.filter((r) => r.net > 0).length;
  console.log(
    `${seat.name.padEnd(8)} ${wagered.toLocaleString().padStart(10)} ${net.toLocaleString().padStart(10)}` +
      ` ${((net / wagered) * 100).toFixed(2).padStart(7)}% ${((wins / rows.length) * 100).toFixed(1).padStart(5)}%`,
  );
}
