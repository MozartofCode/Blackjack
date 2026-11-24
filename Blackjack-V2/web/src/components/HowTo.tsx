import { Modal } from './Modal';

const POINTS = [
  ['🃏', 'One table a day. Same cards for everyone.'],
  ['💰', '20 hands, $1,000. Finish with the most.'],
  ['🤖', 'Four AI bots play the same shoe as you.'],
  ['🏆', 'Share your result and climb the board.'],
];

export function HowTo({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="How to play">
      <ul className="flex flex-col gap-3">
        {POINTS.map(([icon, text]) => (
          <li key={text} className="flex items-center gap-3 text-[15px]">
            <span className="text-2xl">{icon}</span>
            {text}
          </li>
        ))}
      </ul>
      <p className="mt-5 text-xs text-ivory/50">Blackjack pays 3:2 · dealer stands on soft 17 · bets $10–$500</p>
    </Modal>
  );
}
