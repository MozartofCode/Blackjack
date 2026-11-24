import { useEffect, useState } from 'react';
import { DAILY_CONFIG, dayKey, dayNumber, seatWorth, shareGrid } from '@bj/engine';
import { HUMAN_SEAT, dailySeats } from '@bj/bots';
import { Home } from './components/Home';
import { Lounge } from './components/Lounge';
import { Results, type RankInfo } from './components/Results';
import { TableView } from './components/TableView';
import { Leaderboard } from './components/Leaderboard';
import { LocalDriver, type TableDriver } from './game/driver';
import { useGame } from './game/store';
import { createDailyDriver, isOnline } from './lib/backend';
import { recordDaily } from './lib/stats';

type Route = 'home' | 'daily' | 'practice' | 'lounge' | 'leaderboard';

function readRoute(): Route {
  const r = location.hash.replace(/^#\/?/, '').split('?')[0];
  return (['daily', 'practice', 'lounge', 'leaderboard'] as Route[]).includes(r as Route) ? (r as Route) : 'home';
}

function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [route, (r) => (location.hash = r === 'home' ? '/' : `/${r}`)];
}

function Loading({ label }: { label: string }) {
  return (
    <div className="felt grid h-full place-items-center">
      <div className="relative z-10 flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brass/30 border-t-brass" />
        <p className="text-xs font-bold tracking-[0.25em] text-ivory/60 uppercase">{label}</p>
      </div>
    </div>
  );
}

function DailyScreen({ go }: { go: (r: Route) => void }) {
  const { begin, leave, display, busy, loading, driver, error } = useGame();
  const [showResults, setShowResults] = useState(false);
  const [rankInfo, setRankInfo] = useState<RankInfo | null>(null);
  const day = dayKey();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const d = await createDailyDriver(day);
      if (!cancelled) await begin(d);
    })();
    return () => {
      cancelled = true;
      leave();
    };
  }, [begin, leave, day]);

  const finished = display?.phase === 'finished' && !busy;
  useEffect(() => {
    if (!finished || !display || !driver || driver.humanSeat == null) return;
    const me = display.seats[driver.humanSeat];
    const bots = display.seats.filter((s) => s.kind === 'bot');
    const finish = async () => {
      let info: RankInfo | null = null;
      if ('finish' in driver) info = await (driver as TableDriver & { finish(): Promise<RankInfo | null> }).finish();
      setRankInfo(info);
      recordDaily({
        day,
        bankroll: me.bankroll,
        profit: me.bankroll - display.config.startingBankroll,
        grid: shareGrid(display.history, driver.humanSeat!),
        botsBeaten: bots.filter((b) => b.bankroll < me.bankroll).length,
        botsTotal: bots.length,
        ...(info ?? {}),
      });
      setShowResults(true);
    };
    void finish();
  }, [finished, display, driver, day]);

  if (error && !display) {
    return (
      <div className="felt grid h-full place-items-center p-6 text-center">
        <div className="relative z-10 max-w-sm">
          <p className="text-lg font-bold">Couldn't open today's table</p>
          <p className="mt-2 text-sm text-ivory/70">{error}</p>
          <button className="btn-brass mt-4 h-12 w-full" onClick={() => go('home')}>
            Back
          </button>
        </div>
      </div>
    );
  }
  if (loading || !display || !driver) return <Loading label="Shuffling today's shoe" />;

  return (
    <>
      <TableView title={`Daily #${dayNumber(day)}`} subtitle={driver.ranked ? undefined : 'offline'} onExit={() => go('home')} onResults={() => setShowResults(true)} />
      {showResults && driver.humanSeat != null && (
        <Results
          view={display}
          humanSeat={driver.humanSeat}
          day={day}
          ranked={driver.ranked}
          rankInfo={rankInfo}
          onLeaderboard={() => go('leaderboard')}
          onPractice={() => go('practice')}
          onHome={() => go('home')}
        />
      )}
    </>
  );
}

function PracticeScreen({ go }: { go: (r: Route) => void }) {
  const { begin, leave, display, loading } = useGame();
  const [session, setSession] = useState(0);

  useEffect(() => {
    const seed = `practice-${crypto.getRandomValues(new Uint32Array(2)).join('-')}`;
    void begin(
      new LocalDriver({
        mode: 'practice',
        seed,
        seats: dailySeats(seed, 'You'),
        config: { ...DAILY_CONFIG, maxRounds: 0 },
        exposeCount: true,
      }),
    );
    return () => leave();
  }, [begin, leave, session]);

  if (loading || !display) return <Loading label="Setting up the practice table" />;
  const me = display.seats[HUMAN_SEAT];
  const broke = display.phase === 'finished' || (display.phase === 'settled' && seatWorth(me) < display.config.minBet);

  return (
    <>
      <TableView title="Practice" coachAvailable onExit={() => go('home')} />
      {broke && (
        <div className="fixed inset-x-3 bottom-28 z-[60] mx-auto max-w-md rounded-2xl bg-ink/95 p-4 text-center shadow-2xl ring-1 ring-brass/40">
          <p className="font-bold">Out of chips</p>
          <button className="btn-brass mt-3 h-12 w-full" onClick={() => setSession((s) => s + 1)}>
            Get $1,000
          </button>
        </div>
      )}
    </>
  );
}

export default function App() {
  const [route, go] = useRoute();
  const online = isOnline();

  switch (route) {
    case 'daily':
      return <DailyScreen go={go} />;
    case 'practice':
      return <PracticeScreen go={go} />;
    case 'lounge':
      return <Lounge onExit={() => go('home')} />;
    case 'leaderboard':
      return <Leaderboard onBack={() => go('home')} />;
    default:
      return (
        <Home
          online={online}
          onDaily={() => go('daily')}
          onPractice={() => go('practice')}
          onLounge={() => go('lounge')}
          onLeaderboard={() => go('leaderboard')}
        />
      );
  }
}
