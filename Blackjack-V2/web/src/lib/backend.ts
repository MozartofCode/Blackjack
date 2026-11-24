// Backend switch: Supabase when configured, otherwise a fully local daily table.
import { DAILY_CONFIG } from '@bj/engine';
import { dailySeats } from '@bj/bots';
import { LocalDriver, type TableDriver } from '../game/driver';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isOnline = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export async function createDailyDriver(day: string): Promise<TableDriver> {
  if (isOnline()) {
    const { RemoteDailyDriver } = await import('./remote');
    return new RemoteDailyDriver(day);
  }
  // Offline: same lineup, shoe seeded by the date. Unranked; a reload replays
  // the saved action log so refreshing can't reroll a hand.
  return new LocalDriver({
    mode: 'daily',
    seed: `offline-daily:${day}`,
    seats: dailySeats(day, 'You'),
    config: DAILY_CONFIG,
    persistKey: `run:${day}`,
  });
}
