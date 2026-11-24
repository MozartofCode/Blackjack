import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '@bj/engine';

/** Animated money counter that ticks toward its new value. */
export function Money({ value, className = '' }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    setFlash(value > start ? 'up' : 'down');
    const t0 = performance.now();
    const dur = 600;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - (1 - k) ** 3;
      setShown(Math.round(start + (value - start) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
      else {
        from.current = value;
        setTimeout(() => setFlash(null), 300);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value]);

  return (
    <span
      className={`money transition-colors ${flash === 'up' ? '!text-win' : flash === 'down' ? '!text-lose' : ''} ${className}`}
    >
      {formatMoney(shown)}
    </span>
  );
}
