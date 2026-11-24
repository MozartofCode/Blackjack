import { dayKey } from '@bj/engine';
import { load, save } from './storage';

export interface DailyRecord {
  day: string;
  bankroll: number;
  profit: number;
  grid: string;
  botsBeaten: number;
  botsTotal: number;
  rank?: number;
  players?: number;
}

export function dailyRecords(): Record<string, DailyRecord> {
  return load<Record<string, DailyRecord>>('daily', {});
}

export function recordDaily(r: DailyRecord) {
  const all = dailyRecords();
  all[r.day] = { ...all[r.day], ...r };
  save('daily', all);
}

const prevDay = (d: string) => dayKey(new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000));

export interface Stats {
  played: number;
  profitablePct: number;
  currentStreak: number;
  maxStreak: number;
  best: DailyRecord | null;
  totalProfit: number;
  /** Profit buckets for the histogram. */
  buckets: { label: string; count: number }[];
}

export function computeStats(records = dailyRecords(), today = dayKey()): Stats {
  const days = Object.keys(records).sort();
  const list = days.map((d) => records[d]);
  const played = list.length;
  const profitable = list.filter((r) => r.profit > 0).length;

  // Streak = consecutive days played (Wordle style), ending today or yesterday.
  let maxStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev && prevDay(d) === prev ? run + 1 : 1;
    maxStreak = Math.max(maxStreak, run);
    prev = d;
  }
  let currentStreak = 0;
  let cursor = records[today] ? today : prevDay(today);
  while (records[cursor]) {
    currentStreak++;
    cursor = prevDay(cursor);
  }

  const edges = [-Infinity, -500, -100, 0, 100, 500, Infinity];
  const labels = ['< −500', '−500', '−100', '+0', '+100', '+500'];
  const buckets = labels.map((label, i) => ({
    label,
    count: list.filter((r) => r.profit >= edges[i] && r.profit < edges[i + 1]).length,
  }));

  return {
    played,
    profitablePct: played ? Math.round((profitable / played) * 100) : 0,
    currentStreak,
    maxStreak,
    best: list.reduce<DailyRecord | null>((b, r) => (!b || r.bankroll > b.bankroll ? r : b), null),
    totalProfit: list.reduce((a, r) => a + r.profit, 0),
    buckets,
  };
}
