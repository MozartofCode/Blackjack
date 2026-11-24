import { formatMoney } from '@bj/engine';
import { Modal } from './Modal';
import { computeStats } from '../lib/stats';

export function StatsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = computeStats();
  const tiles = [
    { label: 'Played', value: s.played },
    { label: 'Profitable', value: `${s.profitablePct}%` },
    { label: 'Streak', value: s.currentStreak },
    { label: 'Best streak', value: s.maxStreak },
  ];
  return (
    <Modal open={open} onClose={onClose} title="Stats">
      <div className="grid grid-cols-4 gap-2 text-center">
        {tiles.map((t) => (
          <div key={t.label}>
            <div className="money font-display text-3xl font-bold">{t.value}</div>
            <div className="text-[10px] tracking-wider text-ivory/55 uppercase">{t.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-white/5 p-3">
          <div className="text-[10px] tracking-widest text-ivory/50 uppercase">All-time profit</div>
          <div className={`money font-bold ${s.totalProfit >= 0 ? 'text-win' : 'text-lose'}`}>{formatMoney(s.totalProfit)}</div>
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <div className="text-[10px] tracking-widest text-ivory/50 uppercase">Best day</div>
          <div className="money font-bold text-brass-light">{s.best ? formatMoney(s.best.bankroll) : '–'}</div>
        </div>
      </div>
      {s.played === 0 && <p className="mt-4 text-center text-sm text-ivory/60">Play today to start a streak.</p>}
    </Modal>
  );
}
