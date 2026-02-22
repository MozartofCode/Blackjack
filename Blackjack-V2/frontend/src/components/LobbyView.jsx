export default function LobbyView({ onJoin, stats, player, onLogout, onHistory }) {
    const handleJoin = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const buyIn = formData.get('buyIn');
        onJoin(player?.player_name || 'Player', buyIn);
    };

    return (
        <div className="relative flex h-screen w-full flex-col bg-background-dark overflow-hidden felt-bg">

            {/* Top Navigation Bar */}
            <div className="flex w-full flex-col border-b border-primary/10 bg-matte-black/90 pt-1 pb-0 backdrop-blur-xl z-10">
                <div className="flex px-4">
                    <button className="flex flex-1 flex-col items-center justify-center gap-1 py-1.5 text-primary border-b-2 border-primary" href="#">
                        <span className="material-symbols-outlined fill-1 text-lg">home</span>
                        <p className="text-[8px] font-black uppercase tracking-widest">Lobby</p>
                    </button>
                    <button onClick={onHistory} className="flex flex-1 flex-col items-center justify-center gap-1 py-1.5 text-white/40 hover:text-primary transition-all active:scale-90">
                        <span className="material-symbols-outlined text-lg">history</span>
                        <p className="text-[8px] font-black uppercase tracking-widest">History</p>
                    </button>
                    <button onClick={onLogout} className="flex flex-1 flex-col items-center justify-center gap-1 py-1.5 text-white/40 hover:text-red-400 transition-all active:scale-90">
                        <span className="material-symbols-outlined text-lg">logout</span>
                        <p className="text-[8px] font-black uppercase tracking-widest">Logout</p>
                    </button>
                </div>
            </div>

            {/* Main Content (Center) */}
            <div className="flex flex-1 flex-col items-center justify-center px-6 pt-4 pb-20">
                {/* Welcome message */}
                <form onSubmit={handleJoin} className="glass-card gold-glow w-full max-w-sm rounded-xl p-8 flex flex-col gap-6">
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-white">Welcome, {player?.player_name || 'High Roller'}</h3>
                        <p className="mt-1 text-sm text-white/50">Ready to sit at the table?</p>
                    </div>

                    {/* Persistent Bank Balance */}
                    <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">Your Bank Balance</span>
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-xl">account_balance_wallet</span>
                            <span className="text-2xl font-black text-white">
                                ${(player?.balance || 1000000).toLocaleString()}
                            </span>
                        </div>
                    </div>

                    {/* Player Stats Preview */}
                    {player && player.total_rounds > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                            <div className="flex flex-col items-center p-2 rounded-lg bg-black/30 border border-white/5">
                                <span className="text-sm font-black text-white">{player.total_rounds}</span>
                                <span className="text-[7px] font-bold uppercase text-white/30">Rounds</span>
                            </div>
                            <div className="flex flex-col items-center p-2 rounded-lg bg-black/30 border border-white/5">
                                <span className="text-sm font-black text-green-400">
                                    {((player.total_wins / player.total_rounds) * 100).toFixed(0)}%
                                </span>
                                <span className="text-[7px] font-bold uppercase text-white/30">Win Rate</span>
                            </div>
                            <div className="flex flex-col items-center p-2 rounded-lg bg-black/30 border border-white/5">
                                <span className={`text-sm font-black ${(player.net_profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {(player.net_profit || 0) >= 0 ? '+' : ''}{player.net_profit || 0}
                                </span>
                                <span className="text-[7px] font-bold uppercase text-white/30">Net P/L</span>
                            </div>
                        </div>
                    )}

                    {/* Input Group: Buy-in */}
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-primary/80 ml-1">Buy-in Amount</label>
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-primary/40 text-lg">payments</span>
                            <input
                                name="buyIn"
                                className="w-full rounded-lg bg-black/40 border border-white/10 py-3 pl-10 pr-4 text-xl font-bold text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                placeholder="0.00"
                                type="text"
                                defaultValue="$1,000,000.00"
                            />
                        </div>
                        <div className="mt-1 flex justify-between px-1">
                            <button type="button" className="text-[10px] font-bold text-white/30 hover:text-primary transition-colors">MIN $100</button>
                            <button type="button" className="text-[10px] font-bold text-white/30 hover:text-primary transition-colors">MAX $1M</button>
                        </div>
                    </div>

                    {/* Sit at Table Button */}
                    <button type="submit" className="group relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-white px-6 py-4 transition-transform active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_rgba(255,255,255,0.5)]">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                        <span className="text-base font-black uppercase tracking-widest text-black">Sit at Table</span>
                    </button>
                </form>

                {/* Table Info Quick View */}
                <div className="mt-8 grid w-full max-w-sm grid-cols-2 gap-4 px-2">
                    <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/5 p-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                            <span className="material-symbols-outlined text-primary text-sm">style</span>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-tighter text-white/40">Deck Size</p>
                            <p className="text-xs font-bold text-white">6 Decks</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/5 p-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                            <span className="material-symbols-outlined text-primary text-sm">percent</span>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-tighter text-white/40">Blackjack</p>
                            <p className="text-xs font-bold text-white">Pays 3:2</p>
                        </div>
                    </div>
                </div>
            </div>


            {/* Decorative Card Suits in Background */}
            <div className="absolute -bottom-20 -left-20 pointer-events-none opacity-[0.03]">
                <span className="material-symbols-outlined text-[300px] text-white">back_hand</span>
            </div>
            <div className="absolute -top-20 -right-20 pointer-events-none opacity-[0.03]">
                <span className="material-symbols-outlined text-[300px] text-white">playing_cards</span>
            </div>
        </div>
    );
}
