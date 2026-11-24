import type { TableConfig } from '@bj/engine';

/**
 * Verbatim port of `betting_strategy(money, count)` shared by Bot1-Bot6:
 * bet grows with the Hi-Lo true count, capped by what the bot can afford.
 */
export function originalBettingStrategy(money: number, count: number): number {
  if (money < 10) return money;
  if (count <= 1) return 10;
  if (money < 20) return money;
  if (count === 2) return 20;
  if (money < 50) return money;
  if (count === 3) return 50;
  if (money < 100) return money;
  if (count === 4) return 100;
  if (money < 200) return money;
  if (count === 5) return 200;
  if (money < 500) return money;
  if (count === 6) return 500;
  if (money < 1000) return money;
  return 1000;
}

/** The original strategy, fitted to this table's limits and $10 bet step. */
export function hiLoBet(bankroll: number, trueCount: number, cfg: TableConfig): number {
  const raw = originalBettingStrategy(bankroll, trueCount);
  const cap = Math.min(cfg.maxBet, bankroll);
  const stepped = Math.floor(Math.min(raw, cap) / cfg.betStep) * cfg.betStep;
  return Math.max(cfg.minBet, stepped);
}
