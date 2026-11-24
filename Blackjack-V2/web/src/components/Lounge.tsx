import { useEffect, useRef, useState } from 'react';
import { DAILY_CONFIG, type TableState, formatMoney } from '@bj/engine';
import { BOTS, type BotId } from '@bj/bots';
import { LocalDriver } from '../game/driver';
import { useGame } from '../game/store';
import { Avatar } from './Avatar';
import { TableView } from './TableView';

const IDS = Object.keys(BOTS) as BotId[];

function Sparkline({ data, hue }: { data: number[]; hue: number }) {
  const pts = data.length > 1 ? data : [0, ...data, 0];
  const min = Math.min(0, ...pts);
  const max = Math.max(1, ...pts);
  const w = 90;
  const h = 26;
  const d = pts
    .map((v, i) => `${(i / (pts.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`)
    .join(' ');
  const zero = h - ((0 - min) / (max - min || 1)) * h;
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <line x1="0" x2={w} y1={zero} y2={zero} stroke="rgba(255,255,255,.15)" strokeDasharray="2 3" />
      <polyline points={d} fill="none" stroke={`hsl(${hue} 70% 65%)`} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** Six bots playing nonstop; you just watch. */
export function Lounge({ onExit }: { onExit: () => void }) {
  const { begin, act, waiting, busy, speed, leave } = useGame();
  const [paused, setPaused] = useState(false);
  const [series, setSeries] = useState<Record<string, number[]>>(() => Object.fromEntries(IDS.map((id) => [id, [0]])));
  const totals = useRef<Record<string, number>>({});

  useEffect(() => {
    const onRound = (s: TableState) => {
      const round = s.history.filter((r) => r.round === s.round);
      setSeries((prev) => {
        const next = { ...prev };
        for (const r of round) {
          const id = s.seats[r.seat].botId!;
          totals.current[id] = (totals.current[id] ?? 0) + r.net;
          next[id] = [...prev[id], totals.current[id]].slice(-120);
        }
        return next;
      });
    };
    const driver = new LocalDriver({
      mode: 'lounge',
      seed: `lounge-${Date.now()}`,
      seats: IDS.map((id) => ({ kind: 'bot', name: BOTS[id].handle, botId: id })),
      config: { ...DAILY_CONFIG, maxRounds: 0, startingBankroll: 1000 },
      endless: true,
      onRound,
    });
    void begin(driver);
    return () => leave();
  }, [begin, leave]);

  useEffect(() => {
    if (paused || busy || waiting?.for !== 'nextRound') return;
    const t = setTimeout(() => void act({ type: 'nextRound' }), speed === 0 ? 120 : 900 / speed);
    return () => clearTimeout(t);
  }, [paused, busy, waiting, act, speed]);

  const ranked = IDS.map((id) => ({ id, net: series[id].at(-1) ?? 0 })).sort((a, b) => b.net - a.net);

  return (
    <TableView
      title="Watch the bots"
      onExit={onExit}
      footer={
        <div className="safe-bottom border-t border-white/10 bg-ink/85 px-3 pt-3 backdrop-blur-md">
          <div className="mx-auto max-w-3xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-[0.2em] text-ivory/50 uppercase">Profit</span>
              <button className="btn-ghost h-8 rounded-lg px-3 text-xs" onClick={() => setPaused(!paused)}>
                {paused ? '▶ Resume' : '❚❚ Pause'}
              </button>
            </div>
            <ol className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
              {ranked.map(({ id, net }, i) => (
                <li key={id} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-ivory/50">{i + 1}</span>
                  <Avatar botId={id} size={20} />
                  <span className="w-16 truncate font-semibold">{BOTS[id].handle}</span>
                  <Sparkline data={series[id]} hue={BOTS[id].hue} />
                  <span className={`money ml-auto font-bold ${net >= 0 ? 'text-win' : 'text-lose'}`}>
                    {net >= 0 ? '+' : ''}
                    {formatMoney(net)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      }
    />
  );
}
