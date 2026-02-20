export default function LobbyView({ onJoin, stats }) {
    const handleJoin = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const name = formData.get('playerName');
        const buyIn = formData.get('buyIn');
        onJoin(name, buyIn);
    };

    return (
        <div className="relative flex h-screen w-full flex-col bg-background-dark overflow-hidden felt-bg">


            {/* Header */}
            <div className="flex items-center justify-between p-6">
                <div className="flex flex-col">
                    <h2 className="text-xs font-black uppercase tracking-[0.3em] text-primary">Casino Royale</h2>
                    <h1 className="text-2xl font-light tracking-tight text-white">Lobby <span className="font-bold text-white/40">V2</span></h1>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/20 bg-primary/5">
                    <span className="material-symbols-outlined text-primary">account_circle</span>
                </div>
            </div>

            {/* Main Content (Center) */}
            <div className="flex flex-1 flex-col items-center justify-center px-6 pb-20">
                {/* Glassmorphism Join Card */}
                <form onSubmit={handleJoin} className="glass-card gold-glow w-full max-w-sm rounded-xl p-8 flex flex-col gap-6">
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-white">Welcome, High Roller</h3>
                        <p className="mt-1 text-sm text-white/50">Ready to sit at the table?</p>
                    </div>

                    {/* Input Group: Player Name */}
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-primary/80 ml-1">Player Name</label>
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-primary/40 text-lg">person</span>
                            <input
                                name="playerName"
                                className="w-full rounded-lg bg-black/40 border border-white/10 py-3 pl-10 pr-4 text-sm text-white focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all"
                                placeholder="Enter Alias"
                                type="text"
                                defaultValue="Alexander"
                                required
                            />
                        </div>
                    </div>

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
                                defaultValue="$1,000.00"
                            />
                        </div>
                        <div className="mt-1 flex justify-between px-1">
                            <button type="button" className="text-[10px] font-bold text-white/30 hover:text-primary transition-colors">MIN $100</button>
                            <button type="button" className="text-[10px] font-bold text-white/30 hover:text-primary transition-colors">MAX $10K</button>
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

            {/* Bottom Navigation Bar */}
            <div className="mt-auto flex w-full flex-col border-t border-primary/10 bg-matte-black/90 pb-8 pt-2 backdrop-blur-xl">
                <div className="flex px-6">
                    <a className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-primary" href="#">
                        <span className="material-symbols-outlined fill-1">home</span>
                        <p className="text-[10px] font-bold uppercase tracking-widest">Lobby</p>
                    </a>
                    <a className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-white/40 hover:text-primary/60" href="#">
                        <span className="material-symbols-outlined">casino</span>
                        <p className="text-[10px] font-bold uppercase tracking-widest">Tables</p>
                    </a>
                    <a className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-white/40 hover:text-primary/60" href="#">
                        <span className="material-symbols-outlined">history</span>
                        <p className="text-[10px] font-bold uppercase tracking-widest">History</p>
                    </a>
                    <a className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-white/40 hover:text-primary/60" href="#">
                        <span className="material-symbols-outlined">person</span>
                        <p className="text-[10px] font-bold uppercase tracking-widest">Profile</p>
                    </a>
                </div>
                {/* iOS Home Indicator */}
                <div className="mx-auto mt-4 h-1.5 w-32 rounded-full bg-white/10"></div>
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
