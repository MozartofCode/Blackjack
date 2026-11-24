import { useEffect, useMemo, useState } from 'react';
import { type PlayAction, type PublicTable, formatMoney, legalActions, maxBetFor } from '@bj/engine';
import { basicStrategy, type Waiting } from '@bj/bots';
import { CHIP_VALUES, ChipFace } from './Chip';
import type { HumanAction } from '../game/driver';
import { sfx } from '../lib/sound';

interface Props {
  view: PublicTable;
  waiting: Waiting | null;
  humanSeat: number;
  busy: boolean;
  lastBet: number;
  coach: boolean;
  onAct: (a: HumanAction) => void;
  onResults?: () => void;
}

const PLAY_BUTTONS: { action: PlayAction; label: string; key: string }[] = [
  { action: 'hit', label: 'Hit', key: 'H' },
  { action: 'stand', label: 'Stand', key: 'S' },
  { action: 'double', label: 'Double', key: 'D' },
  { action: 'split', label: 'Split', key: 'P' },
  { action: 'surrender', label: 'Surrender', key: 'R' },
];

export function ActionBar({ view, waiting, humanSeat, busy, lastBet, coach, onAct, onResults }: Props) {
  const seat = view.seats[humanSeat];
  const max = maxBetFor(view, seat);
  const min = view.config.minBet;
  const myBet = waiting?.for === 'bet' && waiting.seat === humanSeat;
  const myInsurance = waiting?.for === 'insurance' && waiting.seat === humanSeat;
  const myTurn = waiting?.for === 'play' && waiting.seat === humanSeat;
  const legal = myTurn ? legalActions(view) : [];

  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n / view.config.betStep) * view.config.betStep));
  const [pending, setPending] = useState(() => clamp(lastBet));
  useEffect(() => {
    if (myBet) setPending(clamp(lastBet));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myBet, view.round]);

  const hint = useMemo<PlayAction | null>(() => {
    if (!coach || !myTurn || !view.turn) return null;
    const hand = seat.hands[view.turn.hand];
    const up = view.dealer.cards[0];
    return hand && up ? basicStrategy(hand.cards, up, legal) : null;
  }, [coach, myTurn, view, seat, legal]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy || e.metaKey || e.ctrlKey || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toUpperCase();
      if (myTurn) {
        const b = PLAY_BUTTONS.find((x) => x.key === k);
        if (b && legal.includes(b.action)) onAct({ type: b.action });
      } else if (myBet && (k === 'ENTER' || k === ' ')) {
        e.preventDefault();
        onAct({ type: 'bet', amount: pending });
      } else if (myInsurance && (k === 'Y' || k === 'N')) {
        onAct({ type: 'insurance', take: k === 'Y' });
      } else if (waiting?.for === 'nextRound' && (k === 'ENTER' || k === ' ' || k === 'N')) {
        e.preventDefault();
        onAct({ type: 'nextRound' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, myTurn, myBet, myInsurance, waiting, legal, pending, onAct]);

  const wrap = 'safe-bottom border-t border-white/10 bg-ink/85 px-3 pt-3 backdrop-blur-md';

  if (view.phase === 'finished' && !busy) {
    return (
      <div className={wrap}>
        <button className="btn-brass h-14 w-full text-lg" onClick={onResults}>
          See your results
        </button>
      </div>
    );
  }

  if (myBet) {
    return (
      <div className={wrap}>
        <div className="mx-auto flex max-w-xl flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1.5 sm:gap-2">
              {CHIP_VALUES.map((v) => (
                <button
                  key={v}
                  className="rounded-full transition hover:-translate-y-0.5 active:scale-90 disabled:opacity-30"
                  disabled={busy || pending + v > max}
                  onClick={() => {
                    sfx.chip();
                    setPending((p) => clamp(p + v));
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setPending((p) => clamp(p - v));
                  }}
                  aria-label={`Add $${v}`}
                >
                  <ChipFace amount={v} size={46} />
                </button>
              ))}
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold tracking-[0.2em] text-ivory/50 uppercase">Bet</div>
              <div className="money font-display text-3xl font-bold text-brass-light">${pending}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost h-12 px-3 text-sm" disabled={busy} onClick={() => setPending(min)}>
              Min
            </button>
            <button className="btn-ghost h-12 px-3 text-sm" disabled={busy} onClick={() => setPending(clamp(pending / 2))}>
              ½
            </button>
            <button className="btn-ghost h-12 px-3 text-sm" disabled={busy || pending * 2 > max} onClick={() => setPending(clamp(pending * 2))}>
              2×
            </button>
            <button className="btn-ghost h-12 px-3 text-sm" disabled={busy} onClick={() => setPending(max)}>
              Max
            </button>
            <button className="btn-brass h-12 flex-1 text-base" disabled={busy || pending < min} onClick={() => onAct({ type: 'bet', amount: pending })}>
              Deal <span className="kbd">↵</span>
            </button>
          </div>
          <p className="text-center text-[11px] text-ivory/45">
            Tap chips to build your bet · table limits {formatMoney(min)}–{formatMoney(view.config.maxBet)}
          </p>
        </div>
      </div>
    );
  }

  if (myInsurance) {
    return (
      <div className={wrap}>
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          <p className="text-center text-sm">
            Dealer shows an Ace. Take insurance for <b className="text-brass-light">{formatMoney(seat.bet / 2)}</b>? Pays 2:1 if the dealer has blackjack.
          </p>
          <div className="flex gap-2">
            <button className="btn-ghost h-12 flex-1" disabled={busy} onClick={() => onAct({ type: 'insurance', take: false })}>
              No thanks <span className="kbd">N</span>
            </button>
            <button className="btn-brass h-12 flex-1" disabled={busy} onClick={() => onAct({ type: 'insurance', take: true })}>
              Insure <span className="kbd">Y</span>
            </button>
          </div>
          {coach && <p className="text-center text-[11px] text-brass-light">Coach: basic strategy never takes insurance.</p>}
        </div>
      </div>
    );
  }

  if (waiting?.for === 'nextRound' && !busy) {
    return (
      <div className={wrap}>
        <button className="btn-brass mx-auto flex h-14 w-full max-w-xl text-lg" onClick={() => onAct({ type: 'nextRound' })}>
          Next hand <span className="kbd">↵</span>
        </button>
      </div>
    );
  }

  return (
    <div className={wrap}>
      <div className="mx-auto grid max-w-xl grid-cols-5 gap-1.5 sm:gap-2">
        {PLAY_BUTTONS.map((b) => {
          const enabled = myTurn && !busy && legal.includes(b.action);
          const primary = b.action === 'hit' || b.action === 'stand';
          return (
            <button
              key={b.action}
              disabled={!enabled}
              onClick={() => onAct({ type: b.action })}
              className={`${primary ? 'btn-brass' : 'btn-ghost'} h-14 flex-col gap-0 text-[13px] sm:text-sm ${
                hint === b.action ? 'outline-4 outline-offset-2 outline-win' : ''
              }`}
            >
              {b.label}
              <span className="kbd !ml-0">{b.key}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 h-4 text-center text-[11px] text-ivory/50">
        {hint ? (
          <span className="text-win">Coach: basic strategy says {hint}</span>
        ) : myTurn ? (
          'Your move'
        ) : busy ? (
          'Dealing…'
        ) : (
          'Waiting for the table…'
        )}
      </p>
    </div>
  );
}
