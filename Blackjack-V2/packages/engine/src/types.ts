import type { Card } from './cards.ts';

export interface TableConfig {
  decks: number;
  /** Reshuffle (between rounds) once this fraction of the shoe is dealt. */
  penetration: number;
  minBet: number;
  maxBet: number;
  /** Bets must be a multiple of this (keeps 3:2 and surrender payouts whole). */
  betStep: number;
  startingBankroll: number;
  /** Round limit; 0 = endless (practice / lounge). */
  maxRounds: number;
  maxHands: number;
  dealerHitsSoft17: boolean;
}

export const DAILY_CONFIG: TableConfig = {
  decks: 6,
  penetration: 0.75,
  minBet: 10,
  maxBet: 500,
  betStep: 10,
  startingBankroll: 1000,
  maxRounds: 20,
  maxHands: 4,
  dealerHitsSoft17: false,
};

export type SeatKind = 'human' | 'bot' | 'empty';

export interface SeatInit {
  kind: SeatKind;
  name: string;
  botId?: string;
  bankroll?: number;
}

export type HandResult = 'win' | 'lose' | 'push' | 'blackjack' | 'surrender' | 'bust';

export interface Hand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  splitAces: boolean;
  surrendered: boolean;
  done: boolean;
  result?: HandResult;
  /** Net win/loss for the hand (excluding insurance). */
  net?: number;
}

export interface Seat {
  id: number;
  kind: SeatKind;
  name: string;
  botId?: string;
  /** Chips not currently on the table. */
  bankroll: number;
  /** Base bet for the current round (0 = not yet bet / sitting out). */
  bet: number;
  insurance: number;
  /** null = not decided yet (only relevant in the insurance phase). */
  insuranceDecided: boolean;
  hands: Hand[];
  sittingOut: boolean;
}

export type Phase = 'betting' | 'insurance' | 'playing' | 'settled' | 'finished';

export interface Shoe {
  cards: Card[];
  pos: number;
  cutAt: number;
  shuffleIndex: number;
}

export interface RoundSummary {
  round: number;
  seat: number;
  bet: number;
  net: number;
  results: HandResult[];
  split: boolean;
  doubled: boolean;
  insurance: number;
}

export interface Decision {
  round: number;
  seat: number;
  hand: number;
  cards: Card[];
  upcard: Card;
  action: PlayAction;
  legal: PlayAction[];
  firstDecision: boolean;
}

export interface TableState {
  config: TableConfig;
  seed: string;
  shoe: Shoe;
  runningCount: number;
  round: number;
  phase: Phase;
  seats: Seat[];
  dealer: { cards: Card[]; holeRevealed: boolean };
  turn: { seat: number; hand: number } | null;
  history: RoundSummary[];
  decisions: Decision[];
}

export type PlayAction = 'hit' | 'stand' | 'double' | 'split' | 'surrender';

export type Action =
  | { type: 'bet'; seat: number; amount: number }
  | { type: 'insurance'; seat: number; take: boolean }
  | { type: PlayAction; seat: number }
  | { type: 'nextRound' };

export type GameEvent =
  | { t: 'shuffle'; shuffleIndex: number }
  | { t: 'bet'; seat: number; amount: number }
  | { t: 'deal'; to: number | 'dealer'; hand: number; card: Card | null }
  | { t: 'insuranceOffer' }
  | { t: 'insurance'; seat: number; amount: number }
  | { t: 'peek'; dealerBlackjack: boolean }
  | { t: 'turn'; seat: number; hand: number }
  | { t: 'action'; seat: number; hand: number; action: PlayAction }
  | { t: 'reveal'; card: Card }
  | { t: 'result'; seat: number; hand: number; result: HandResult; net: number }
  | { t: 'insurancePaid'; seat: number; net: number }
  | { t: 'note'; seat: number; text: string }
  | { t: 'roundEnd'; round: number }
  | { t: 'finished' };

export interface ApplyResult {
  state: TableState;
  events: GameEvent[];
}
