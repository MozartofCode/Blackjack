import { describe, expect, it } from 'vitest';
import { legalActions } from '@bj/engine';
import { HUMAN_SEAT } from '@bj/bots';
import { models } from '@bj/bots/bundle';
import { type ClientAction, type DailyResponse, type RunRow, type Store, type TableRow, actRun, startRun } from './logic.ts';

/** In-memory stand-in for Postgres with the same conflict/version semantics. */
function memoryStore() {
  const tables = new Map<string, TableRow>();
  const botResults = new Map<string, { bot_id: string; final_bankroll: number }[]>();
  const runs = new Map<string, RunRow>();
  let ids = 0;
  const store: Store = {
    async getTable(day) {
      return structuredClone(tables.get(day) ?? null);
    },
    async createTable(row, bots) {
      if (!tables.has(row.day)) {
        tables.set(row.day, structuredClone(row));
        botResults.set(row.day, bots);
      }
    },
    async getRun(userId, day) {
      return structuredClone(runs.get(`${userId}|${day}`) ?? null);
    },
    async insertRun(row) {
      const key = `${row.user_id}|${row.day}`;
      if (!runs.has(key)) runs.set(key, { ...structuredClone(row), id: String(++ids) });
    },
    async updateRun(id, version, patch) {
      for (const [k, r] of runs) {
        if (r.id === id) {
          if (r.version !== version) return false;
          runs.set(k, { ...r, ...structuredClone(patch) });
          return true;
        }
      }
      return false;
    },
    async rank(day, bankroll, finishedAt) {
      const done = [...runs.values()].filter((r) => r.day === day && r.status === 'finished');
      const better = done.filter(
        (r) => r.final_bankroll! > bankroll || (r.final_bankroll === bankroll && r.finished_at! < finishedAt),
      );
      return { rank: better.length + 1, players: done.length };
    },
  };
  return { store, tables, runs, botResults };
}

const NOW = new Date('2026-11-17T15:00:00Z');
let n = 0;
const secret = () => `secret-${++n}`;

/** Play a run to the end with a simple policy. */
async function playOut(store: Store, user: string, first: DailyResponse) {
  let res = first;
  for (let guard = 0; guard < 500 && res.status !== 'finished'; guard++) {
    const w = res.waiting;
    let action: ClientAction;
    if (w.for === 'bet') action = { type: 'bet', amount: 50 };
    else if (w.for === 'insurance') action = { type: 'insurance', take: false };
    else if (w.for === 'nextRound') action = { type: 'nextRound' };
    else action = { type: legalActions(res.view).includes('stand') ? 'stand' : 'hit' };
    res = await actRun(store, user, res.day, action, NOW, models);
  }
  return res;
}

describe('daily edge function logic', () => {
  it('creates the day once, with official bot scores', async () => {
    const { store, tables, botResults } = memoryStore();
    await startRun(store, 'alice', NOW, models, secret);
    await startRun(store, 'bob', NOW, models, secret);
    expect(tables.size).toBe(1);
    expect(botResults.get('2026-11-17')).toHaveLength(4);
  });

  it('starts at the human bet and never leaks the shoe or hole card', async () => {
    const { store } = memoryStore();
    const res = await startRun(store, 'alice', NOW, models, secret);
    expect(res.waiting).toEqual({ for: 'bet', seat: HUMAN_SEAT });
    const json = JSON.stringify(res);
    expect(json).not.toContain('seed');
    expect(json).not.toContain('secret');
    expect((res.view.shoe as Record<string, unknown>).cards).toBeUndefined();

    const dealt = await actRun(store, 'alice', res.day, { type: 'bet', amount: 100 }, NOW, models);
    if (!dealt.view.dealer.holeRevealed) expect(dealt.view.dealer.cards[1]).toBeNull();
    expect(dealt.events.some((e) => e.t === 'deal' && e.to === 'dealer' && e.card === null)).toBe(true);
  });

  it('a refresh resumes instead of rerolling', async () => {
    const { store } = memoryStore();
    const a = await startRun(store, 'alice', NOW, models, secret);
    const b = await actRun(store, 'alice', a.day, { type: 'bet', amount: 100 }, NOW, models);
    const again = await startRun(store, 'alice', NOW, models, secret);
    expect(again.view.seats[HUMAN_SEAT].hands).toEqual(b.view.seats[HUMAN_SEAT].hands);
    expect(again.events).toEqual([]);
  });

  it('rejects illegal and out-of-phase actions', async () => {
    const { store } = memoryStore();
    const a = await startRun(store, 'alice', NOW, models, secret);
    await expect(actRun(store, 'alice', a.day, { type: 'hit' }, NOW, models)).rejects.toMatchObject({ status: 400 });
    await expect(actRun(store, 'alice', a.day, { type: 'bet', amount: 7 }, NOW, models)).rejects.toMatchObject({ status: 400 });
    await expect(actRun(store, 'alice', a.day, { type: 'bogus' } as never, NOW, models)).rejects.toMatchObject({ status: 400 });
    await expect(actRun(store, 'alice', '2026-11-10', { type: 'nextRound' }, NOW, models)).rejects.toMatchObject({ status: 410 });
    await expect(actRun(store, 'nobody', a.day, { type: 'nextRound' }, NOW, models)).rejects.toMatchObject({ status: 404 });
  });

  it('finishes after 20 hands, ranks players, and locks the run', async () => {
    const { store } = memoryStore();
    const alice = await playOut(store, 'alice', await startRun(store, 'alice', NOW, models, secret));
    expect(alice.status).toBe('finished');
    expect(alice.view.round).toBe(20);
    expect(alice.rank).toEqual({ rank: 1, players: 1 });

    const bob = await playOut(store, 'bob', await startRun(store, 'bob', NOW, models, secret));
    // Same shoe + same actions → identical result.
    expect(bob.view.seats[HUMAN_SEAT].bankroll).toBe(alice.view.seats[HUMAN_SEAT].bankroll);
    expect(bob.rank?.players).toBe(2);

    await expect(actRun(store, 'alice', alice.day, { type: 'nextRound' }, NOW, models)).rejects.toMatchObject({ status: 409 });
    const resumed = await startRun(store, 'alice', NOW, models, secret);
    expect(resumed.status).toBe('finished');
    expect(resumed.rank).toBeDefined();
  });

  it('detects a concurrent move from another device', async () => {
    const { store, runs } = memoryStore();
    const a = await startRun(store, 'alice', NOW, models, secret);
    // Simulate another device having advanced the version.
    const key = 'alice|2026-11-17';
    runs.set(key, { ...runs.get(key)!, version: 5 });
    const realGet = store.getRun;
    store.getRun = async (u, d) => ({ ...(await realGet(u, d))!, version: 4 });
    await expect(actRun(store, 'alice', a.day, { type: 'bet', amount: 50 }, NOW, models)).rejects.toMatchObject({ status: 409 });
  });
});
