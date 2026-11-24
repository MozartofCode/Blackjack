import { motion, useReducedMotion } from 'framer-motion';
import { rankOf, suitOf, type Card as CardT } from '@bj/engine';

const SUIT_CHAR = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;
const SUIT_NAME = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' } as const;
const RANK_LABEL: Record<string, string> = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };
const RANK_NAME: Record<string, string> = { T: '10', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' };

export type CardSize = 'sm' | 'md' | 'lg';

const SIZES: Record<CardSize, string> = {
  sm: 'w-9 h-[52px] rounded-[5px] text-[11px]',
  md: 'w-12 h-[68px] rounded-md text-sm',
  lg: 'w-16 h-[92px] sm:w-[72px] sm:h-[104px] rounded-lg text-lg',
};

interface Props {
  card: CardT | null;
  size?: CardSize;
  index?: number;
  dim?: boolean;
}

/** A playing card drawn in code. `card = null` renders the back (hole card). */
export function Card({ card, size = 'md', index = 0, dim }: Props) {
  const reduce = useReducedMotion();
  const red = card ? suitOf(card) === 'H' || suitOf(card) === 'D' : false;
  const label = card ? `${RANK_NAME[rankOf(card)] ?? rankOf(card)} of ${SUIT_NAME[suitOf(card)]}` : 'Face-down card';

  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: -140, x: 60, rotate: 18, scale: 0.85 }}
      animate={{ opacity: dim ? 0.55 : 1, y: 0, x: 0, rotate: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30, delay: reduce ? 0 : index * 0.02 }}
      className={`relative shrink-0 ${SIZES[size]}`}
      style={{ perspective: 600 }}
      role="img"
      aria-label={label}
    >
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ rotateY: card ? 0 : 180 }}
        transition={{ duration: reduce ? 0 : 0.45, ease: [0.3, 0.7, 0.3, 1] }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Face */}
        <div
          className={`card-face absolute inset-0 rounded-[inherit] ${red ? 'text-ruby' : 'text-ink'}`}
          style={{ backfaceVisibility: 'hidden', borderRadius: 'inherit' }}
        >
          {card && (
            <>
              <div className="absolute top-[6%] left-[9%] flex flex-col items-center leading-none font-display font-bold">
                <span>{RANK_LABEL[rankOf(card)] ?? rankOf(card)}</span>
                <span className="text-[0.85em]">{SUIT_CHAR[suitOf(card)]}</span>
              </div>
              <div className="absolute inset-0 flex items-center justify-center text-[2.1em] leading-none opacity-90">
                {SUIT_CHAR[suitOf(card)]}
              </div>
              <div className="absolute right-[9%] bottom-[6%] flex rotate-180 flex-col items-center leading-none font-display font-bold">
                <span>{RANK_LABEL[rankOf(card)] ?? rankOf(card)}</span>
                <span className="text-[0.85em]">{SUIT_CHAR[suitOf(card)]}</span>
              </div>
            </>
          )}
        </div>
        {/* Back */}
        <div
          className="card-back absolute inset-0"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', borderRadius: 'inherit' }}
        />
      </motion.div>
    </motion.div>
  );
}
