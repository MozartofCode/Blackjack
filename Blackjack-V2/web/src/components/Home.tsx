import { useState } from 'react';
import { motion } from 'framer-motion';
import { dayKey, dayNumber, formatMoney } from '@bj/engine';
import { BOTS, dailyLineup } from '@bj/bots';
import { Avatar } from './Avatar';
import { Countdown } from './Countdown';
import { StatsModal } from './StatsModal';
import { HowTo } from './HowTo';
import { dailyRecords } from '../lib/stats';

interface Props {
  onDaily: () => void;
  onPractice: () => void;
  onLounge: () => void;
  onLeaderboard: () => void;
  online: boolean;
}

export function Home({ onDaily, onPractice, onLounge, onLeaderboard, online }: Props) {
  const day = dayKey();
  const lineup = dailyLineup(day);
  const today = dailyRecords()[day];
  const [stats, setStats] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const date = new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="felt relative min-h-full overflow-y-auto">
      <div className="relative z-10 mx-auto flex min-h-full max-w-md flex-col px-5 pt-8 pb-8">
        <div className="flex items-center justify-between">
          <button className="btn-ghost h-10 w-10 rounded-xl" onClick={() => setHowTo(true)} aria-label="How to play">
            ?
          </button>
          <button className="btn-ghost h-10 rounded-xl px-3 text-sm" onClick={() => setStats(true)}>
            📊 Stats
          </button>
        </div>

        <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mt-6 text-center">
          <div className="text-xs font-bold tracking-[0.35em] text-brass/80 uppercase">Table #{dayNumber(day)} · {date}</div>
          <h1 className="mt-2 font-display text-6xl leading-[0.9] font-black">
            <span className="brass-text">Blackjack</span>
            <br />
            <span className="text-ivory">Daily</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xs text-[15px] text-ivory/75">
            20 hands. $1,000. Beat the bots.
          </p>
        </motion.div>

        <div className="mt-7 rounded-3xl bg-black/30 p-4 ring-1 ring-white/10">
          <div className="mb-3 text-center text-[11px] font-bold tracking-[0.25em] text-ivory/50 uppercase">Today's table</div>
          <div className="flex items-end justify-center gap-3">
            {[lineup[0], lineup[1]].map((id) => (
              <div key={id} className="flex w-14 flex-col items-center gap-1">
                <Avatar botId={id} size={44} />
                <span className="text-[11px] font-semibold text-ivory/80">{BOTS[id].handle}</span>
              </div>
            ))}
            <div className="flex w-16 -translate-y-2 flex-col items-center gap-1">
              <Avatar you size={56} />
              <span className="text-[11px] font-bold text-brass-light">You</span>
            </div>
            {[lineup[2], lineup[3]].map((id) => (
              <div key={id} className="flex w-14 flex-col items-center gap-1">
                <Avatar botId={id} size={44} />
                <span className="text-[11px] font-semibold text-ivory/80">{BOTS[id].handle}</span>
              </div>
            ))}
          </div>
        </div>

        {today ? (
          <div className="mt-5 rounded-3xl bg-brass/15 p-4 text-center ring-1 ring-brass/40">
            <div className="text-xs font-bold tracking-widest text-ivory/60 uppercase">Today's result</div>
            <div className={`money mt-1 font-display text-4xl font-black ${today.profit >= 0 ? 'brass-text' : 'text-lose'}`}>
              {formatMoney(today.bankroll)}
            </div>
            <div className="mt-1 text-lg tracking-wider">{today.grid}</div>
            <button className="btn-brass mt-3 h-12 w-full" onClick={onDaily}>
              See result
            </button>
            <div className="mt-3 text-sm text-ivory/60">
              Next table in <Countdown className="font-bold text-ivory" />
            </div>
          </div>
        ) : (
          <button className="btn-brass mt-5 h-16 text-xl" onClick={onDaily}>
            Take your seat
          </button>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button className="btn-ghost h-20 flex-col gap-1 text-sm" onClick={onPractice}>
            <span className="text-xl">🃏</span>Practice
          </button>
          <button className="btn-ghost h-20 flex-col gap-1 text-sm" onClick={onLounge}>
            <span className="text-xl">🤖</span>Watch bots
          </button>
          <button className="btn-ghost h-20 flex-col gap-1 text-sm" onClick={onLeaderboard}>
            <span className="text-xl">🏆</span>Leaders
          </button>
        </div>

        <p className="mt-auto pt-8 text-center text-[11px] leading-relaxed text-ivory/40">
          Play money only.
        </p>
      </div>
      <StatsModal open={stats} onClose={() => setStats(false)} />
      <HowTo open={howTo} onClose={() => setHowTo(false)} />
    </div>
  );
}
