import {
  type Action,
  type GameEvent,
  type PublicTable,
  type SeatInit,
  type TableConfig,
  type TableState,
  apply,
  createTable,
  publicView,
} from '@bj/engine';
import { type ModelBundle, type Waiting, humanAct, runBots, waitingFor } from '@bj/bots';
import { load, remove, save } from '../lib/storage';

export type Mode = 'daily' | 'practice' | 'lounge';

/** A human action; the driver fills in the seat. */
export type HumanAction =
  | { type: 'bet'; amount: number }
  | { type: 'insurance'; take: boolean }
  | { type: 'hit' | 'stand' | 'double' | 'split' | 'surrender' }
  | { type: 'nextRound' };

export interface StepResult {
  view: PublicTable;
  events: GameEvent[];
  waiting: Waiting;
}

export interface TableDriver {
  mode: Mode;
  ranked: boolean;
  humanSeat: number | null;
  start(): Promise<StepResult>;
  act(action: HumanAction): Promise<StepResult>;
}

let modelPromise: Promise<ModelBundle> | null = null;
/** The model weights are ~1 MB gzipped, so load them lazily. */
export function loadModels(): Promise<ModelBundle> {
  modelPromise ??= import('@bj/bots/bundle').then((m) => m.models);
  return modelPromise;
}

export interface LocalOptions {
  mode: Mode;
  seed: string;
  seats: SeatInit[];
  config: TableConfig;
  exposeCount?: boolean;
  /** Persist the action log so a reload replays to the same spot. */
  persistKey?: string;
  /** Lounge: top bots back up when they bust and keep history small. */
  endless?: boolean;
  onRound?: (state: TableState) => void;
}

/** Runs the whole table in the browser (practice, lounge, offline daily). */
export class LocalDriver implements TableDriver {
  mode: Mode;
  ranked = false;
  humanSeat: number | null;
  private state!: TableState;
  private models!: ModelBundle;
  private log: Action[] = [];

  constructor(private opts: LocalOptions) {
    this.mode = opts.mode;
    const idx = opts.seats.findIndex((s) => s.kind === 'human');
    this.humanSeat = idx >= 0 ? idx : null;
  }

  private result(events: GameEvent[]): StepResult {
    return {
      view: publicView(this.state, { exposeCount: this.opts.exposeCount }),
      events,
      waiting: waitingFor(this.state),
    };
  }

  private seatOf(a: HumanAction): Action {
    if (a.type === 'nextRound') return a;
    if (this.humanSeat == null) throw new Error('No human seat at this table');
    return { ...a, seat: this.humanSeat } as Action;
  }

  async start(): Promise<StepResult> {
    this.models = await loadModels();
    this.state = createTable(this.opts.seed, this.opts.seats, this.opts.config);
    let r = runBots(this.state, this.models);
    this.state = r.state;

    // Replay a saved action log (deterministic, so we land in the same spot).
    const saved = this.opts.persistKey ? load<Action[]>(this.opts.persistKey, []) : [];
    if (saved.length) {
      try {
        for (const a of saved) {
          r = this.step(a);
          this.log.push(a);
        }
        return this.result([]);
      } catch {
        if (this.opts.persistKey) remove(this.opts.persistKey);
        this.state = runBots(createTable(this.opts.seed, this.opts.seats, this.opts.config), this.models).state;
        this.log = [];
      }
    }
    return this.result(r.events);
  }

  private step(action: Action) {
    let r;
    if (action.type === 'nextRound') {
      if (this.opts.endless) this.rebuy();
      const first = apply(this.state, action);
      const rest = runBots(first.state, this.models);
      r = { state: rest.state, events: [...first.events, ...rest.events] };
    } else {
      r = humanAct(this.state, action, this.models);
    }
    this.state = r.state;
    if (this.state.phase === 'settled' || this.state.phase === 'finished') this.opts.onRound?.(this.state);
    if (this.opts.endless && this.state.history.length > 60) this.state.history = this.state.history.slice(-30);
    return r;
  }

  private rebuy() {
    for (const seat of this.state.seats) {
      if (seat.kind === 'bot' && seat.bankroll < this.state.config.minBet) {
        seat.bankroll += this.state.config.startingBankroll;
        seat.sittingOut = false;
      }
    }
  }

  async act(a: HumanAction): Promise<StepResult> {
    const action = this.seatOf(a);
    const r = this.step(action);
    if (this.opts.persistKey) {
      this.log.push(action);
      save(this.opts.persistKey, this.log);
    }
    return this.result(r.events);
  }

  /** Full state (only for local, unranked tables): used by the results review. */
  get fullState(): TableState {
    return this.state;
  }
}
