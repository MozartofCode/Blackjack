import { AnimatePresence, motion } from 'framer-motion';
import { type Hand, type Seat as SeatT, formatMoney, handTotal } from '@bj/engine';
import { BOTS, type BotId } from '@bj/bots';
import { Avatar } from './Avatar';
import { Card, type CardSize } from './Card';
import { Chip } from './Chip';

const RESULT_STYLE: Record<string, string> = {
  win: 'bg-win text-ink',
  blackjack: 'bg-brass-light text-ink',
  push: 'bg-push text-ink',
  lose: 'bg-lose text-white',
  bust: 'bg-lose text-white',
  surrender: 'bg-push text-ink',
};
const RESULT_LABEL: Record<string, string> = {
  win: 'Win',
  blackjack: 'Blackjack!',
  push: 'Push',
  lose: 'Lose',
  bust: 'Bust',
  surrender: 'Surrender',
};

export function HandView({ hand, size, active, overlap }: { hand: Hand; size: CardSize; active: boolean; overlap: string }) {
  const { total, soft } = handTotal(hand.cards);
  const showTotal = hand.cards.length >= 2 || (hand.cards.length === 1 && hand.fromSplit);
  return (
    <div className={`relative flex flex-col items-center transition ${active ? '' : hand.result ? '' : 'opacity-95'}`}>
      <div className={`relative flex ${active ? 'drop-shadow-[0_0_14px_rgba(240,201,119,.55)]' : ''}`}>
        {hand.cards.map((c, i) => (
          <div key={`${i}-${c}`} className={i ? overlap : ''} style={{ zIndex: i }}>
            <Card card={c} size={size} index={i} dim={hand.result === 'bust' || hand.surrendered} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex h-5 items-center gap-1">
        {showTotal && (
          <span
            className={`money rounded-full px-1.5 text-[11px] font-bold ${
              total > 21 ? 'bg-lose/90 text-white' : total === 21 ? 'bg-brass-light text-ink' : 'bg-black/45 text-ivory'
            }`}
          >
            {soft && total < 21 ? `${total - 10}/${total}` : total}
          </span>
        )}
        {hand.doubled && <span className="rounded-full bg-white/15 px-1.5 text-[10px] font-bold">×2</span>}
      </div>
      <AnimatePresence>
        {hand.result && (
          <motion.span
            initial={{ scale: 0.4, opacity: 0, y: 6 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className={`absolute -top-3 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider shadow-lg ${RESULT_STYLE[hand.result]}`}
          >
            {RESULT_LABEL[hand.result]}
            {hand.net ? ` ${hand.net > 0 ? '+' : '−'}${formatMoney(Math.abs(hand.net))}` : ''}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SeatProps {
  seat: SeatT;
  you?: boolean;
  activeHand: number | null;
  note?: { text: string; key: number };
  onInfo?: () => void;
  compact?: boolean;
}

export function SeatView({ seat, you, activeHand, note, onInfo, compact }: SeatProps) {
  const size: CardSize = you ? 'lg' : compact ? 'sm' : 'md';
  const overlap = you ? '-ml-9 sm:-ml-10' : compact ? '-ml-6' : '-ml-8';
  const bot = seat.botId ? BOTS[seat.botId as BotId] : null;
  const isTurn = activeHand !== null;
  const empty = seat.kind === 'empty';

  if (empty) return <div className="min-w-0 flex-1" />;

  return (
    <div className={`relative flex min-w-0 flex-col items-center ${seat.sittingOut ? 'opacity-40' : ''}`}>
      {/* Speech bubble */}
      <div className="pointer-events-none absolute -top-8 z-20 flex w-[140%] justify-center">
        <AnimatePresence mode="wait">
          {note && !you && (
            <motion.div
              key={note.key}
              initial={{ opacity: 0, y: 6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4 }}
              className="max-w-full truncate rounded-full bg-ivory px-2 py-1 text-[9px] leading-tight font-semibold text-ink shadow-xl sm:text-[11px]"
            >
              {note.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hands */}
      <div className={`flex items-end justify-center gap-2 ${you ? 'min-h-[128px] sm:min-h-[140px]' : compact ? 'min-h-[76px]' : 'min-h-[96px]'}`}>
        {seat.hands.map((h, i) => (
          <HandView key={i} hand={h} size={seat.hands.length > 2 && you ? 'md' : size} active={isTurn && activeHand === i} overlap={overlap} />
        ))}
      </div>

      {/* Bet */}
      <div className="flex h-7 items-center">
        <AnimatePresence>{seat.bet > 0 && <Chip amount={seat.bet} key="chip" small={!you} />}</AnimatePresence>
      </div>

      {/* Nameplate */}
      <button
        type="button"
        onClick={onInfo}
        disabled={!onInfo}
        className={`mt-0.5 flex max-w-full items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 transition ${
          isTurn ? 'bg-brass/25 ring-2 ring-brass-light' : 'bg-black/35 ring-1 ring-white/10'
        } ${onInfo ? 'hover:bg-black/50' : ''}`}
        aria-label={bot ? `${bot.name}, ${formatMoney(seat.bankroll)}. Show details` : undefined}
      >
        <Avatar botId={seat.botId} you={you} size={you ? 30 : compact ? 22 : 26} />
        <div className="min-w-0 text-left leading-tight">
          <div className={`truncate font-bold ${you ? 'text-sm' : 'text-[11px]'}`}>{you ? 'You' : (bot?.handle ?? seat.name)}</div>
          <div className={`money truncate font-semibold text-brass-light ${you ? 'text-xs' : 'text-[10px]'}`}>
            {formatMoney(seat.bankroll)}
          </div>
        </div>
      </button>
    </div>
  );
}
