import { create } from 'zustand';
import type { PublicTable } from '@bj/engine';
import type { Waiting } from '@bj/bots';
import type { HumanAction, TableDriver } from './driver';
import { type Speed, applyToDisplay, clearForNextRound, eventDelay } from './playback';
import { buzz, sfx } from '../lib/sound';
import { load, save } from '../lib/storage';

interface Note {
  text: string;
  key: number;
}

interface GameStore {
  driver: TableDriver | null;
  display: PublicTable | null;
  waiting: Waiting | null;
  busy: boolean;
  loading: boolean;
  notes: Record<number, Note>;
  banner: string | null;
  speed: Speed;
  lastBet: number;
  error: string | null;
  begin: (driver: TableDriver) => Promise<void>;
  act: (action: HumanAction) => Promise<void>;
  setSpeed: (s: Speed) => void;
  leave: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let session = 0;
let noteKey = 0;

export const useGame = create<GameStore>((set, get) => {
  async function playback(events: import('@bj/engine').GameEvent[], final: PublicTable, my: number) {
    const human = get().driver?.humanSeat ?? null;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (my !== session) return;
      const display = get().display;
      if (!display) break;
      const next = applyToDisplay(display, e);
      const patch: Partial<GameStore> = { display: next };

      switch (e.t) {
        case 'note':
          patch.notes = { ...get().notes, [e.seat]: { text: e.text, key: ++noteKey } };
          break;
        case 'deal':
          sfx.card();
          break;
        case 'reveal':
          sfx.flip();
          break;
        case 'bet':
          sfx.chip();
          break;
        case 'shuffle':
          patch.banner = 'Shuffling a fresh shoe';
          break;
        case 'peek':
          patch.banner = e.dealerBlackjack ? 'Dealer has blackjack' : 'Dealer checks… no blackjack';
          break;
        case 'result':
          if (e.seat === human) {
            if (e.result === 'blackjack') {
              sfx.blackjack();
              buzz([20, 40, 20]);
            } else if (e.net > 0) sfx.win();
            else if (e.net < 0) {
              sfx.lose();
              buzz(30);
            }
          }
          break;
      }
      set(patch);
      const speed = get().speed;
      // A bot's betting note is immediately followed by its chip: keep it snappy.
      const base = e.t === 'note' && events[i + 1]?.t === 'bet' ? 90 : eventDelay(e, human);
      const delay = speed === 0 ? 0 : base / speed;
      if (delay) await sleep(delay);
      if (e.t === 'shuffle' || e.t === 'peek') set({ banner: null });
    }
    if (my === session) set({ display: final });
  }

  return {
    driver: null,
    display: null,
    waiting: null,
    busy: false,
    loading: false,
    notes: {},
    banner: null,
    speed: load<Speed>('speed', 1),
    lastBet: load<number>('lastBet', 50),
    error: null,

    async begin(driver) {
      const my = ++session;
      set({ driver, display: null, waiting: null, notes: {}, banner: null, busy: true, loading: true, error: null });
      try {
        const res = await driver.start();
        if (my !== session) return;
        // Start from an empty table so the opening bets/deal animate in.
        // A fresh table starts in betting with only bot bets placed; undo
        // those on screen so the chips animate out.
        const fresh = res.events.length > 0 && res.view.phase === 'betting';
        if (fresh) {
          const empty = clearForNextRound(res.view);
          empty.seats.forEach((seat, i) => (seat.bankroll = res.view.seats[i].bankroll + res.view.seats[i].bet));
          set({ display: empty, loading: false });
          await playback(res.events, res.view, my);
        } else {
          set({ display: res.view, loading: false });
        }
        if (my === session) set({ waiting: res.waiting, busy: false });
      } catch (err) {
        if (my === session) set({ error: (err as Error).message, busy: false, loading: false });
      }
    },

    async act(action) {
      const { driver, busy, display } = get();
      if (!driver || busy || !display) return;
      const my = session;
      set({ busy: true, error: null, waiting: null });
      if (action.type === 'bet') {
        set({ lastBet: action.amount });
        save('lastBet', action.amount);
      }
      if (action.type === 'nextRound') set({ display: clearForNextRound(display), notes: {} });
      try {
        const res = await driver.act(action);
        if (my !== session) return;
        await playback(res.events, res.view, my);
        if (my === session) set({ waiting: res.waiting, busy: false });
      } catch (err) {
        if (my === session) set({ error: (err as Error).message, busy: false, display });
      }
    },

    setSpeed(speed) {
      save('speed', speed);
      set({ speed });
    },

    leave() {
      session++;
      set({ driver: null, display: null, waiting: null, busy: false, notes: {}, banner: null, error: null });
    },
  };
});
