import { AnimatePresence, motion } from 'framer-motion';
import { formatMoney } from '@bj/engine';
import { BOTS, type BotId } from '@bj/bots';
import { Avatar } from './Avatar';

export function BotSheet({ botId, onClose, bankroll }: { botId: BotId | null; onClose: () => void; bankroll?: number }) {
  const bot = botId ? BOTS[botId] : null;
  return (
    <AnimatePresence>
      {bot && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-label={bot.name}
            className="w-full max-w-sm rounded-3xl bg-[#0d1f18] p-5 shadow-2xl ring-1 ring-white/10"
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            exit={{ y: 40 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <Avatar botId={bot.id} size={56} />
              <div>
                <div className="font-display text-xl font-bold">{bot.name}</div>
                <div className="text-xs text-ivory/60">{bot.model}</div>
              </div>
            </div>
            <p className="mt-4 text-sm text-ivory/85">{bot.blurb}</p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-white/5 p-3">
                <dt className="text-[10px] tracking-widest text-ivory/50 uppercase">Trained on</dt>
                <dd className="mt-0.5 font-semibold">{bot.trainedOn}</dd>
              </div>
              {bankroll !== undefined && (
                <div className="rounded-xl bg-white/5 p-3">
                  <dt className="text-[10px] tracking-widest text-ivory/50 uppercase">At this table</dt>
                  <dd className="money mt-0.5 font-semibold text-brass-light">{formatMoney(bankroll)}</dd>
                </div>
              )}
              <div className="rounded-xl bg-white/5 p-3">
                <dt className="text-[10px] tracking-widest text-ivory/50 uppercase">Sim avg profit</dt>
                <dd className={`money mt-0.5 font-semibold ${bot.sim.avgProfitPct >= 0 ? 'text-win' : 'text-lose'}`}>
                  {bot.sim.avgProfitPct}%
                </dd>
              </div>
              <div className="rounded-xl bg-white/5 p-3">
                <dt className="text-[10px] tracking-widest text-ivory/50 uppercase">Hit +30% goal</dt>
                <dd className="mt-0.5 font-semibold">{bot.sim.timesOver30} / 100 runs</dd>
              </div>
            </dl>
            <button className="btn-ghost mt-5 h-11 w-full" onClick={onClose}>
              Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
