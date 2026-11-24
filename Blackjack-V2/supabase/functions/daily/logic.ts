// Server-authoritative Daily Table. Pure logic behind a small Store interface
// so it runs the same in the Edge Function (Deno + Postgres) and in tests.
import {
  type GameEvent,
  type PublicTable,
  type TableState,
  DAILY_CONFIG,
  RuleError,
  createTable,
  dayKey,
  publicView,
  shareGrid,
} from '@bj/engine';
import {
  type ModelBundle,
  type Waiting,
  HUMAN_SEAT,
  dailyLineup,
  dailySeats,
  humanAct,
  runBots,
  simulateToEnd,
  waitingFor,
} from '@bj/bots';

export interface TableRow {
  day: string;
  seed_secret: string;
  lineup: string[];
}

export interface RunRow {
  id: string;
  user_id: string;
  day: string;
  state: TableState;
  version: number;
  status: 'playing' | 'finished';
  final_bankroll?: number | null;
  profit?: number | null;
  hand_results?: string | null;
  bots_beaten?: number | null;
  finished_at?: string | null;
}

export interface Store {
  getTable(day: string): Promise<TableRow | null>;
  /** Insert table + official bot results; ignore if the day already exists. */
  createTable(row: TableRow, botResults: { bot_id: string; final_bankroll: number }[]): Promise<void>;
  getRun(userId: string, day: string): Promise<RunRow | null>;
  /** Insert; ignore if (user_id, day) already exists. */
  insertRun(row: Omit<RunRow, 'id'>): Promise<void>;
  /** Optimistic update: only applies if `version` still matches. */
  updateRun(id: string, version: number, patch: Partial<RunRow>): Promise<boolean>;
  rank(day: string, bankroll: number, finishedAt: string): Promise<{ rank: number; players: number }>;
}

export interface DailyResponse {
  day: string;
  view: PublicTable;
  events: GameEvent[];
  waiting: Waiting;
  status: 'playing' | 'finished';
  rank?: { rank: number; players: number };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type ClientAction =
  | { type: 'bet'; amount: number }
  | { type: 'insurance'; take: boolean }
  | { type: 'hit' | 'stand' | 'double' | 'split' | 'surrender' }
  | { type: 'nextRound' };

const ACTIONS = new Set(['bet', 'insurance', 'hit', 'stand', 'double', 'split', 'surrender', 'nextRound']);

const shoeSeed = (t: TableRow) => `${t.day}:${t.seed_secret}`;

async function ensureTable(store: Store, day: string, models: ModelBundle, secret: () => string): Promise<TableRow> {
  const existing = await store.getTable(day);
  if (existing) return existing;
  const row: TableRow = { day, seed_secret: secret(), lineup: dailyLineup(day) };
  // Official bot scores: same shoe, human seat left empty.
  const sim = simulateToEnd(createTable(shoeSeed(row), dailySeats(day, null), DAILY_CONFIG), models);
  const botResults = sim.seats
    .filter((s) => s.kind === 'bot')
    .map((s) => ({ bot_id: s.botId!, final_bankroll: s.bankroll }));
  await store.createTable(row, botResults);
  // Re-read: another request may have won the race with a different secret.
  return (await store.getTable(day))!;
}

function respond(run: RunRow, events: GameEvent[], rank?: DailyResponse['rank']): DailyResponse {
  return {
    day: run.day,
    view: publicView(run.state),
    events,
    waiting: waitingFor(run.state),
    status: run.status,
    rank,
  };
}

function finishPatch(state: TableState, now: Date): Partial<RunRow> {
  const me = state.seats[HUMAN_SEAT];
  const bots = state.seats.filter((s) => s.kind === 'bot');
  return {
    status: 'finished',
    final_bankroll: me.bankroll,
    profit: me.bankroll - state.config.startingBankroll,
    hand_results: shareGrid(state.history, HUMAN_SEAT),
    bots_beaten: bots.filter((b) => b.bankroll < me.bankroll).length,
    finished_at: now.toISOString(),
  };
}

/** Start or resume today's run. Idempotent: a refresh never rerolls. */
export async function startRun(
  store: Store,
  userId: string,
  now: Date,
  models: ModelBundle,
  secret: () => string,
): Promise<DailyResponse> {
  const day = dayKey(now);
  const table = await ensureTable(store, day, models, secret);
  let run = await store.getRun(userId, day);
  if (!run) {
    const initial = runBots(createTable(shoeSeed(table), dailySeats(day, 'You'), DAILY_CONFIG), models);
    await store.insertRun({ user_id: userId, day, state: initial.state, version: 0, status: 'playing' });
    run = (await store.getRun(userId, day))!;
    const fresh = run.version === 0 && run.state.round === 1 && run.state.history.length === 0;
    return respond(run, fresh ? initial.events : []);
  }
  if (run.status === 'finished') {
    return respond(run, [], await store.rank(day, run.final_bankroll!, run.finished_at!));
  }
  return respond(run, []);
}

/** Apply one human action (and let the bots catch up). */
export async function actRun(
  store: Store,
  userId: string,
  day: string,
  action: ClientAction,
  now: Date,
  models: ModelBundle,
): Promise<DailyResponse> {
  if (!action || !ACTIONS.has(action.type)) throw new HttpError(400, 'Unknown action');
  // Allow finishing yesterday's run shortly after midnight.
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));
  if (day !== today && day !== yesterday) throw new HttpError(410, 'That table has closed');

  const run = await store.getRun(userId, day);
  if (!run) throw new HttpError(404, 'No run for this day. Start one first.');
  if (run.status === 'finished') throw new HttpError(409, 'This run is already finished');

  const full =
    action.type === 'nextRound'
      ? { type: 'nextRound' as const }
      : ({ ...action, seat: HUMAN_SEAT } as Parameters<typeof humanAct>[1]);
  if (action.type === 'bet' && typeof (action as { amount: unknown }).amount !== 'number') {
    throw new HttpError(400, 'Bet amount must be a number');
  }

  let result;
  try {
    result = humanAct(run.state, full, models);
  } catch (err) {
    if (err instanceof RuleError) throw new HttpError(400, err.message);
    throw err;
  }

  const patch: Partial<RunRow> = { state: result.state, version: run.version + 1 };
  let rank: DailyResponse['rank'];
  if (result.state.phase === 'finished') Object.assign(patch, finishPatch(result.state, now));

  const ok = await store.updateRun(run.id, run.version, patch);
  if (!ok) throw new HttpError(409, 'Another device moved first. Reload to continue.');

  const updated: RunRow = { ...run, ...patch } as RunRow;
  if (updated.status === 'finished') rank = await store.rank(day, updated.final_bankroll!, updated.finished_at!);
  return respond(updated, result.events, rank);
}
