import type { RoundSummary } from './types.ts';

/** Day #1 of Blackjack Daily (UTC). */
export const LAUNCH_DAY = '2026-11-17';
const DAY_MS = 86_400_000;

/** UTC calendar day key, e.g. "2026-11-17". */
export function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Wordle-style puzzle number: LAUNCH_DAY is #1. */
export function dayNumber(day: string = dayKey()): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${LAUNCH_DAY}T00:00:00Z`)) / DAY_MS) + 1;
}

export function msUntilNextDay(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}

/** One emoji per round for the share card. */
export function roundEmoji(r: RoundSummary): string {
  if (r.results.includes('blackjack')) return '🟨';
  if (r.split) return '✂️';
  if (r.doubled) return r.net > 0 ? '💥' : '2️⃣';
  if (r.net > 0) return '🟩';
  if (r.net < 0) return '🟥';
  return '⬜';
}

export function shareGrid(history: RoundSummary[], seat: number): string {
  return history.filter((r) => r.seat === seat).map(roundEmoji).join('');
}

export function formatMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export interface ShareInput {
  day: string;
  bankroll: number;
  start: number;
  grid: string;
  rank?: number;
  players?: number;
  botsBeaten: number;
  botsTotal: number;
  url: string;
}

export function shareText(i: ShareInput): string {
  const profit = i.bankroll - i.start;
  const pct = Math.round((profit / i.start) * 100);
  const lines = [
    `Blackjack Daily #${dayNumber(i.day)} 💰 ${formatMoney(i.bankroll)} (${pct >= 0 ? '+' : ''}${pct}%)`,
    [i.rank ? `🏆 #${i.rank}${i.players ? ` of ${i.players.toLocaleString('en-US')}` : ''}` : null,
      `beat ${i.botsBeaten}/${i.botsTotal} bots 🤖`].filter(Boolean).join(' · '),
    i.grid,
    i.url,
  ];
  return lines.join('\n');
}
