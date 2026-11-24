import { BOTS, type BotId } from '@bj/bots';

/** Geometric generated avatars: one motif per model family, no faces. */
export function Avatar({ botId, size = 40, you }: { botId?: string; size?: number; you?: boolean }) {
  if (you || !botId) {
    return (
      <div
        className="grid shrink-0 place-items-center rounded-full font-display font-black text-ink ring-2 ring-brass-light/70"
        style={{ width: size, height: size, background: 'linear-gradient(160deg,#f0c977,#d4a24c)', fontSize: size * 0.38 }}
        aria-hidden
      >
        You
      </div>
    );
  }
  const bot = BOTS[botId as BotId];
  const h = bot.hue;
  const fg = `hsl(${h} 70% 70%)`;
  const motif = (() => {
    switch (bot.kind) {
      case 'basic': // grid = strategy table
        return [0, 1, 2].flatMap((r) =>
          [0, 1, 2].map((c) => (
            <rect key={`${r}${c}`} x={11 + c * 7} y={11 + r * 7} width="5" height="5" rx="1" fill={fg} opacity={(r + c) % 2 ? 0.5 : 1} />
          )),
        );
      case 'nn': // layered nodes
        return (
          <g stroke={fg} strokeWidth="1" fill={fg}>
            {[14, 20, 26].map((y) => (
              <line key={`a${y}`} x1="13" y1={y} x2="27" y2="20" opacity="0.6" />
            ))}
            {[14, 20, 26].map((y) => (
              <circle key={`n${y}`} cx="13" cy={y} r="2.4" />
            ))}
            <circle cx="27" cy="20" r="3" />
          </g>
        );
      case 'forest':
        return (
          <g fill={fg}>
            <path d="M12 27 L17 15 L22 27 Z" opacity="0.6" />
            <path d="M18 28 L24 12 L30 28 Z" />
          </g>
        );
      case 'tree':
        return (
          <g stroke={fg} strokeWidth="2" strokeLinecap="round" fill="none">
            <path d="M20 29 V19 M20 21 L14 14 M20 19 L26 13" />
            <circle cx="14" cy="13" r="2" fill={fg} />
            <circle cx="26" cy="12" r="2" fill={fg} />
          </g>
        );
      case 'q':
        return (
          <g stroke={fg} strokeWidth="2" fill="none" strokeLinecap="round">
            <circle cx="20" cy="19" r="7" />
            <path d="M24 23 L28 28" />
          </g>
        );
    }
  })();
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="shrink-0" aria-hidden>
      <defs>
        <radialGradient id={`g-${botId}`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor={`hsl(${h} 45% 30%)`} />
          <stop offset="1" stopColor={`hsl(${h} 50% 12%)`} />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill={`url(#g-${botId})`} stroke={`hsl(${h} 60% 55% / .6)`} strokeWidth="1.5" />
      {motif}
    </svg>
  );
}
