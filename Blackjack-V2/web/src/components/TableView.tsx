import { type ReactNode, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { type PublicTable, formatMoney, handTotal, seatWorth } from '@bj/engine';
import type { BotId } from '@bj/bots';
import { useGame } from '../game/store';
import { ActionBar } from './ActionBar';
import { Card } from './Card';
import { SeatView } from './Seat';
import { BotSheet } from './BotSheet';
import { Money } from './Money';
import { isMuted, setMuted } from '../lib/sound';

const AREAS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

function Dealer({ view }: { view: PublicTable }) {
  const visible = view.dealer.cards.filter((c): c is string => c !== null);
  const total = visible.length ? handTotal(visible) : null;
  return (
    <div className="flex flex-col items-center">
      <div className="mb-1 text-[10px] font-bold tracking-[0.3em] text-ivory/40 uppercase">Dealer</div>
      <div className="flex min-h-[92px] items-end sm:min-h-[104px]">
        {view.dealer.cards.map((c, i) => (
          <div key={i} className={i ? '-ml-9 sm:-ml-10' : ''} style={{ zIndex: i }}>
            <Card card={c} size="lg" index={i} />
          </div>
        ))}
      </div>
      <div className="mt-1 h-5">
        {total && (
          <span className={`money rounded-full px-2 text-xs font-bold ${total.total > 21 ? 'bg-lose text-white' : 'bg-black/45'}`}>
            {total.total > 21 ? `Bust · ${total.total}` : total.total}
          </span>
        )}
      </div>
    </div>
  );
}

interface Props {
  title: string;
  subtitle?: string;
  coachAvailable?: boolean;
  onExit: () => void;
  onResults?: () => void;
  /** Rendered instead of the action bar when there is no human seat. */
  footer?: ReactNode;
}

export function TableView({ title, subtitle, coachAvailable, onExit, onResults, footer }: Props) {
  const { display: view, waiting, busy, notes, banner, speed, setSpeed, act, driver, lastBet, error } = useGame();
  const [coach, setCoach] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [info, setInfo] = useState<BotId | null>(null);
  if (!view || !driver) return null;

  const human = driver.humanSeat;
  const humanSeat = human != null ? view.seats[human] : null;
  const ranked = view.seats
    .filter((s) => s.kind !== 'empty')
    .map((s) => ({ id: s.id, worth: seatWorth(s) }))
    .sort((a, b) => b.worth - a.worth);
  const myRank = human != null ? ranked.findIndex((r) => r.id === human) + 1 : 0;
  const maxRounds = view.config.maxRounds;

  // Grid: mobile = bots on one row, you underneath; desktop = one arc row.
  const bots = view.seats.filter((s) => s.id !== human);
  const mobileAreas = human != null ? `'${bots.map((s) => AREAS[s.id]).join(' ')}' '${Array(bots.length).fill(AREAS[human]).join(' ')}'` : `'${bots.map((s) => AREAS[s.id]).join(' ')}'`;
  const desktopAreas = `'${view.seats.map((s) => AREAS[s.id]).join(' ')}'`;

  return (
    <div className="flex h-full flex-col">
      {/* HUD */}
      <header className="z-30 flex items-center gap-2 border-b border-white/10 bg-ink/80 px-3 py-2 backdrop-blur-md">
        <button className="btn-ghost h-9 w-9 shrink-0 rounded-xl text-lg" onClick={onExit} aria-label="Leave table">
          ←
        </button>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-display text-base font-bold sm:text-lg">{title}</div>
          <div className="truncate text-[11px] text-ivory/55">
            {maxRounds > 0 ? `Hand ${Math.min(view.round, maxRounds)} of ${maxRounds}` : `Hand ${view.round}`}
            {subtitle ? ` · ${subtitle}` : ''}
            {myRank > 0 && ` · You're #${myRank} of ${ranked.length}`}
          </div>
        </div>
        {humanSeat && (
          <div className="text-right leading-tight">
            <div className="text-[10px] font-bold tracking-widest text-ivory/45 uppercase">Bankroll</div>
            <Money value={seatWorth(humanSeat)} className="font-display text-lg font-bold text-brass-light sm:text-xl" />
          </div>
        )}
        <div className="flex shrink-0 gap-1">
          {coachAvailable && (
            <button
              className={`btn h-9 rounded-xl px-2 text-xs ${coach ? 'bg-win text-ink' : 'bg-white/8 ring-1 ring-white/15'}`}
              onClick={() => setCoach(!coach)}
              aria-pressed={coach}
              title="Coach: basic strategy hints and the Hi-Lo count"
            >
              Coach
            </button>
          )}
          <button
            className="btn h-9 w-11 rounded-xl bg-white/8 text-xs ring-1 ring-white/15"
            onClick={() => setSpeed(speed === 1 ? 2 : speed === 2 ? 0 : 1)}
            title="Animation speed"
          >
            {speed === 0 ? '⏭' : `${speed}×`}
          </button>
          <button
            className="btn h-9 w-9 rounded-xl bg-white/8 ring-1 ring-white/15"
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

      {/* Felt */}
      <main className="felt relative flex flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-[42%] hidden text-center font-display md:block text-[11px] tracking-[0.25em] text-brass/35 uppercase sm:text-xs">
          Blackjack pays 3 to 2 · Dealer stands on soft 17
        </div>

        {/* Shoe */}
        <div className="absolute top-4 right-4 hidden flex-col items-center gap-1 sm:flex" aria-hidden>
          <div className="h-16 w-12 rounded-md border border-black/40 bg-gradient-to-b from-[#3a2a1a] to-[#1d140c] p-1 shadow-xl">
            <div className="card-back h-full w-full rounded-sm" />
          </div>
          <div className="h-1 w-12 overflow-hidden rounded bg-black/40">
            <div className="h-full bg-brass/70" style={{ width: `${(view.shoe.remaining / view.shoe.total) * 100}%` }} />
          </div>
        </div>

        {coach && view.runningCount !== null && (
          <div className="absolute top-4 left-4 z-10 rounded-xl bg-black/45 px-3 py-2 text-[11px] leading-snug ring-1 ring-white/10">
            <div className="font-bold text-win">Coach</div>
            <div>
              Running count <b className="money">{view.runningCount > 0 ? `+${view.runningCount}` : view.runningCount}</b>
            </div>
            <div>
              True count{' '}
              <b className="money">
                {Math.floor(view.runningCount / Math.max(1, Math.ceil(view.shoe.remaining / 52)))}
              </b>
            </div>
          </div>
        )}

        <div className="relative z-10 flex flex-1 flex-col justify-between gap-2 px-2 pt-3 pb-3 sm:px-6 sm:pt-5">
          <Dealer view={view} />

          <div
            className="mx-auto grid w-full max-w-5xl items-end gap-x-1 gap-y-3 pt-6 [grid-template-areas:var(--m)] md:[grid-template-areas:var(--d)]"
            style={{ ['--m' as string]: mobileAreas, ['--d' as string]: desktopAreas, gridAutoColumns: '1fr' }}
          >
            {view.seats.map((s) => (
              <div
                key={s.id}
                style={{ gridArea: AREAS[s.id] }}
                className={s.id === human ? 'md:-mb-1' : 'md:mb-6'}
              >
                <SeatView
                  seat={s}
                  you={s.id === human}
                  compact={s.id !== human}
                  activeHand={view.turn?.seat === s.id ? view.turn.hand : null}
                  note={notes[s.id]}
                  onInfo={s.botId ? () => setInfo(s.botId as BotId) : undefined}
                />
              </div>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {banner && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-x-0 top-[38%] z-40 flex justify-center"
              role="status"
            >
              <div className="rounded-full bg-ink/85 px-5 py-2 font-display text-lg font-bold text-brass-light shadow-2xl ring-1 ring-brass/40">
                {banner}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="absolute inset-x-3 top-3 z-50 rounded-xl bg-lose/90 px-4 py-2 text-sm font-semibold text-white shadow-xl" role="alert">
            {error}
          </div>
        )}
      </main>

      {human != null ? (
        <ActionBar
          view={view}
          waiting={waiting}
          humanSeat={human}
          busy={busy}
          lastBet={lastBet}
          coach={coach}
          onAct={act}
          onResults={onResults}
        />
      ) : (
        footer
      )}

      <BotSheet botId={info} onClose={() => setInfo(null)} bankroll={info ? view.seats.find((s) => s.botId === info)?.bankroll : undefined} />
      <span className="sr-only" aria-live="polite">
        {humanSeat?.hands.map((h) => `${h.cards.length} cards, ${handTotal(h.cards).total}`).join('; ')}
        {formatMoney(humanSeat?.bankroll ?? 0)}
      </span>
    </div>
  );
}
