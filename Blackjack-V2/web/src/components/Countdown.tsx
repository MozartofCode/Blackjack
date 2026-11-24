import { useEffect, useState } from 'react';
import { msUntilNextDay } from '@bj/engine';

export function Countdown({ className = '' }: { className?: string }) {
  const [ms, setMs] = useState(msUntilNextDay());
  useEffect(() => {
    const t = setInterval(() => setMs(msUntilNextDay()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return <span className={`money ${className}`}>{hh}:{mm}:{ss}</span>;
}
