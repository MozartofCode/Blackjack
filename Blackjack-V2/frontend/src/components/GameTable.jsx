import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SUITS = {
    'Spades': '♠',
    'Hearts': '♥',
    'Diamonds': '♦',
    'Clubs': '♣'
};

// Simulated Bot Data
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

// ─── Visual Components ────────────────────────────────────────────────────────

const WinningParticles = () => (
    <div className="absolute inset-0 pointer-events-none z-[60] overflow-hidden">
        {[...Array(20)].map((_, i) => (
            <motion.div
                key={i}
                initial={{
                    x: "50%",
                    y: "60%",
                    opacity: 1,
                    scale: 0
                }}
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

// Advanced 3D Card
const Card = ({ card, hidden, index = 0, isHoleCardReveal = false }) => {
    // If it's the hidden card placeholder
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

    const [val, suit] = card.split(' of ');
    const isRed = suit === 'Hearts' || suit === 'Diamonds';
    const shortVal = val === '10' ? '10' : val[0];

    return (
        <motion.div
            // Fly in from "Shoe" (Top Right off screen implied)
            initial={isHoleCardReveal ? { rotateY: 180 } : { x: 300, y: -300, opacity: 0, rotate: 45, scale: 0.5 }}
            animate={{ x: 0, y: 0, opacity: 1, rotate: (Math.random() * 4 - 2), scale: 1, rotateY: 0 }}
            exit={{ y: 100, opacity: 0, scale: 0.9 }}
            transition={isHoleCardReveal
                ? { duration: 0.6, type: "spring" } // Slow 3D flip for hole card
                : { type: "spring", stiffness: 260, damping: 20, delay: index * 0.1 } // Snappy deal
            }
            className="w-14 h-20 rounded-lg bg-white border border-gray-200 flex flex-col p-1 shadow-xl relative z-10"
            style={{ transformStyle: 'preserve-3d' }}
        >
            {/* Front of Card */}
            <div className="flex flex-col h-full justify-between items-center bg-gradient-to-br from-white to-gray-100 rounded">
                <div className="w-full flex justify-start">
                    <div className="flex flex-col items-center leading-none">
                        <span className={`text-[10px] font-black ${isRed ? 'text-red-600' : 'text-black'}`}>{shortVal}</span>
                        <span className={`text-[8px] ${isRed ? 'text-red-600' : 'text-black'}`}>{SUITS[suit]}</span>
                    </div>
                </div>
                <span className={`text-2xl ${isRed ? 'text-red-600' : 'text-black'}`}>{SUITS[suit]}</span>
                <div className="w-full flex justify-end rotate-180">
                    <div className="flex flex-col items-center leading-none">
                        <span className={`text-[10px] font-black ${isRed ? 'text-red-600' : 'text-black'}`}>{shortVal}</span>
                        <span className={`text-[8px] ${isRed ? 'text-red-600' : 'text-black'}`}>{SUITS[suit]}</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function GameTable({ session, gameState, onAction, latency, requestId }) {
    const [botCards, setBotCards] = useState({});

    useEffect(() => {
        generateBotCards();
        const interval = setInterval(() => { if (Math.random() > 0.7) generateBotCards(); }, 3000);
        return () => clearInterval(interval);
    }, []);

    const generateBotCards = () => {
        const newCards = {};
        BOTS.forEach(bot => { newCards[bot.id] = [generateRandomCard(), generateRandomCard()]; });
        setBotCards(prev => ({ ...prev, ...newCards }));
    };

    const generateRandomCard = () => {
        const randVal = ['A', 'K', 'Q', 'J', '10', '9', '8'][Math.floor(Math.random() * 7)];
        const randSuit = ['♠', '♥', '♦', '♣'][Math.floor(Math.random() * 4)];
        return { val: randVal, suit: randSuit, color: ['♥', '♦'].includes(randSuit) ? 'text-red-600' : 'text-black' };
    };

    const { house, player, computed } = gameState || {};
    const isRoundOver = computed?.isRoundOver;
    const isPlaying = !isRoundOver && player?.bet > 0;
    const outcomeText = computed?.outcome ? OUTCOMES[computed.outcome] : '';
    const isWin = computed?.outcome?.includes('win') || computed?.outcome?.includes('blackjack');

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
                    <button
                        onClick={() => navigator.clipboard.writeText(requestId)}
                        className="p-2 rounded-lg bg-primary/5 hover:bg-primary/20 border border-primary/20 text-primary active:scale-95 transition-all"
                        title="Copy Trace ID"
                    >
                        <span className="material-symbols-outlined text-lg">shield</span>
                    </button>
                </div>
            </header>

            {/* Main Table Area */}
            <main className="relative flex-1 felt-gradient overflow-hidden flex flex-col items-center perspective-[1000px]">
                {/* Dealer Shoe Visual (Source of cards) */}
                <div className="absolute -right-12 top-[-50px] w-40 h-60 bg-black/40 rotate-12 rounded-xl border border-white/5 z-0"></div>

                {/* Dealer Area */}
                <div className="relative z-10 flex flex-col items-center mt-12 transition-all duration-500">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-white/30 mb-4 font-bold">Dealer</div>
                    <div className="flex gap-[-40px]"> {/* Negative gap for tight stacking if desired, but regular gap is fine for 2 cards */}
                        <div className="flex gap-2 relative min-h-[100px] min-w-[120px] justify-center">
                            <AnimatePresence mode="popLayout">
                                {house?.cards?.map((card, i) => {
                                    // Identify if this specific card was the hole card
                                    // Logic: It's the 2nd card (index 1) AND round is over.
                                    const isHoleReveal = isRoundOver && i === 1;
                                    return (
                                        <Card key={`${card}-${i}`} card={card} index={i} isHoleCardReveal={isHoleReveal} />
                                    );
                                })}
                            </AnimatePresence>
                            {/* Hole Card Placeholder */}
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

                {/* Simulated Bots (Seats 1-3) */}
                {BOTS.slice(0, 3).map((bot, i) => (
                    <div key={bot.id} className={`absolute seat-${bot.id} flex flex-col items-center gap-2 opacity-50 hover:opacity-100 transition-opacity duration-300 scale-90`}>
                        <div className="size-10 rounded-full bg-gradient-to-tr from-gray-800 to-black border border-white/10 p-0.5 shadow-lg relative">
                            <img alt="" className="w-full h-full rounded-full object-cover grayscale opacity-70" src={bot.avatar} />
                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-black rounded-full"></div>
                        </div>
                        <div className="flex -mt-2 space-x-[-10px]">
                            {botCards[bot.id]?.map((card, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ x: 20 }} animate={{ x: 0 }}
                                    className={`mini-card ${card.color} shadow-md bg-white w-6 h-8 text-[8px] flex items-center justify-center rounded border border-gray-300`}
                                >
                                    {card.val}
                                </motion.div>
                            ))}
                        </div>
                    </div>
                ))}

                {/* Player Seat (Seat 4 - You) */}
                <div className="absolute seat-4 z-20 flex flex-col items-center top-[60%]">
                    {/* Hand Value Badge */}
                    <AnimatePresence>
                        {player?.cards?.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.5, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                key={computed?.playerHandValue} // Re-animate on change
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

                    <div className="flex flex-col items-center gap-1 group">
                        <div className="relative">
                            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-yellow-200 rounded-full blur opacity-20 group-hover:opacity-60 transition duration-500"></div>
                            <div className="size-14 rounded-full border-2 border-primary/50 bg-[#121212] p-1 relative z-10 shadow-2xl">
                                <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                                    <span className="material-symbols-outlined text-primary text-2xl">person</span>
                                </div>
                            </div>
                        </div>
                        <div className="py-1 px-3 mt-1 rounded-full bg-primary/10 border border-primary/30 text-[10px] font-black text-primary uppercase tracking-wider backdrop-blur-md">
                            You
                        </div>
                    </div>
                </div>

                {/* Bots Right Side */}
                {BOTS.slice(3).map((bot, i) => (
                    <div key={bot.id} className={`absolute seat-${bot.id} flex flex-col items-center gap-2 opacity-50 hover:opacity-100 transition-opacity duration-300 scale-90`}>
                        <div className="size-10 rounded-full bg-gradient-to-tr from-gray-800 to-black border border-white/10 p-0.5 shadow-lg relative">
                            <img alt="" className="w-full h-full rounded-full object-cover grayscale opacity-70" src={bot.avatar} />
                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-black rounded-full"></div>
                        </div>
                        <div className="flex -mt-2 space-x-[-10px]">
                            {botCards[bot.id]?.map((card, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ x: -20 }} animate={{ x: 0 }}
                                    className={`mini-card ${card.color} shadow-md bg-white w-6 h-8 text-[8px] flex items-center justify-center rounded border border-gray-300`}
                                >
                                    {card.val}
                                </motion.div>
                            ))}
                        </div>
                    </div>
                ))}
            </main>

            {/* Controls */}
            <section className="glass-panel mx-4 mb-6 rounded-2xl p-1 flex flex-col gap-4 relative z-50 shadow-[0_4px_30px_rgba(0,0,0,0.5)] border border-white/10">
                {/* Result Overlay */}
                <AnimatePresence>
                    {isRoundOver && outcomeText && (
                        <motion.div
                            initial={{ y: 50, opacity: 0, scale: 0.9 }}
                            animate={{ y: -80, opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="absolute left-0 right-0 flex justify-center pointer-events-none z-[100]"
                        >
                            <div className={`
                                px-8 py-3 rounded-xl border-2 backdrop-blur-xl shadow-[0_0_50px_rgba(0,0,0,0.5)]
                                flex flex-col items-center
                                ${isWin ? 'bg-primary/20 border-primary text-primary' : 'bg-red-900/40 border-red-500 text-red-200'}
                            `}>
                                <span className="text-xs font-bold uppercase tracking-widest mb-1 opacity-80">{isWin ? 'Winner' : 'Round Over'}</span>
                                <span className="text-2xl font-black uppercase tracking-widest drop-shadow-lg leading-none whitespace-nowrap">
                                    {outcomeText}
                                </span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="p-4 bg-black/40 rounded-xl">
                    <div className="flex gap-3 h-14">
                        {!isPlaying ? (
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    const val = e.currentTarget.elements.betInput.value;
                                    onAction('bet', val);
                                }}
                                className="flex w-full gap-3"
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
                            </form>
                        ) : (
                            <>
                                <motion.button
                                    whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }}
                                    onClick={() => onAction('double')}
                                    className="flex-1 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center hover:bg-white/10 transition-colors group"
                                >
                                    <span className="text-[9px] font-bold text-white/40 uppercase group-hover:text-white/80">Double</span>
                                    <span className="text-base font-black tracking-wide text-white">2X</span>
                                </motion.button>
                                <motion.button
                                    whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }}
                                    onClick={() => onAction('hit')}
                                    className="flex-[1.5] rounded-xl bg-primary text-black flex items-center justify-center gap-2 shadow-lg hover:brightness-110 transition-all"
                                >
                                    <span className="material-symbols-outlined font-black text-2xl">add_circle</span>
                                    <span className="text-lg font-black uppercase tracking-tight">Hit</span>
                                </motion.button>
                                <motion.button
                                    whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }}
                                    onClick={() => onAction('stand')}
                                    className="flex-[1.5] rounded-xl border-2 border-red-500/20 bg-red-500/10 text-red-500 flex items-center justify-center gap-2 hover:bg-red-500/20 hover:border-red-500/40 transition-all"
                                >
                                    <span className="material-symbols-outlined font-black text-2xl">back_hand</span>
                                    <span className="text-lg font-black uppercase tracking-tight">Stand</span>
                                </motion.button>
                            </>
                        )}
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
        </div>
    );
}
