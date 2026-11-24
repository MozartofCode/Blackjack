import { useEffect, useState } from 'react';
import { dayKey, dayNumber, formatMoney } from '@bj/engine';
import { isOnline } from '../lib/backend';
import { ensureUser, getNickname, setNickname, supabase } from '../lib/supabase';
import { dailyRecords } from '../lib/stats';

type Tab = 'daily' | 'monthly' | 'alltime';

interface Row {
  rank: number;
  name: string;
  is_bot: boolean;
  user_id: string | null;
  value: number;
  sub?: string;
}

async function fetchBoard(tab: Tab, me: string): Promise<{ rows: Row[]; mine: Row | null }> {
  const sb = supabase();
  const today = dayKey();
  const month = `${today.slice(0, 7)}-01`;
  let q;
  if (tab === 'daily') q = sb.from('leaderboard_daily').select('*').eq('day', today);
  else if (tab === 'monthly') q = sb.from('leaderboard_monthly').select('*').eq('month', month);
  else q = sb.from('leaderboard_alltime').select('*');

  const map = (r: Record<string, unknown>): Row => ({
    rank: Number(r.rank),
    name: String(r.name),
    is_bot: Boolean(r.is_bot),
    user_id: (r.user_id as string) ?? null,
    value: Number(tab === 'daily' ? r.final_bankroll : r.total_profit),
    sub:
      tab === 'daily'
        ? ((r.hand_results as string) ?? undefined)
        : `${r.days_played} day${Number(r.days_played) === 1 ? '' : 's'}${r.avg_roi_pct != null ? ` · avg ${Number(r.avg_roi_pct) >= 0 ? '+' : ''}${r.avg_roi_pct}%` : ''}`,
  });

  const { data, error } = await q.order('rank').limit(100);
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map(map);
  let mine = rows.find((r) => r.user_id === me) ?? null;
  if (!mine) {
    let mq;
    if (tab === 'daily') mq = sb.from('leaderboard_daily').select('*').eq('day', today);
    else if (tab === 'monthly') mq = sb.from('leaderboard_monthly').select('*').eq('month', month);
    else mq = sb.from('leaderboard_alltime').select('*');
    const { data: m } = await mq.eq('user_id', me).maybeSingle();
    mine = m ? map(m) : null;
  }
  return { rows, mine };
}

export function NicknameForm({ onSaved }: { onSaved: (n: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="rounded-2xl bg-brass/15 p-3 ring-1 ring-brass/40"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
          await setNickname(value);
          onSaved(value.trim());
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <label className="text-sm font-bold" htmlFor="nick">
        Pick a nickname for the leaderboard
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="nick"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={16}
          placeholder="e.g. AceHigh"
          className="h-11 min-w-0 flex-1 rounded-xl bg-black/40 px-3 text-ivory ring-1 ring-white/15 outline-none focus:ring-brass-light"
        />
        <button className="btn-brass h-11 px-4" disabled={saving || value.trim().length < 2}>
          Save
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-lose">{error}</p>}
    </form>
  );
}

function RowView({ r, me, money, base }: { r: Row; me: string | null; money: (n: number) => string; base: number }) {
  const mine = me && r.user_id === me;
  return (
    <li className={`flex items-center gap-3 rounded-xl px-3 py-2 ${mine ? 'bg-brass/20 ring-1 ring-brass/50' : 'odd:bg-white/[.03]'}`}>
      <span className={`w-7 text-right font-display font-bold ${r.rank <= 3 ? 'text-brass-light' : 'text-ivory/50'}`}>{r.rank}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">
          {r.name} {r.is_bot && <span className="ml-1 rounded bg-white/10 px-1 text-[10px] font-bold">🤖 BOT</span>}
          {mine && <span className="ml-1 text-[10px] font-bold text-brass-light">YOU</span>}
        </div>
        {r.sub && <div className="truncate text-[11px] text-ivory/50">{r.sub}</div>}
      </div>
      <span className={`money text-sm font-bold ${r.value >= base ? 'text-win' : 'text-lose'}`}>
        {money(r.value)}
      </span>
    </li>
  );
}

export function Leaderboard({ onBack }: { onBack: () => void }) {
  const online = isOnline();
  const [tab, setTab] = useState<Tab>('daily');
  const [rows, setRows] = useState<Row[]>([]);
  const [mine, setMine] = useState<Row | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [nick, setNick] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(online);

  useEffect(() => {
    if (!online) return;
    void (async () => {
      try {
        const id = await ensureUser();
        setMe(id);
        setNick(await getNickname());
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [online]);

  useEffect(() => {
    if (!online || !me) return;
    setLoading(true);
    fetchBoard(tab, me)
      .then(({ rows, mine }) => {
        setRows(rows);
        setMine(mine);
        setError(null);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [tab, me, online, nick]);

  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${formatMoney(Math.abs(n))}`;
  const money = tab === 'daily' ? formatMoney : signed;
  const base = tab === 'daily' ? 1000 : 0;
  const local = Object.values(dailyRecords()).sort((a, b) => b.day.localeCompare(a.day));

  return (
    <div className="felt relative min-h-full overflow-y-auto">
      <div className="relative z-10 mx-auto flex max-w-lg flex-col gap-4 px-4 py-5">
        <div className="flex items-center gap-3">
          <button className="btn-ghost h-10 w-10 rounded-xl" onClick={onBack} aria-label="Back">
            ←
          </button>
          <div>
            <h1 className="font-display text-3xl font-black">Leaderboard</h1>
            <p className="text-xs text-ivory/55">Table #{dayNumber()} · bots compete too</p>
          </div>
        </div>

        {!online ? (
          <div className="rounded-2xl bg-black/30 p-4 ring-1 ring-white/10">
            <p className="text-sm text-ivory/80">
              The global leaderboard needs the online backend. Here are your results on this device:
            </p>
            <ul className="mt-3 flex flex-col gap-1">
              {local.length === 0 && <li className="text-sm text-ivory/50">No daily tables played yet.</li>}
              {local.map((r) => (
                <li key={r.day} className="flex items-center justify-between rounded-xl bg-white/[.04] px-3 py-2 text-sm">
                  <span>#{dayNumber(r.day)}</span>
                  <span className="truncate px-2 tracking-wider">{r.grid}</span>
                  <span className={`money font-bold ${r.profit >= 0 ? 'text-win' : 'text-lose'}`}>{formatMoney(r.bankroll)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            {nick === null && <NicknameForm onSaved={setNick} />}
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-black/30 p-1 ring-1 ring-white/10" role="tablist">
              {(
                [
                  ['daily', 'Today'],
                  ['monthly', 'Month'],
                  ['alltime', 'All-time'],
                ] as [Tab, string][]
              ).map(([t, label]) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`btn h-10 rounded-xl text-sm ${tab === t ? 'bg-brass text-ink' : 'text-ivory/70 hover:bg-white/5'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="-mt-2 text-center text-[11px] text-ivory/45">
              {tab === 'daily' ? 'Final bankroll after 20 hands' : tab === 'monthly' ? 'Total profit this month' : 'Total profit, all time'}
            </p>
            {error && <p className="rounded-xl bg-lose/20 p-3 text-sm text-lose">{error}</p>}
            {loading ? (
              <div className="py-10 text-center text-sm text-ivory/50">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="py-10 text-center text-sm text-ivory/60">Nobody has finished yet. Be the first!</div>
            ) : (
              <ol className="flex flex-col gap-1">
                {rows.map((r, i) => (
                  <RowView key={`${r.user_id ?? r.name}-${i}`} r={r} me={me} money={money} base={base} />
                ))}
              </ol>
            )}
            {mine && !rows.some((r) => r.user_id === me) && (
              <div className="sticky bottom-3">
                <ol>
                  <RowView r={mine} me={me} money={money} base={base} />
                </ol>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
