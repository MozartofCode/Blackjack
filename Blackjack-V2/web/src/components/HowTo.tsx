import { Modal } from './Modal';

export function HowTo({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="How to play">
      <div className="flex flex-col gap-3 text-sm text-ivory/85">
        <p>
          <b className="text-brass-light">One table a day.</b> Everyone gets the same shuffled shoe. You start with $1,000 in play
          chips and play 20 hands. Your score is the bankroll you finish with.
        </p>
        <p>
          <b className="text-brass-light">Four AI bots sit with you.</b> They play from the same shoe, so their decisions change which
          cards come to you. Tap a bot's nameplate to see how it thinks.
        </p>
        <div>
          <b className="text-brass-light">House rules</b>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ivory/75">
            <li>6 decks, dealer stands on soft 17, blackjack pays 3:2</li>
            <li>Dealer peeks for blackjack with an Ace or 10 showing</li>
            <li>Double on any two cards, including after a split</li>
            <li>Split up to 4 hands; split Aces get one card each</li>
            <li>Late surrender; insurance pays 2:1</li>
            <li>Bets $10–$500 in steps of $10</li>
          </ul>
        </div>
        <p>
          <b className="text-brass-light">Keyboard:</b> H hit · S stand · D double · P split · R surrender · Enter deal / next hand.
        </p>
        <p className="text-ivory/60">Practice and the Bot Lounge are unlimited. Practice has a Coach that shows basic strategy and the Hi-Lo count.</p>
      </div>
    </Modal>
  );
}
