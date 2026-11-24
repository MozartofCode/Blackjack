import { motion } from 'framer-motion';

export const CHIP_VALUES = [10, 50, 100, 500] as const;

const CHIP_COLOR: Record<number, { bg: string; edge: string; text: string }> = {
  10: { bg: '#e9e3d3', edge: '#3a6fd8', text: '#1c2f5c' },
  50: { bg: '#c8363d', edge: '#f5efe0', text: '#fff' },
  100: { bg: '#1d1d1f', edge: '#d4a24c', text: '#f0c977' },
  500: { bg: '#6b3fa0', edge: '#f0c977', text: '#fff' },
};

function colorFor(amount: number) {
  const tier = [...CHIP_VALUES].reverse().find((v) => amount >= v) ?? 10;
  return CHIP_COLOR[tier];
}

export function chipLabel(amount: number) {
  return amount >= 1000 ? `${amount / 1000}k` : String(amount);
}

/** A single casino chip. */
export function ChipFace({ amount, size = 44 }: { amount: number; size?: number }) {
  const c = colorFor(amount);
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden>
      <circle cx="22" cy="22" r="21" fill={c.bg} />
      <circle cx="22" cy="22" r="21" fill="none" stroke={c.edge} strokeWidth="5" strokeDasharray="6.6 4.4" />
      <circle cx="22" cy="22" r="14" fill="none" stroke={c.edge} strokeOpacity=".5" strokeWidth="1" />
      <text x="22" y="26.5" textAnchor="middle" fontSize="12" fontWeight="800" fill={c.text} fontFamily="Manrope, sans-serif">
        {chipLabel(amount)}
      </text>
    </svg>
  );
}

/** Bet marker on the felt. */
export function Chip({ amount, small }: { amount: number; small?: boolean }) {
  return (
    <motion.div
      initial={{ y: 40, opacity: 0, scale: 0.6 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: -20, opacity: 0, scale: 0.6 }}
      className="flex items-center gap-1 drop-shadow-md"
    >
      <ChipFace amount={amount} size={small ? 22 : 28} />
      <span className={`money font-bold text-ivory ${small ? 'text-[10px]' : 'text-xs'}`}>${amount}</span>
    </motion.div>
  );
}
