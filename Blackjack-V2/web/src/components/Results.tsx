import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { type PublicTable, formatMoney, handTotal, rankOf, shareGrid, shareText } from '@bj/engine';
import { ACTION_LABEL, BOTS, type BotId, basicStrategy } from '@bj/bots';
import { Avatar } from './Avatar';
import { Countdown } from './Countdown';
import { NicknameForm } from './Leaderboard';
import { getNickname } from '../lib/supabase';

export interface RankInfo {
  rank: number;
  players: number;
}

interface Props {
  view: PublicTable;
  humanSeat: number;
  day?: string;
  ranked: boolean;
  rankInfo?: RankInfo | null;
  onLeaderboard?: () => void;
  onPractice: () => void;
  onHome: () => void;
}

export function Results({ view, humanSeat, day, ranked, rankInfo, onLeaderboard, onPractice, onHome }: Props) {
  const me = view.seats[humanSeat];
  const start = view.config.startingBankroll;
  const profit = me.bankroll - start;
  const pct = Math.round((profit / start) * 100);
  const bots = view.seats.filter((s) => s.kind === 'bot');
  const beaten = bots.filter((b) => b.bankroll < me.bankroll).length;
  const grid = shareGrid(view.history, humanSeat);
  const [copied, setCopied] = useState(false);
  const [nick, setNick] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (ranked) getNickname().then(setNick).catch(() => setNick(undefined));
  }, [ranked]);

  const podium = [...view.seats.filter((s) => s.kind !== 'empty')].sort((a, b) => b.bankroll - a.bankroll);

  const mistakes = useMemo(
    () =>
      view.decisions
        .filter((d) => d.seat === humanSeat)
        .map((d) => ({ d, best: basicStrategy(d.cards, d.upcard, d.legal) }))
        .filter(({ d, best }) => best !== d.action),
    [view.decisions, humanSeat],
  );

  const url = typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : '';
  const text = day
    ? shareText({ day, bankroll: me.bankroll, start, grid, rank: rankInfo?.rank, players: rankInfo?.players, botsBeaten: beaten, botsTotal: bots.length, url })
    : '';

  async function share() {
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* user cancelled */
    }
  }
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-ink/90 backdrop-blur-sm">
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="mx-auto flex min-h-full max-w-md flex-col gap-4 px-4 py-6"
      >
        <div className="text-center">
          <div className={`money mt-1 font-display text-6xl font-black ${profit >= 0 ? 'brass-text' : 'text-lose'}`}>
            {formatMoney(me.bankroll)}
          </div>
          <div className={`mt-1 text-lg font-bold ${profit >= 0 ? 'text-win' : 'text-lose'}`}>
            {profit >= 0 ? '+' : '−'}
            {formatMoney(Math.abs(profit))} ({pct >= 0 ? '+' : ''}
            {pct}%)
          </div>
          {rankInfo && (
            <div className="mt-2 text-sm text-ivory/80">
              🏆 #{rankInfo.rank} of {rankInfo.players.toLocaleString()}
            </div>
          )}
          {!ranked && day && <div className="mt-2 text-xs text-ivory/50">Not ranked</div>}
        </div>

        <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold">Beat {beaten}/{bots.length} bots</span>
            <span className="text-lg">{'🤖'.repeat(beaten)}</span>
          </div>
          <ol className="flex flex-col gap-1.5">
            {podium.map((s, i) => (
              <li
                key={s.id}
                className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${s.id === humanSeat ? 'bg-brass/20 ring-1 ring-brass/50' : ''}`}
              >
                <span className="w-5 text-center font-display font-bold text-ivory/60">{i + 1}</span>
                <Avatar botId={s.botId} you={s.id === humanSeat} size={26} />
                <span className="flex-1 truncate text-sm font-semibold">
                  {s.id === humanSeat ? 'You' : BOTS[s.botId as BotId].handle}
                </span>
                <span className={`money text-sm font-bold ${s.bankroll >= start ? 'text-win' : 'text-lose'}`}>{formatMoney(s.bankroll)}</span>
              </li>
            ))}
          </ol>
        </div>

        {grid && (
          <div className="rounded-2xl bg-white/5 p-4 text-center ring-1 ring-white/10">
            <div className="text-2xl leading-relaxed tracking-wider break-all">{grid}</div>
          </div>
        )}

        {ranked && nick === null && <NicknameForm onSaved={setNick} />}

        {day && (
          <button className="btn-brass h-14 text-lg" onClick={share}>
            {copied ? 'Copied!' : 'Share'}
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          {onLeaderboard && (
            <button className="btn-ghost h-12" onClick={onLeaderboard}>
              Leaderboard
            </button>
          )}
          <button className={`btn-ghost h-12 ${onLeaderboard ? '' : 'col-span-2'}`} onClick={onPractice}>
            Practice
          </button>
        </div>

        <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <div className="text-sm font-bold">{mistakes.length === 0 ? 'Perfect play ✓' : 'Better plays'}</div>
          {mistakes.length > 0 && (
            <>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {mistakes.slice(0, 6).map(({ d, best }, i) => (
                  <li key={i} className="flex justify-between gap-2 rounded-lg bg-black/20 px-2 py-1">
                    <span className="text-ivory/70">
                      #{d.round} · {handTotal(d.cards).soft ? 'soft ' : ''}
                      {handTotal(d.cards).total} vs {rankOf(d.upcard) === 'T' ? '10' : rankOf(d.upcard)}
                    </span>
                    <span>
                      <span className="text-lose line-through">{ACTION_LABEL[d.action]}</span>{' '}
                      <span className="font-bold text-win">{ACTION_LABEL[best]}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {day && (
          <div className="text-center text-sm text-ivory/60">
            Next table in <Countdown className="font-bold text-ivory" />
          </div>
        )}
        <button className="mb-4 text-sm text-ivory/60 underline-offset-4 hover:underline" onClick={onHome}>
          Home
        </button>
      </motion.div>
    </div>
  );
}
