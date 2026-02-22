import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SUITS = {
    'Spades': '♠',
    'Hearts': '♥',
    'Diamonds': '♦',
    'Clubs': '♣'
};

const BOTS = [
    { id: 1, name: 'Bot 1 - Card Counter', avatar: 'https://i.pravatar.cc/300?u=bot_1_counting' },
    { id: 2, name: 'Bot 2 - NN (Math)', avatar: 'https://i.pravatar.cc/300?u=bot_2_nn' },
    { id: 3, name: 'Bot 3 - NN (Instinct)', avatar: 'https://i.pravatar.cc/300?u=bot_3_nn_player' },
    { id: 5, name: 'Bot 4 - Random Forest', avatar: 'https://i.pravatar.cc/300?u=bot_4_rf' },
    { id: 6, name: 'Bot 5 - Decision Tree', avatar: 'https://i.pravatar.cc/300?u=bot_5_dt' },
    { id: 7, name: 'Bot 6 - RL Bot', avatar: 'https://i.pravatar.cc/300?u=bot_6_rl' },
];

// Player avatar
const PLAYER_AVATAR = 'https://i.pravatar.cc/300?u=player_main_hero';

const OUTCOMES = {
    player_blackjack: 'Blackjack!',
    player_win: 'You Won!',
    house_win: 'House Wins',
    player_bust: 'Bust!',
    house_bust: 'House Bust - You Win!',
    push: 'Push',
    in_progress: ''
};

// Helper: Calculate simple hand value for bots
const calculateBotHand = (cards) => {
    let value = 0;
    let aces = 0;
    for (const card of cards) {
        let valStr = card?.val || (typeof card === 'string' ? card.split(' of ')[0] : '');
        if (['K', 'Q', 'J', 'King', 'Queen', 'Jack'].includes(valStr)) value += 10;
        else if (valStr === 'A' || valStr === 'Ace') aces += 1;
        else value += parseInt(valStr, 10) || 0;
    }
    while (aces > 0) {
        if (value + 11 > 21) value += 1;
        else value += 11;
        aces -= 1;
    }
    return value;
};

// ─── Visual Components ────────────────────────────────────────────────────────

const WinningParticles = () => (
    <div className="absolute inset-0 pointer-events-none z-[60] overflow-hidden">
        {[...Array(20)].map((_, i) => (
            <motion.div
                key={i}
                initial={{ x: "50%", y: "60%", opacity: 1, scale: 0 }}
                animate={{
                    x: `${50 + (Math.random() - 0.5) * 60}%`,
                    y: `${60 + (Math.random() - 0.5) * 60}%`,
                    opacity: 0,
                    scale: Math.random() * 1.5 + 0.5,
                    rotate: Math.random() * 360
                }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="absolute w-2 h-2 bg-primary rounded-full shadow-[0_0_10px_#f4c025]"
            />
        ))}
    </div>
);

const Card = ({ card, hidden, index = 0, isHoleCardReveal = false }) => {
    if (hidden) {
        return (
            <motion.div
                initial={{ x: 200, y: -200, opacity: 0, rotate: 45 }}
                animate={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 20, delay: index * 0.1 }}
                className="w-14 h-20 rounded-lg bg-[#1a1a1a] border-2 border-primary/20 flex items-center justify-center relative shadow-2xl backface-hidden"
            >
                <div className="absolute inset-1 border border-white/5 rounded-md mix-blend-overlay"></div>
                <div className="w-full h-full opacity-30 bg-[radial-gradient(circle_at_center,_#f4c025_0%,_transparent_60%)]"></div>
                <span className="material-symbols-outlined text-primary/40 text-2xl animate-pulse">casino</span>
            </motion.div>
        );
    }

    const val = card?.val || card.split(' of ')[0]; // Handle object or string
    const suitName = card?.suitName || (card.includes?.(' of ') ? card.split(' of ')[1] : 'Spades');

    // Normalize string representation if coming from backend
    const suitSymbol = SUITS[suitName] || suitName;

    const isRed = suitName === 'Hearts' || suitName === 'Diamonds' || suitSymbol === '♥' || suitSymbol === '♦';
    const shortVal = val === '10' ? '10' : val[0];

    return (
        <motion.div
            initial={isHoleCardReveal ? { rotateY: 180, scale: 1.05 } : { x: 300, y: -300, opacity: 0, rotate: 45, scale: 0.5 }}
            animate={{ x: 0, y: 0, opacity: 1, rotate: (Math.random() * 4 - 2), scale: 1, rotateY: 0 }}
            exit={{ y: 100, opacity: 0, scale: 0.9 }}
            transition={isHoleCardReveal
                ? { duration: 0.8, type: "spring", stiffness: 100, damping: 14 }
                : { type: "spring", stiffness: 260, damping: 20, delay: index * 0.1 }
            }
            className="w-14 h-20 rounded-lg bg-white border border-gray-200 flex flex-col p-1 shadow-xl relative z-10"
            style={{ transformStyle: 'preserve-3d' }}
        >
            <div className="flex flex-col h-full justify-between items-center bg-gradient-to-br from-white to-gray-100 rounded">
                <div className="w-full flex justify-start">
                    <div className="flex flex-col items-center leading-none">
                        <span className={`text-[10px] font-black ${isRed ? 'text-red-600' : 'text-black'}`}>{shortVal}</span>
                        <span className={`text-[6px] ${isRed ? 'text-red-600' : 'text-black'}`}>{suitSymbol}</span>
                    </div>
                </div>
                <span className={`text-xl ${isRed ? 'text-red-600' : 'text-black'}`}>{suitSymbol}</span>
                <div className="w-full flex justify-end rotate-180">
                    <div className="flex flex-col items-center leading-none">
                        <span className={`text-[10px] font-black ${isRed ? 'text-red-600' : 'text-black'}`}>{shortVal}</span>
                        <span className={`text-[6px] ${isRed ? 'text-red-600' : 'text-black'}`}>{suitSymbol}</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

// Chip denomination colors
const CHIP_COLORS = {
    5: { bg: '#e53e3e', ring: '#c53030', label: '$5' },
    10: { bg: '#3182ce', ring: '#2b6cb0', label: '$10' },
    25: { bg: '#38a169', ring: '#2f855a', label: '$25' },
    50: { bg: '#d69e2e', ring: '#b7791f', label: '$50' },
    100: { bg: '#1a1a1a', ring: '#333333', label: '$100' },
    500: { bg: '#805ad5', ring: '#6b46c1', label: '$500' },
};

// Break a bet amount into chip denominations
const getChipBreakdown = (amount) => {
    const denoms = [500, 100, 50, 25, 10, 5];
    const chips = [];
    let remaining = Math.floor(amount);
    for (const d of denoms) {
        while (remaining >= d && chips.length < 5) {
            chips.push(d);
            remaining -= d;
        }
    }
    return chips;
};

const BettingChip = ({ denomination = 50, delay = 0, size = 34 }) => {
    const color = CHIP_COLORS[denomination] || CHIP_COLORS[50];
    return (
        <motion.div
            initial={{ y: -50, opacity: 0, rotate: -180, scale: 0.4 }}
            animate={{ y: 0, opacity: 1, rotate: 0, scale: 1 }}
            transition={{ delay, type: 'spring', stiffness: 300, damping: 18 }}
            className="chip-shimmer"
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                background: `conic-gradient(from 0deg, ${color.bg} 0deg, ${color.bg} 45deg, ${color.ring} 45deg, ${color.ring} 90deg, ${color.bg} 90deg, ${color.bg} 135deg, ${color.ring} 135deg, ${color.ring} 180deg, ${color.bg} 180deg, ${color.bg} 225deg, ${color.ring} 225deg, ${color.ring} 270deg, ${color.bg} 270deg, ${color.bg} 315deg, ${color.ring} 315deg, ${color.ring} 360deg)`,
                border: `2.5px solid ${color.ring}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                zIndex: 1,
            }}
        >
            <span style={{
                fontSize: size * 0.28,
                fontWeight: 900,
                color: 'white',
                textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                letterSpacing: '-0.5px',
                lineHeight: 1,
            }}>
                {color.label}
            </span>
            {/* Inner ring detail */}
            <div style={{
                position: 'absolute',
                inset: 3,
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.2)',
                pointerEvents: 'none',
            }} />
        </motion.div>
    );
};

const ChipStack = ({ amount, position = 'center' }) => {
    const chips = getChipBreakdown(amount);
    if (chips.length === 0) return null;

    const alignClass = position === 'left' ? 'items-start' : position === 'right' ? 'items-end' : 'items-center';

    return (
        <div className={`flex flex-col ${alignClass} relative`} style={{ height: Math.min(chips.length * 5 + 34, 60) }}>
            {chips.map((denom, i) => (
                <div
                    key={i}
                    style={{
                        position: 'absolute',
                        bottom: i * 5,
                        zIndex: i,
                    }}
                >
                    <BettingChip denomination={denom} delay={i * 0.08} size={32} />
                </div>
            ))}
        </div>
    );
};

const PlayerChipBadge = ({ name, balance, isActive = false, isPlayer = false }) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`chip-badge rounded-xl px-3 py-2 flex items-center gap-2.5 min-w-[110px] ${isActive ? 'border-primary/50 shadow-[0_0_12px_rgba(244,192,37,0.2)]' : ''
            } ${isPlayer ? 'border-primary/40' : ''}`}
    >
        <div className="chip-icon" style={{ width: 20, height: 20 }} />
        <div className="flex flex-col leading-tight">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isPlayer ? 'text-primary/80' : 'text-white/50'
                }`}>
                {name}
            </span>
            <span className={`text-sm font-black font-mono tabular-nums ${isPlayer ? 'text-primary' : 'text-white'
                }`}>
                ${balance?.toLocaleString()}
            </span>
        </div>
    </motion.div>
);

// Bet spot on the table felt — shows chip stack with animation
const TableBetSpot = ({ amount, show, delay = 0 }) => {
    if (!show || !amount) return null;
    return (
        <motion.div
            initial={{ scale: 0, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay }}
            className="flex flex-col items-center"
        >
            <ChipStack amount={amount} position="center" />
        </motion.div>
    );
};

// Payout animation — chips fly from center to player with a golden glow
const PayoutAnimation = ({ amount, show, onComplete }) => {
    if (!show || !amount) return null;
    const payoutChips = getChipBreakdown(amount);
    return (
        <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center"
        >
            {/* Payout label */}
            <motion.div
                initial={{ scale: 0, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                className="mb-1"
            >
                <span className="text-[10px] font-black text-primary bg-black/80 px-2 py-0.5 rounded-full border border-primary/40 shadow-[0_0_12px_rgba(244,192,37,0.4)]">
                    +${amount}
                </span>
            </motion.div>
            {/* Chips that fly away */}
            <div className="relative" style={{ height: 40, width: 30 }}>
                {payoutChips.map((denom, i) => (
                    <motion.div
                        key={i}
                        initial={{ y: 0, opacity: 1, scale: 1 }}
                        animate={{ y: 100, opacity: 0, scale: 0.5 }}
                        transition={{ delay: 0.4 + i * 0.1, duration: 0.8, ease: 'easeIn' }}
                        style={{ position: 'absolute', bottom: i * 4, zIndex: i }}
                        onAnimationComplete={i === payoutChips.length - 1 ? onComplete : undefined}
                    >
                        <BettingChip denomination={denom} delay={0} size={30} />
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
};

// Bot Stats Modal
const BotStatsModal = ({ bot, history, onClose }) => {
    if (!bot) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full max-w-lg bg-gray-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
            >
                <div className="relative p-6">
                    <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>

                    <div className="flex items-center gap-6 mb-8 mt-2">
                        <div className="size-24 rounded-full border-4 border-primary/20 p-1">
                            <img src={bot.avatar} className="w-full h-full rounded-full object-cover" alt={bot.name} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white">{bot.name}</h2>
                            <p className="text-primary font-bold flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">payments</span>
                                ${bot.balance?.toLocaleString()}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-8">
                        {[
                            { label: 'Rounds Played', value: bot.total_rounds || 0 },
                            { label: 'Total Wins', value: bot.total_wins || 0 },
                            { label: 'Blackjacks', value: bot.total_blackjacks || 0 },
                            { label: 'Net Profit', value: `$${(bot.net_profit || 0).toLocaleString()}`, highlight: (bot.net_profit > 0) },
                        ].map((stat, i) => (
                            <div key={i} className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                <span className="text-[10px] uppercase tracking-wider text-white/40 block mb-1">{stat.label}</span>
                                <span className={`text-xl font-black ${stat.highlight ? 'text-green-400' : 'text-white'}`}>{stat.value}</span>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-white/40 border-b border-white/5 pb-2">Recent Performance</h3>
                        <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                            {history.length === 0 ? (
                                <p className="text-white/20 text-center py-4 text-xs italic">No performance data yet</p>
                            ) : history.map((round) => (
                                <div key={round.id} className="flex items-center justify-between text-[11px] p-3 rounded-xl bg-white/5 border border-white/5">
                                    <div className="flex flex-col">
                                        <span className="text-white/40">{new Date(round.created_at).toLocaleTimeString()}</span>
                                        <span className="text-white font-bold">{round.action_taken} on {round.bot_hand_value}</span>
                                    </div>
                                    <div className="text-right flex flex-col">
                                        <span className={round.payout > 0 ? 'text-green-400 font-bold' : round.payout < 0 ? 'text-red-400 font-bold' : 'text-white/40'}>
                                            {round.payout > 0 ? '+' : ''}${round.payout}
                                        </span>
                                        <span className="text-white/20">vs House {round.house_hand_value}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function GameTable({ session, gameState, onAction, latency, requestId, fetchBots, recordBotRound, getBotHistory }) {
    const { house, player, computed } = gameState || {};
    const isRoundOver = computed?.isRoundOver;
    const isPlaying = !isRoundOver && player?.bet > 0;
    const outcomeText = computed?.outcome ? OUTCOMES[computed.outcome] : '';
    const isWin = computed?.outcome?.includes('win') || computed?.outcome?.includes('blackjack');
    const isPush = computed?.outcome === 'push';

    // Payout animation state
    const [showPayout, setShowPayout] = useState(false);
    const [payoutAmount, setPayoutAmount] = useState(0);
    const lastPayoutRoundRef = useRef(null);

    // Bot State: { [id]: { cards: [], revealed: false, action: null, status: 'waiting' } }
    const [botStates, setBotStates] = useState({});
    const [isBotTurn, setIsBotTurn] = useState(false);
    const [bots, setBots] = useState([]); // Real bots from backend
    const [botBalances, setBotBalances] = useState({});
    const [botBets, setBotBets] = useState({});

    // Bot Stats Modal
    const [selectedBotStats, setSelectedBotStats] = useState(null);
    const [botStatsHistory, setBotStatsHistory] = useState([]);

    // Fetch bots on mount
    useEffect(() => {
        const loadBots = async () => {
            const botData = await fetchBots();
            setBots(botData);
            const initialBalances = {};
            botData.forEach(b => initialBalances[b.id] = b.balance);
            setBotBalances(initialBalances);
        };
        loadBots();
    }, [fetchBots]);

    // Dealer hole card reveal state
    const [dealerRevealed, setDealerRevealed] = useState(false);

    // Betting state
    const [currentBet, setCurrentBet] = useState(50);
    const currentBetRef = useRef(50);
    const hasAutoDealtRef = useRef(false); // prevent double-fire on mount

    // History & Stats State
    const [history, setHistory] = useState([]);
    const [showStats, setShowStats] = useState(false);
    const lastRoundOverRef = useRef(false);

    // Refs for safe async usage
    const isPlayingRef = useRef(isPlaying);
    isPlayingRef.current = isPlaying;

    const generateRandomCard = () => {
        const randVal = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'][Math.floor(Math.random() * 13)];
        const randSuit = ['Spades', 'Hearts', 'Diamonds', 'Clubs'][Math.floor(Math.random() * 4)];
        return { val: randVal, suitName: randSuit };
    };

    // Filter out bots with 0 money
    const activeBots = bots.filter(bot => (botBalances[bot.id] || bot.balance || 0) > 0);

    // Initialize/Reset Bots on Round Start
    useEffect(() => {
        if (isPlaying && !isBotTurn) {
            // Reset dealer reveal state for new round
            setDealerRevealed(false);

            // New round started logic
            const initialBots = {};
            const newBotBets = {};
            activeBots.forEach(bot => {
                initialBots[bot.id] = {
                    cards: [generateRandomCard(), generateRandomCard()],
                    revealed: false,
                    action: '',
                    status: 'waiting'
                };
                // Random bet for each bot (multiples of 25)
                const betOptions = [25, 50, 75, 100, 150, 200, 250, 500];
                newBotBets[bot.id] = betOptions[Math.floor(Math.random() * betOptions.length)];
            });
            setBotStates(initialBots);
            setBotBets(newBotBets);

            // Trigger Left Side Bots (top ones in activeBots) immediately
            runLeftBotsTurn(initialBots, activeBots);
        }
    }, [isPlaying, activeBots.length]); // Re-run if someone gets kicked out

    // ─── Auto-Deal Logic ────────────────────────────────────────────────



    const dealNow = () => {
        handleUserAction('bet', currentBet);
    };

    // No auto-deal on first mount — let the player choose their bet
    useEffect(() => {
        if (!isPlaying && !isRoundOver && !hasAutoDealtRef.current && player?.money > 0) {
            hasAutoDealtRef.current = true;
            // Don't auto-deal, just let user pick bet and click deal
        }
    }, [session?.id]);





    // Auto-stand when player hits 21 or busts
    useEffect(() => {
        if (!isPlaying || isRoundOver) return;
        const handVal = computed?.playerHandValue || 0;
        if (handVal >= 21) {
            // Small delay so the card animation completes
            const timer = setTimeout(() => {
                if (computed?.isPlayerBust) {
                    handlePlayerFinish();
                } else {
                    // Player hit exactly 21, auto-stand
                    handleUserAction('stand');
                }
            }, 600);
            return () => clearTimeout(timer);
        }
    }, [computed?.playerHandValue, isPlaying, isRoundOver]);

    // Track History
    useEffect(() => {
        // Detect edge: Round Over became true
        if (isRoundOver && !lastRoundOverRef.current) {
            const result = computed?.outcome || 'Unknown';
            const profit = result.includes('win') || result.includes('blackjack')
                ? (result.includes('blackjack') ? player.bet * 1.5 : player.bet)
                : (result === 'push' ? 0 : -player.bet);

            const newEntry = {
                id: Date.now(),
                result: OUTCOMES[result] || result,
                profit: profit,
                hand: computed?.playerHandValue,
                time: new Date().toLocaleTimeString()
            };

            setHistory(prev => [newEntry, ...prev]);
        }
        lastRoundOverRef.current = isRoundOver;
    }, [isRoundOver, computed, player?.bet]);

    // Payout animation trigger & Bot Result Recording
    useEffect(() => {
        if (isRoundOver && player?.bet > 0) {
            const roundKey = `${Date.now()}`;
            if (lastPayoutRoundRef.current !== roundKey) {
                lastPayoutRoundRef.current = roundKey;

                // 1. Human Payout
                if (isWin) {
                    const payout = computed?.outcome?.includes('blackjack') ? Math.floor(player.bet * 2.5) : player.bet * 2;
                    setTimeout(() => {
                        setPayoutAmount(payout);
                        setShowPayout(true);
                    }, 800);
                }

                // 2. Bot Result Recording
                const houseVal = computed?.houseHandValue || calculateBotHand(house.cards);
                const othersHandValues = bots.map(b => calculateBotHand(botStates[b.id]?.cards || []));
                const houseUpCard = house?.cards?.[0] || 'Unknown';

                bots.forEach(bot => {
                    const botState = botStates[bot.id];
                    if (!botState || !botState.revealed) return;

                    const botVal = calculateBotHand(botState.cards);
                    let botOutcome = 'push';
                    let botPayout = 0;
                    const botBet = botBets[bot.id] || 0;

                    if (botVal > 21) {
                        botOutcome = 'player_bust';
                        botPayout = -botBet;
                    } else if (houseVal > 21) {
                        botOutcome = 'house_bust';
                        botPayout = botBet;
                    } else if (botVal > houseVal) {
                        botOutcome = 'player_win';
                        botPayout = botBet;
                    } else if (botVal < houseVal) {
                        botOutcome = 'house_win';
                        botPayout = -botBet;
                    }

                    // Update local balance
                    setBotBalances(prev => ({ ...prev, [bot.id]: (prev[bot.id] || 0) + botPayout }));

                    // Record to backend
                    recordBotRound(bot.id, {
                        payout: botPayout,
                        outcome: botOutcome,
                        handValue: botVal,
                        houseValue: houseVal,
                        action: 'Standard', // Could be dynamic if logic expanded
                        bet: botBet,
                        othersHandValues,
                        houseUpCard: String(houseUpCard)
                    });
                });
            }
        }
        if (!isRoundOver) {
            setShowPayout(false);
            setPayoutAmount(0);
        }
    }, [isRoundOver, isWin, player?.bet, computed?.outcome, bots, botStates, botBets, house?.cards]);

    // Logic for running bots 1, 2, 3
    const runLeftBotsTurn = async (currentStates, activeOnly) => {
        setIsBotTurn(true);
        await new Promise(r => setTimeout(r, 600));

        let newStates = { ...currentStates };
        const leftBots = activeOnly.slice(0, 3);

        for (const bot of leftBots) {
            newStates = await simulateBotLogic(bot.id, newStates);
        }

        setIsBotTurn(false);
    };

    // Helper: calculate the dealer's up-card value (the visible card during play)
    const getDealerUpCardValue = useCallback(() => {
        if (!house?.cards || house.cards.length < 1) return 0;
        // Card 0 is the up card (visible)
        const card = house.cards[0];
        const rank = typeof card === 'string' ? card.split(' of ')[0] : card;
        if (['Jack', 'Queen', 'King', 'J', 'Q', 'K'].includes(rank)) return 10;
        if (['Ace', 'A'].includes(rank)) return 11;
        return parseInt(rank, 10) || 0;
    }, [house?.cards]);

    // Check if dealer already beats all players (human + bots) — house rule optimization
    const doesDealerBeatAllPlayers = useCallback((dealerVal) => {
        if (dealerVal > 21) return false; // dealer bust doesn't count as winning

        // Check human player
        const playerVal = computed?.playerHandValue || 0;
        if (playerVal <= 21 && playerVal >= dealerVal) return false; // player not beaten

        // Check all bots
        for (const bot of activeBots) {
            const botState = botStates[bot.id];
            if (botState?.cards) {
                const botVal = calculateBotHand(botState.cards);
                if (botVal <= 21 && botVal >= dealerVal) return false; // bot not beaten
            }
        }

        return true; // dealer beats everyone
    }, [computed?.playerHandValue, botStates]);

    // Dealer cards reveal staging
    const [visibleHouseCards, setVisibleHouseCards] = useState([]);

    useEffect(() => {
        if (!house?.cards) return;

        if (!dealerRevealed && !isRoundOver) {
            // Initial deal: just show first two (one will be hidden by Card logic)
            setVisibleHouseCards(house.cards.slice(0, 2));
        } else {
            // Reveal or Round Over: sync cards one by one
            const targetCards = house.cards;
            if (visibleHouseCards.length < targetCards.length) {
                const timeout = setTimeout(() => {
                    setVisibleHouseCards(targetCards.slice(0, visibleHouseCards.length + 1));
                }, 600);
                return () => clearTimeout(timeout);
            } else if (visibleHouseCards.length > targetCards.length) {
                // New round reset
                setVisibleHouseCards(targetCards.slice(0, 2));
            }
        }
    }, [house?.cards, dealerRevealed, isRoundOver, visibleHouseCards.length]);

    // Logic for running bots 5, 6, 7
    const runRightBotsTurn = async () => {
        setIsBotTurn(true);
        let newStates = { ...botStates };
        const rightBots = activeBots.slice(3);
        for (const bot of rightBots) {
            newStates = await simulateBotLogic(bot.id, newStates);
        }
        setIsBotTurn(false);

        // ─── Dealer Reveal Sequence ─────────────────────────────
        // 1. Reveal the hole card with smooth animation
        setDealerRevealed(true);
        await new Promise(r => setTimeout(r, 1500)); // Wait for flip to be seen

        // 2. Clear house turn in backend (will add hits to house.cards)
        onAction('house');
    };

    const simulateBotLogic = async (botId, currentStates) => {
        // Reveal
        let state = { ...currentStates };
        state[botId] = { ...state[botId], revealed: true, action: 'Thinking...' };
        setBotStates({ ...state });
        await new Promise(r => setTimeout(r, 1000));

        // Logic Loop
        while (true) {
            const handVal = calculateBotHand(state[botId].cards);
            if (handVal < 17) {
                // Hit
                state[botId].action = 'Hit';
                setBotStates({ ...state });
                await new Promise(r => setTimeout(r, 800)); // Show "Hit" bubble

                state[botId].cards.push(generateRandomCard());
                state[botId].action = '';
                setBotStates({ ...state });
                await new Promise(r => setTimeout(r, 500));
            } else {
                // Stand
                state[botId].action = 'Stand';
                setBotStates({ ...state });
                await new Promise(r => setTimeout(r, 800));
                break;
            }
        }
        state[botId].action = ''; // Clear bubble
        setBotStates({ ...state });
        return state;
    };

    const handlePlayerFinish = () => {
        // Trigger right bots
        runRightBotsTurn();
    };

    // Intercepted Actions
    const handleUserAction = (type, val) => {
        if (type === 'stand') {
            onAction('stand'); // Mark player as done in backend
            handlePlayerFinish(); // Run right bots -> then house
        } else if (type === 'double') {
            // Handle double visually (hit -> done)
            onAction('double');
            // If double doesn't bust, we need to trigger finish.
            // We rely on 'double' action in App.jsx calling stand()?
            // Actually App.jsx calls stand calls house.
            // Updated App.jsx removes house call.
            // So we just need to detect end of turn.
            // Double usually ends turn automatically.
            setTimeout(() => handlePlayerFinish(), 1500); // Wait for hit card
        } else {
            onAction(type, val);
        }
    };

    return (
        <div className="relative flex h-screen w-full flex-col bg-[#0f0f0f] overflow-hidden font-display">
            {/* Ambient Spotlight */}
            <div className={`absolute inset-0 transition-opacity duration-1000 pointer-events-none ${isPlaying ? 'bg-[radial-gradient(circle_at_50%_70%,_rgba(255,255,255,0.03),_transparent_40%)]' : 'bg-[radial-gradient(circle_at_50%_30%,_rgba(255,255,255,0.03),_transparent_40%)]'}`}></div>

            {/* Win Particles */}
            {isWin && isRoundOver && <WinningParticles />}

            {/* Header / Exit Button */}
            <div className="absolute top-6 right-6 z-[100]">
                <button
                    onClick={() => onAction('leave')}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-black/40 hover:bg-black/60 border border-white/10 hover:border-primary/40 backdrop-blur-md transition-all text-white text-[10px] font-black uppercase tracking-widest shadow-2xl group"
                >
                    <span className="material-symbols-outlined text-sm text-primary/60 group-hover:text-primary transition-colors">logout</span>
                    Exit Table
                </button>
            </div>

            {/* Main Table Area */}
            <main className="relative flex-1 felt-gradient overflow-hidden flex flex-col items-center perspective-[1000px]">

                {/* Dealer Area */}
                <div className="relative z-10 flex flex-col items-center mt-10 transition-all duration-500 w-full">
                    <div className="text-[10px] uppercase tracking-[0.4em] text-white/40 mb-5 font-black border-b border-white/5 pb-1">Dealer</div>
                    <div className="flex space-x-[-15px] relative min-h-[110px] justify-center w-full">
                        <AnimatePresence mode="popLayout">
                            {visibleHouseCards.map((card, i) => {
                                // Card 0 = up card (always visible)
                                // Card 1 = hole card (hidden until dealer reveal)
                                // Cards 2+ = hit cards (always visible, dealt after reveal)
                                const isHoleCard = i === 1;
                                const shouldHide = isHoleCard && !dealerRevealed && !isRoundOver;
                                const isHoleReveal = isHoleCard && (dealerRevealed || isRoundOver);

                                if (shouldHide) {
                                    return <Card key={`hole-hidden-${i}`} hidden index={i} />;
                                }

                                return (
                                    <Card
                                        key={`${card}-${i}`}
                                        card={card}
                                        index={i}
                                        isHoleCardReveal={isHoleReveal}
                                    />
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Center Table Logo */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] opacity-5 pointer-events-none flex flex-col items-center select-none">
                    <span className="material-symbols-outlined text-[120px] text-primary">playing_cards</span>
                    <h1 className="text-4xl font-black uppercase tracking-[0.2em] text-primary mt-4 text-center">Casino<br />Royale</h1>
                </div>

                {/* ─── Table Bet Spots (on the felt) ─────────────────────── */}
                <AnimatePresence>
                    {/* Bot bet spots */}
                    {activeBots.map((bot) => (
                        <div key={`bet-${bot.id}`} className={`absolute bet-spot-${bot.id} z-30 pointer-events-none`}>
                            <TableBetSpot amount={botBets[bot.id]} show={isPlaying} delay={bot.id * 0.1} />
                        </div>
                    ))}
                    {/* Player bet spot */}
                    <div className="absolute bet-spot-4 z-30 pointer-events-none">
                        <TableBetSpot amount={player?.bet} show={isPlaying && player?.bet > 0} delay={0.05} />
                    </div>
                </AnimatePresence>

                {/* ─── Payout Animation (on win) ─────────────────────── */}
                <AnimatePresence>
                    {showPayout && (
                        <motion.div
                            key="payout-anim"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute bet-spot-4 z-40 pointer-events-none"
                        >
                            <PayoutAnimation
                                amount={payoutAmount}
                                show={showPayout}
                                onComplete={() => setShowPayout(false)}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Left Bots (Seats 1-3) */}
                {activeBots.slice(0, 3).map((bot, i) => (
                    <div key={bot.id} className={`absolute seat-${bot.id} flex items-center gap-4 transition-all duration-300 ${botStates[bot.id]?.action ? 'scale-105 z-20' : ''}`}>
                        <div className="flex flex-col items-center">
                            <div
                                className="size-20 rounded-full bg-gradient-to-br from-gray-500 to-gray-900 border-[3px] border-primary/40 p-[2px] shadow-[0_0_20px_rgba(0,0,0,0.7)] relative z-10 cursor-pointer hover:scale-110 transition-transform"
                                onClick={async () => {
                                    const history = await getBotHistory(bot.id);
                                    setBotStatsHistory(history);
                                    setSelectedBotStats(bot);
                                }}
                            >
                                <img alt={bot.name} className="w-full h-full rounded-full object-cover brightness-110 contrast-110 saturate-110" src={bot.avatar} />
                                <div className={`absolute bottom-0 right-0 w-4 h-4 border-2 border-black rounded-full ${botStates[bot.id]?.revealed ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-500'}`}></div>
                            </div>
                            {/* Chip Badge */}
                            <div className="mt-1.5">
                                <PlayerChipBadge
                                    name={bot.name}
                                    balance={botBalances[bot.id]}
                                    isActive={!!botStates[bot.id]?.action}
                                />
                            </div>
                        </div>

                        {/* Cards (To the Right) */}
                        <div className="flex flex-col items-start gap-1">
                            {botStates[bot.id]?.action && (
                                <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-primary/20 text-primary text-[8px] font-black px-1.5 py-0.5 rounded border border-primary/40 uppercase">
                                    {botStates[bot.id].action}
                                </motion.div>
                            )}
                            <div className="flex space-x-[-22px] min-h-[40px]">
                                <AnimatePresence>
                                    {botStates[bot.id]?.cards?.map((card, idx) => (
                                        <div key={idx} className="relative">
                                            <Card card={card} hidden={!botStates[bot.id]?.revealed} index={idx} />
                                        </div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>
                ))}

                {/* Player Seat (Seat 4 - You) */}
                <div className="absolute seat-4 z-20 flex flex-col items-center">
                    {/* Avatar + Badge ABOVE cards */}
                    <div className="flex items-center gap-3 mb-3">
                        {/* Player avatar */}
                        <div className="relative cursor-pointer group" onClick={() => setShowStats(true)}>
                            <div className="absolute -inset-1.5 bg-gradient-to-r from-primary to-yellow-200 rounded-full blur opacity-30 group-hover:opacity-60 transition duration-500"></div>
                            <div className="size-20 rounded-full bg-gradient-to-br from-gray-500 to-gray-900 border-[3px] border-primary/60 p-[2px] relative z-10 shadow-[0_0_20px_rgba(244,192,37,0.2)] group-hover:scale-105 transition-transform">
                                <img alt="You" className="w-full h-full rounded-full object-cover brightness-110 contrast-110 saturate-110" src={PLAYER_AVATAR} />
                                <div className="absolute bottom-0 right-0 w-4 h-4 border-2 border-black rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                            </div>
                            <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/10">
                                View Stats
                            </div>
                        </div>
                        {/* Player Chip Badge */}
                        <PlayerChipBadge
                            name="You"
                            balance={player?.money}
                            isPlayer={true}
                            isActive={isPlaying}
                        />
                    </div>

                    {/* Hand value badge */}
                    <AnimatePresence>
                        {player?.cards?.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.5, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                key={computed?.playerHandValue}
                                className="mb-1 z-40"
                            >
                                <div className="px-4 py-1.5 rounded-full bg-primary text-black font-black text-sm shadow-[0_0_24px_rgba(244,192,37,0.5)] border-2 border-white/20">
                                    {computed?.playerHandValue}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Cards */}
                    <div className="flex items-end gap-2 relative min-h-[80px]">
                        <AnimatePresence>
                            {player?.cards?.map((card, i) => (
                                <Card key={`${card}-${i}`} card={card} index={i} />
                            ))}
                        </AnimatePresence>
                    </div>

                    {/* ─── Contextual HUD (Option 2: Floating under cards) ──────────────── */}
                    <div className="mt-6 w-full flex justify-center">
                        <AnimatePresence mode="wait">
                            {!isPlaying ? (
                                /* Betting HUD */
                                <motion.div
                                    key="betting-hud"
                                    initial={{ y: 20, opacity: 0, scale: 0.8 }}
                                    animate={{ y: 0, opacity: 1, scale: 1 }}
                                    exit={{ y: 20, opacity: 0, scale: 0.8 }}
                                    className="flex items-center gap-8 bg-black/40 backdrop-blur-md px-6 py-4 rounded-full border border-white/5 shadow-2xl"
                                >
                                    {/* Chip Selection Area */}
                                    <div className="flex flex-col gap-2">
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 text-center">Select Bet</span>
                                        <div className="flex gap-2 items-end">
                                            {[
                                                { val: 25, bg: '#dc2626', ring: '#991b1b', edge: '#fca5a5' },
                                                { val: 50, bg: '#2563eb', ring: '#1e40af', edge: '#93c5fd' },
                                                { val: 100, bg: '#16a34a', ring: '#166534', edge: '#86efac' },
                                                { val: 250, bg: '#9333ea', ring: '#6b21a8', edge: '#c4b5fd' },
                                                { val: 500, bg: '#0f0f0f', ring: '#404040', edge: '#a3a3a3' },
                                            ].map((chip, i) => (
                                                <motion.button
                                                    key={chip.val}
                                                    whileHover={{ y: -8, scale: 1.1 }}
                                                    whileTap={{ scale: 0.9 }}
                                                    animate={currentBet === chip.val ? { y: -12, scale: 1.25 } : { y: 0, scale: 1 }}
                                                    onClick={() => { setCurrentBet(chip.val); currentBetRef.current = chip.val; }}
                                                    className="relative group"
                                                >
                                                    {currentBet === chip.val && (
                                                        <motion.div layoutId="chip-glow" className="absolute -inset-2 rounded-full bg-primary/20 blur-md shadow-[0_0_20px_rgba(244,192,37,0.4)]" />
                                                    )}
                                                    <div
                                                        className="w-11 h-11 rounded-full border-[3px] flex items-center justify-center relative z-10"
                                                        style={{
                                                            background: `conic-gradient(from 0deg, ${chip.bg} 0deg, ${chip.bg} 30deg, ${chip.edge} 30deg, ${chip.edge} 36deg, ${chip.bg} 36deg, ${chip.bg} 66deg, ${chip.edge} 66deg, ${chip.edge} 72deg, ${chip.bg} 72deg, ${chip.bg} 102deg, ${chip.edge} 102deg, ${chip.edge} 108deg, ${chip.bg} 108deg, ${chip.bg} 138deg, ${chip.edge} 138deg, ${chip.edge} 144deg, ${chip.bg} 144deg, ${chip.bg} 174deg, ${chip.edge} 174deg, ${chip.edge} 180deg, ${chip.bg} 180deg, ${chip.bg} 210deg, ${chip.edge} 210deg, ${chip.edge} 216deg, ${chip.bg} 216deg, ${chip.bg} 246deg, ${chip.edge} 246deg, ${chip.edge} 252deg, ${chip.bg} 252deg, ${chip.bg} 282deg, ${chip.edge} 282deg, ${chip.edge} 288deg, ${chip.bg} 288deg, ${chip.bg} 318deg, ${chip.edge} 318deg, ${chip.edge} 324deg, ${chip.bg} 324deg, ${chip.bg} 360deg)`,
                                                            borderColor: chip.ring
                                                        }}
                                                    >
                                                        <div className="w-7 h-7 rounded-full bg-black/20 flex items-center justify-center border border-white/10 shadow-inner">
                                                            <span className="text-[10px] font-black text-white">${chip.val}</span>
                                                        </div>
                                                    </div>
                                                </motion.button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Small Circular Deal Button */}
                                    <div className="flex flex-col gap-2 items-center">
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">Deal</span>
                                        <motion.button
                                            whileHover={{ scale: 1.1, boxShadow: '0 0 30px rgba(244,192,37,0.6)' }}
                                            whileTap={{ scale: 0.9 }}
                                            onClick={dealNow}
                                            className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-yellow-600 text-black shadow-[0_10px_20px_rgba(0,0,0,0.4)] flex flex-col items-center justify-center border-2 border-white/20 group"
                                        >
                                            <span className="material-symbols-outlined text-3xl font-black group-hover:rotate-12 transition-transform">playing_cards</span>
                                            <span className="text-[9px] font-black uppercase tracking-tighter -mt-1">Bet ${currentBet}</span>
                                        </motion.button>
                                    </div>
                                </motion.div>
                            ) : (
                                /* Gameplay HUD (Circular Glass Buttons) */
                                !isBotTurn && (
                                    <motion.div
                                        key="gameplay-hud"
                                        initial={{ scale: 0, opacity: 0, rotate: -10 }}
                                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                        exit={{ scale: 0, opacity: 0, rotate: 10 }}
                                        className="flex items-center gap-6"
                                    >
                                        {/* Double Down */}
                                        <div className="flex flex-col items-center gap-1.5 group">
                                            <motion.button
                                                whileHover={{ y: -5, scale: 1.1 }}
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => handleUserAction('double')}
                                                className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-xl group-hover:bg-white/10 group-hover:border-white/30 transition-all shadow-xl"
                                            >
                                                <span className="text-xl font-black text-white/80 group-hover:text-white">2X</span>
                                            </motion.button>
                                            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest group-hover:text-white/80">Double</span>
                                        </div>

                                        {/* HIT (Central, Bloom Animation) */}
                                        <div className="flex flex-col items-center gap-1.5 group">
                                            <motion.button
                                                whileHover={{ y: -8, scale: 1.15 }}
                                                whileTap={{ scale: 0.95 }}
                                                initial={{ scale: 0.8 }}
                                                animate={{ scale: [0.8, 1.1, 1] }}
                                                transition={{ duration: 0.4 }}
                                                onClick={() => handleUserAction('hit')}
                                                className="w-20 h-20 rounded-full bg-green-500 text-white flex items-center justify-center shadow-[0_0_30px_rgba(34,197,94,0.4)] hover:shadow-[0_0_50px_rgba(34,197,94,0.6)] border-4 border-white/20 transition-all"
                                            >
                                                <span className="material-symbols-outlined text-4xl font-black">add_circle</span>
                                            </motion.button>
                                            <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">Hit</span>
                                        </div>

                                        {/* STAND */}
                                        <div className="flex flex-col items-center gap-1.5 group">
                                            <motion.button
                                                whileHover={{ y: -5, scale: 1.1 }}
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => handleUserAction('stand')}
                                                className="w-16 h-16 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center backdrop-blur-xl hover:bg-red-500/20 hover:border-red-500 group-hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all"
                                            >
                                                <span className="material-symbols-outlined text-3xl text-red-500 font-black">back_hand</span>
                                            </motion.button>
                                            <span className="text-[9px] font-bold text-red-500/60 uppercase tracking-widest group-hover:text-red-500">Stand</span>
                                        </div>
                                    </motion.div>
                                )
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Right Bots (Seats 5-7) */}
                {activeBots.slice(3).map((bot, i) => (
                    <div key={bot.id} className={`absolute seat-${bot.id + 1} flex flex-row-reverse items-center gap-4 transition-all duration-300 ${botStates[bot.id]?.action ? 'scale-105 z-20' : ''}`}>
                        <div className="flex flex-col items-center">
                            <div
                                className="size-20 rounded-full bg-gradient-to-br from-gray-500 to-gray-900 border-[3px] border-primary/40 p-[2px] shadow-[0_0_20px_rgba(0,0,0,0.7)] relative z-10 cursor-pointer hover:scale-110 transition-transform"
                                onClick={async () => {
                                    const history = await getBotHistory(bot.id);
                                    setBotStatsHistory(history);
                                    setSelectedBotStats(bot);
                                }}
                            >
                                <img alt={bot.name} className="w-full h-full rounded-full object-cover brightness-110 contrast-110 saturate-110" src={bot.avatar} />
                                <div className={`absolute bottom-0 right-0 w-4 h-4 border-2 border-black rounded-full ${botStates[bot.id]?.revealed ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-500'}`}></div>
                            </div>
                            {/* Chip Badge */}
                            <div className="mt-1.5">
                                <PlayerChipBadge
                                    name={bot.name}
                                    balance={botBalances[bot.id]}
                                    isActive={!!botStates[bot.id]?.action}
                                />
                            </div>
                        </div>

                        {/* Cards (To the Left) */}
                        <div className="flex flex-col items-end gap-1">
                            {botStates[bot.id]?.action && (
                                <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-primary/20 text-primary text-[8px] font-black px-1.5 py-0.5 rounded border border-primary/40 uppercase">
                                    {botStates[bot.id].action}
                                </motion.div>
                            )}
                            <div className="flex space-x-[-22px] min-h-[40px] flex-row-reverse">
                                <AnimatePresence>
                                    {botStates[bot.id]?.cards?.map((card, idx) => (
                                        <div key={idx} className="relative">
                                            <Card card={card} hidden={!botStates[bot.id]?.revealed} index={idx} />
                                        </div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>
                ))}
            </main>

            {/* Result Overlay - Centered */}
            <AnimatePresence>
                {isRoundOver && outcomeText && (
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none"
                    >
                        <div className={`
                            px-8 py-4 rounded-2xl border flex flex-col items-center gap-1 transform -translate-y-12 backdrop-blur-sm
                            ${isWin ? 'bg-black/60 border-primary/40 text-primary shadow-[0_0_30px_rgba(244,192,37,0.1)]' : 'bg-black/60 border-red-500/40 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.1)]'}
                        `}>
                            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40 mb-1">{isWin ? 'Winner' : 'Round Over'}</span>
                            <span className="text-3xl md:text-4xl font-black uppercase tracking-widest drop-shadow-lg text-center leading-tight">
                                {outcomeText}
                            </span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>



            {/* Stats Modal */}
            <AnimatePresence>
                {showStats && (
                    <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowStats(false)}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="w-full max-w-md bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-6 border-b border-white/5 bg-gradient-to-br from-white/5 to-transparent flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-bold text-white">Session Stats</h2>
                                    <p className="text-xs text-white/40 uppercase tracking-widest mt-1">ID: {session?.id?.slice(0, 8)}...</p>
                                </div>
                                <button onClick={() => setShowStats(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                    <span className="material-symbols-outlined text-white/60">close</span>
                                </button>
                            </div>

                            <div className="grid grid-cols-3 gap-2 p-4 bg-black/20">
                                <div className="bg-white/5 rounded-lg p-3 flex flex-col items-center">
                                    <span className="text-[10px] text-white/40 uppercase font-bold">Hands</span>
                                    <span className="text-lg font-black text-white">{history.length}</span>
                                </div>
                                <div className="bg-white/5 rounded-lg p-3 flex flex-col items-center">
                                    <span className="text-[10px] text-white/40 uppercase font-bold">Net</span>
                                    <span className={`text-lg font-black ${history.reduce((acc, curr) => acc + curr.profit, 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        ${history.reduce((acc, curr) => acc + curr.profit, 0).toLocaleString()}
                                    </span>
                                </div>
                                <div className="bg-white/5 rounded-lg p-3 flex flex-col items-center">
                                    <span className="text-[10px] text-white/40 uppercase font-bold">Win Rate</span>
                                    <span className="text-lg font-black text-primary">
                                        {history.length > 0
                                            ? Math.round((history.filter(h => h.profit > 0).length / history.length) * 100) + '%'
                                            : '--'}
                                    </span>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-2 px-2">Recent History</h3>
                                {history.length === 0 ? (
                                    <div className="text-center py-8 text-white/20 text-sm">No hands played yet</div>
                                ) : (
                                    history.map((entry) => (
                                        <div key={entry.id} className="flex justify-between items-center bg-white/5 p-3 rounded-lg border border-white/5 hover:bg-white/10 transition-colors">
                                            <div className="flex flex-col">
                                                <span className={`text-sm font-bold ${entry.profit > 0 ? 'text-green-400' : entry.profit < 0 ? 'text-red-400' : 'text-white/60'}`}>
                                                    {entry.result}
                                                </span>
                                                <span className="text-[10px] text-white/30">{entry.time} • Hand: {entry.hand}</span>
                                            </div>
                                            <span className={`font-mono font-bold ${entry.profit > 0 ? 'text-green-500' : entry.profit < 0 ? 'text-red-500' : 'text-white/40'}`}>
                                                {entry.profit > 0 ? '+' : ''}{entry.profit}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Bot Profile Modal */}
            <AnimatePresence>
                {selectedBotStats && (
                    <BotStatsModal
                        bot={{ ...selectedBotStats, balance: botBalances[selectedBotStats.id] }}
                        history={botStatsHistory}
                        onClose={() => setSelectedBotStats(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
