import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SUITS = {
    'Spades': '♠',
    'Hearts': '♥',
    'Diamonds': '♦',
    'Clubs': '♣'
};

const BOTS = [
    { id: 1, name: 'S_Vegas', avatar: 'https://i.pravatar.cc/150?u=1' },
    { id: 2, name: 'User_992', avatar: 'https://i.pravatar.cc/150?u=2' },
    { id: 3, name: 'Player_22', avatar: 'https://i.pravatar.cc/150?u=3' },
    { id: 5, name: 'L_Royale', avatar: 'https://i.pravatar.cc/150?u=5' },
    { id: 6, name: 'King_88', avatar: 'https://i.pravatar.cc/150?u=6' },
    { id: 7, name: 'Ace_Hi', avatar: 'https://i.pravatar.cc/150?u=7' },
];

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
        let valStr = card.val;
        if (['K', 'Q', 'J'].includes(valStr)) value += 10;
        else if (valStr === 'A') aces += 1;
        else value += parseInt(valStr, 10);
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
            initial={isHoleCardReveal ? { rotateY: 180 } : { x: 300, y: -300, opacity: 0, rotate: 45, scale: 0.5 }}
            animate={{ x: 0, y: 0, opacity: 1, rotate: (Math.random() * 4 - 2), scale: 1, rotateY: 0 }}
            exit={{ y: 100, opacity: 0, scale: 0.9 }}
            transition={isHoleCardReveal
                ? { duration: 0.6, type: "spring" }
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

// ─── Main Component ──────────────────────────────────────────────────────────

export default function GameTable({ session, gameState, onAction, latency, requestId }) {
    const { house, player, computed } = gameState || {};
    const isRoundOver = computed?.isRoundOver;
    const isPlaying = !isRoundOver && player?.bet > 0;
    const outcomeText = computed?.outcome ? OUTCOMES[computed.outcome] : '';
    const isWin = computed?.outcome?.includes('win') || computed?.outcome?.includes('blackjack');

    // Bot State: { [id]: { cards: [], revealed: false, action: null, status: 'waiting' } }
    const [botStates, setBotStates] = useState({});
    const [isBotTurn, setIsBotTurn] = useState(false); // Helper to block UI if needed
    // Random initial balances for bots
    const [botBalances] = useState(() => {
        const bals = {};
        BOTS.forEach(b => bals[b.id] = Math.floor(Math.random() * 8000) + 500);
        return bals;
    });

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

    // Initialize/Reset Bots on Round Start
    useEffect(() => {
        if (isPlaying && !isBotTurn) {
            // New round started logic
            const initialBots = {};
            BOTS.forEach(bot => {
                initialBots[bot.id] = {
                    cards: [generateRandomCard(), generateRandomCard()], // 2 hidden cards
                    revealed: false,
                    action: '',
                    status: 'waiting'
                };
            });
            setBotStates(initialBots);

            // Trigger Left Side Bots (1, 2, 3) immediately
            runLeftBotsTurn(initialBots);
        }
    }, [isPlaying]);

    // Handle Player Bust / Stand for Right Side Bots
    useEffect(() => {
        if (computed?.isPlayerBust && !computed?.isRoundOver) {
            // Player busted, trigger end sequence
            handlePlayerFinish();
        }
    }, [computed?.isPlayerBust]);

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

    // Logic for running bots 1, 2, 3
    const runLeftBotsTurn = async (currentStates) => {
        setIsBotTurn(true); // Maybe block user? Or just let them play parallel. 
        // User requested "their cards are not visible first".
        // Let's reveal/play them one by one.

        // Slight delay for dealing animation
        await new Promise(r => setTimeout(r, 600));

        // Clone state to modify
        let newStates = { ...currentStates };

        for (const bot of BOTS.slice(0, 3)) { // 1, 2, 3
            newStates = await simulateBotLogic(bot.id, newStates);
        }

        setIsBotTurn(false); // User can definitely play now strictly
    };

    // Logic for running bots 5, 6, 7
    const runRightBotsTurn = async () => {
        setIsBotTurn(true);
        let newStates = { ...botStates };
        for (const bot of BOTS.slice(3)) { // 5, 6, 7
            newStates = await simulateBotLogic(bot.id, newStates);
        }
        setIsBotTurn(false);
        // After right bots, call House Turn
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

            {/* Header */}
            <header className="relative z-50 flex items-center justify-between px-4 pt-4 pb-2 bg-gradient-to-b from-black/80 to-transparent">
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-widest text-primary/60 font-bold">Total Balance</span>
                    <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-primary text-sm shadow-glow">payments</span>
                        <span className="text-xl font-black tracking-tight text-white drop-shadow-md">
                            ${player?.money ? player.money.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
                        </span>
                    </div>
                </div>
                <div className="absolute left-1/2 -translate-x-1/2 top-4 flex flex-col items-center">
                    <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/60 border border-primary/20 shadow-lg backdrop-blur-sm">
                        <span className="text-[10px] font-bold text-primary tracking-wider">BET</span>
                        <span className="text-sm font-black text-white">
                            ${player?.bet ? player.bet.toFixed(2) : '0.00'}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                        <div className="flex items-center gap-1.5">
                            <motion.span
                                animate={{ opacity: [0.5, 1, 0.5] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)] ${latency < 200 ? 'bg-green-500' : 'bg-yellow-500'}`}
                            ></motion.span>
                            <span className="text-[10px] font-bold text-white/60 font-mono">{Math.round(latency)}ms</span>
                        </div>
                        <span className="text-[9px] uppercase tracking-tighter text-white/40">Secured</span>
                    </div>
                </div>
            </header>

            {/* Main Table Area */}
            <main className="relative flex-1 felt-gradient overflow-hidden flex flex-col items-center perspective-[1000px]">
                {/* Dealer Shoe Visual */}
                <div className="absolute -right-12 top-[-50px] w-40 h-60 bg-black/40 rotate-12 rounded-xl border border-white/5 z-0"></div>

                {/* Dealer Area */}
                <div className="relative z-10 flex flex-col items-center mt-12 transition-all duration-500">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-white/30 mb-4 font-bold">Dealer</div>
                    <div className="flex gap-[-40px]">
                        <div className="flex gap-2 relative min-h-[100px] min-w-[120px] justify-center">
                            <AnimatePresence mode="popLayout">
                                {house?.cards?.map((card, i) => {
                                    const isHoleReveal = isRoundOver && i === 1;
                                    return (
                                        <Card key={`${card}-${i}`} card={card} index={i} isHoleCardReveal={isHoleReveal} />
                                    );
                                })}
                            </AnimatePresence>
                            {!isRoundOver && house?.cards?.length > 0 && <Card hidden index={1} />}
                        </div>
                    </div>

                    <AnimatePresence>
                        {isRoundOver && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-2 px-3 py-1 rounded-full bg-black/60 border border-white/10 backdrop-blur-md text-[10px] font-bold text-white shadow-xl"
                            >
                                {computed?.houseHandValue}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Center Table Logo */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] opacity-5 pointer-events-none flex flex-col items-center select-none">
                    <span className="material-symbols-outlined text-[120px] text-primary">playing_cards</span>
                    <h1 className="text-4xl font-black uppercase tracking-[0.2em] text-primary mt-4 text-center">Casino<br />Royale</h1>
                </div>

                {/* Left Bots (Seats 1-3) */}
                {BOTS.slice(0, 3).map((bot, i) => (
                    <div key={bot.id} className={`absolute seat-${bot.id} flex flex-col items-center gap-2 transition-all duration-300 ${botStates[bot.id]?.action ? 'scale-105 z-20' : 'scale-90 opacity-70'}`}>
                        <AnimatePresence>
                            {botStates[bot.id]?.action && (
                                <motion.div
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: -40, opacity: 1 }}
                                    exit={{ y: 0, opacity: 0 }}
                                    className="absolute -top-10 z-50 bg-white text-black px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-xl"
                                >
                                    {botStates[bot.id].action}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="flex flex-col items-center">
                            <div className="size-10 rounded-full bg-gradient-to-tr from-gray-800 to-black border border-white/10 p-0.5 shadow-lg relative z-10">
                                <img alt="" className="w-full h-full rounded-full object-cover grayscale opacity-70" src={bot.avatar} />
                                <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-black rounded-full ${botStates[bot.id]?.revealed ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                            </div>
                            <div className="mt-1 px-1.5 py-0.5 rounded bg-black/50 border border-white/5 backdrop-blur-sm">
                                <span className="text-[8px] font-mono font-bold text-white/50">${botBalances[bot.id]?.toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="flex -mt-2 space-x-[-15px] min-h-[40px]">
                            <AnimatePresence>
                                {botStates[bot.id]?.cards?.map((card, idx) => (
                                    <div key={idx} className="relative">
                                        <Card card={card} hidden={!botStates[bot.id]?.revealed} index={idx} />
                                    </div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                ))}

                {/* Player Seat (Seat 4 - You) */}
                <div className="absolute seat-4 z-20 flex flex-col items-center top-[60%]">
                    <AnimatePresence>
                        {player?.cards?.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.5, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                key={computed?.playerHandValue}
                                className="absolute -top-8 z-40"
                            >
                                <div className="px-4 py-1.5 rounded-full bg-primary text-black font-black text-sm shadow-[0_0_20px_rgba(244,192,37,0.5)] border-2 border-white/20">
                                    {computed?.playerHandValue}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="flex gap-2 mb-6 relative min-h-[100px]">
                        <AnimatePresence>
                            {player?.cards?.map((card, i) => (
                                <Card key={`${card}-${i}`} card={card} index={i} />
                            ))}
                        </AnimatePresence>
                    </div>

                    <div className="flex flex-col items-center gap-1 group cursor-pointer" onClick={() => setShowStats(true)}>
                        <div className="relative">
                            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-yellow-200 rounded-full blur opacity-20 group-hover:opacity-60 transition duration-500"></div>
                            <div className="size-14 rounded-full border-2 border-primary/50 bg-[#121212] p-1 relative z-10 shadow-2xl group-hover:scale-105 transition-transform">
                                <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                                    <span className="material-symbols-outlined text-primary text-2xl">person</span>
                                </div>
                            </div>
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/10">
                                View Stats
                            </div>
                        </div>
                        <div className="py-1 px-3 mt-1 rounded-full bg-primary/10 border border-primary/30 text-[10px] font-black text-primary uppercase tracking-wider backdrop-blur-md group-hover:bg-primary group-hover:text-black transition-colors">
                            You
                        </div>
                    </div>
                </div>

                {/* Right Bots (Seats 5-7) */}
                {BOTS.slice(3).map((bot, i) => (
                    <div key={bot.id} className={`absolute seat-${bot.id} flex flex-col items-center gap-2 transition-all duration-300 ${botStates[bot.id]?.action ? 'scale-105 z-20' : 'scale-90 opacity-70'}`}>
                        <AnimatePresence>
                            {botStates[bot.id]?.action && (
                                <motion.div
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: -40, opacity: 1 }}
                                    exit={{ y: 0, opacity: 0 }}
                                    className="absolute -top-10 z-50 bg-white text-black px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-xl"
                                >
                                    {botStates[bot.id].action}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="flex flex-col items-center">
                            <div className="size-10 rounded-full bg-gradient-to-tr from-gray-800 to-black border border-white/10 p-0.5 shadow-lg relative z-10">
                                <img alt="" className="w-full h-full rounded-full object-cover grayscale opacity-70" src={bot.avatar} />
                                <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-black rounded-full ${botStates[bot.id]?.revealed ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                            </div>
                            <div className="mt-1 px-1.5 py-0.5 rounded bg-black/50 border border-white/5 backdrop-blur-sm">
                                <span className="text-[8px] font-mono font-bold text-white/50">${botBalances[bot.id]?.toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="flex -mt-2 space-x-[-15px] min-h-[40px]">
                            <AnimatePresence>
                                {botStates[bot.id]?.cards?.map((card, idx) => (
                                    <div key={idx} className="relative">
                                        <Card card={card} hidden={!botStates[bot.id]?.revealed} index={idx} />
                                    </div>
                                ))}
                            </AnimatePresence>
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

            {/* Controls */}
            <section className="glass-panel mx-4 mb-6 rounded-2xl p-1 flex flex-col gap-4 relative z-50 shadow-[0_4px_30px_rgba(0,0,0,0.5)] border border-white/10">

                <div className="p-4 bg-black/40 rounded-xl">
                    <div className="flex gap-3 h-14 relative overflow-hidden">
                        <AnimatePresence mode="wait">
                            {!isPlaying ? (
                                <motion.form
                                    key="bet-form"
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{ y: -20, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        const val = e.currentTarget.elements.betInput.value;
                                        handleUserAction('bet', val);
                                    }}
                                    className="flex w-full gap-3 absolute inset-0"
                                >
                                    <div className="relative group">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 font-bold">$</span>
                                        <input
                                            name="betInput"
                                            type="number"
                                            min="10"
                                            step="10"
                                            defaultValue="50"
                                            className="w-28 pl-6 h-full rounded-xl bg-white/5 border border-white/10 text-xl font-bold text-white focus:border-primary focus:bg-white/10 outline-none transition-all text-center"
                                        />
                                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 bg-[#1a1a1a] text-[9px] text-white/40 uppercase font-bold tracking-wider pointer-events-none">Wager</div>
                                    </div>
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.95 }}
                                        type="submit"
                                        className="flex-1 rounded-xl bg-gradient-to-r from-primary to-yellow-400 text-black flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(244,192,37,0.3)] hover:shadow-[0_0_30px_rgba(244,192,37,0.5)] transition-shadow"
                                    >
                                        <span className="material-symbols-outlined font-black">playing_cards</span>
                                        <span className="text-lg font-black uppercase tracking-tight">Deal Cards</span>
                                    </motion.button>
                                </motion.form>
                            ) : (
                                <motion.div
                                    key="game-controls"
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{ y: 20, opacity: 0 }}
                                    transition={{ duration: 0.2, delay: 0.1 }}
                                    className="flex w-full gap-3 absolute inset-0"
                                >
                                    <motion.button
                                        whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }}
                                        onClick={() => handleUserAction('double')}
                                        disabled={isBotTurn}
                                        className={`flex-1 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center hover:bg-white/10 transition-colors group ${isBotTurn ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        <span className="text-[9px] font-bold text-white/40 uppercase group-hover:text-white/80">Double</span>
                                        <span className="text-base font-black tracking-wide text-white">2X</span>
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }}
                                        onClick={() => handleUserAction('hit')}
                                        disabled={isBotTurn}
                                        className={`flex-[1.5] rounded-xl bg-green-500 text-white flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(34,197,94,0.4)] hover:bg-green-400 hover:shadow-[0_0_25px_rgba(34,197,94,0.6)] transition-all ${isBotTurn ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        <span className="material-symbols-outlined font-black text-2xl">add_circle</span>
                                        <span className="text-lg font-black uppercase tracking-tight">Hit</span>
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }}
                                        onClick={() => handleUserAction('stand')}
                                        disabled={isBotTurn}
                                        className={`flex-[1.5] rounded-xl border-2 border-red-500/20 bg-red-500/10 text-red-500 flex items-center justify-center gap-2 hover:bg-red-500/20 hover:border-red-500/40 transition-all ${isBotTurn ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        <span className="material-symbols-outlined font-black text-2xl">back_hand</span>
                                        <span className="text-lg font-black uppercase tracking-tight">Stand</span>
                                    </motion.button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <div className="flex justify-between items-center px-4 pb-2">
                    <button onClick={() => onAction('leave')} className="flex items-center gap-1 opacity-40 hover:opacity-100 transition-opacity text-white text-[10px] font-bold uppercase tracking-widest">
                        <span className="material-symbols-outlined text-sm">logout</span>
                        Exit Table
                    </button>
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Live Session</span>
                    </div>
                </div>
            </section>

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
        </div>
    );
}
