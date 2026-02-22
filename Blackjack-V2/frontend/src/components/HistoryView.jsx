import { useEffect } from 'react';

const outcomeLabels = {
    player_blackjack: { text: 'Blackjack!', color: 'text-yellow-400', icon: 'stars' },
    player_win: { text: 'Win', color: 'text-green-400', icon: 'check_circle' },
    house_bust: { text: 'Win', color: 'text-green-400', icon: 'check_circle' },
    house_win: { text: 'Loss', color: 'text-red-400', icon: 'cancel' },
    player_bust: { text: 'Bust', color: 'text-red-400', icon: 'cancel' },
    push: { text: 'Push', color: 'text-white/50', icon: 'horizontal_rule' },
};

function formatDate(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;

    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMoney(amount) {
    if (amount >= 0) return `+$${amount.toLocaleString()}`;
    return `-$${Math.abs(amount).toLocaleString()}`;
}

export default function HistoryView({ player, history, historyLoading, fetchHistory, onBack }) {
    useEffect(() => {
        if (player?.id) {
            fetchHistory(50, 0);
        }
    }, [player?.id]);

    const winRate = player?.total_rounds > 0
        ? ((player.total_wins / player.total_rounds) * 100).toFixed(1)
        : '0.0';

    return (
        <div className="relative flex h-screen w-full flex-col bg-background-dark overflow-hidden felt-bg">
            {/* Background effects */}
            <div className="absolute -bottom-20 -left-20 pointer-events-none opacity-[0.03]">
                <span className="material-symbols-outlined text-[300px] text-white">history</span>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between p-6">
                <button
                    onClick={onBack}
                    className="flex items-center gap-1 text-white/40 hover:text-white transition-colors"
                >
                    <span className="material-symbols-outlined text-lg">arrow_back</span>
                    <span className="text-xs font-bold uppercase tracking-widest">Lobby</span>
                </button>
                <div className="flex flex-col items-end">
                    <h2 className="text-xs font-black uppercase tracking-[0.3em] text-primary">Game History</h2>
                    <p className="text-[10px] text-white/30 font-bold">{player?.player_name}</p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="px-6 mb-4">
                <div className="grid grid-cols-4 gap-2">
                    <div className="flex flex-col items-center p-3 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-lg font-black text-white">{player?.total_rounds || 0}</span>
                        <span className="text-[8px] font-bold uppercase tracking-wider text-white/30">Rounds</span>
                    </div>
                    <div className="flex flex-col items-center p-3 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-lg font-black text-green-400">{player?.total_wins || 0}</span>
                        <span className="text-[8px] font-bold uppercase tracking-wider text-white/30">Wins</span>
                    </div>
                    <div className="flex flex-col items-center p-3 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-lg font-black text-white">{winRate}%</span>
                        <span className="text-[8px] font-bold uppercase tracking-wider text-white/30">Win Rate</span>
                    </div>
                    <div className="flex flex-col items-center p-3 rounded-lg bg-white/5 border border-white/5">
                        <span className={`text-lg font-black ${(player?.net_profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatMoney(player?.net_profit || 0)}
                        </span>
                        <span className="text-[8px] font-bold uppercase tracking-wider text-white/30">Net P/L</span>
                    </div>
                </div>

                {/* Extra stats row */}
                <div className="grid grid-cols-3 gap-2 mt-2">
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
                        <span className="material-symbols-outlined text-yellow-400 text-sm">stars</span>
                        <div>
                            <span className="text-xs font-bold text-white">{player?.total_blackjacks || 0}</span>
                            <span className="text-[8px] text-white/30 ml-1">Blackjacks</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
                        <span className="material-symbols-outlined text-green-400 text-sm">trending_up</span>
                        <div>
                            <span className="text-xs font-bold text-green-400">{formatMoney(player?.biggest_win || 0)}</span>
                            <span className="text-[8px] text-white/30 ml-1">Best</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
                        <span className="material-symbols-outlined text-red-400 text-sm">trending_down</span>
                        <div>
                            <span className="text-xs font-bold text-red-400">{formatMoney(player?.biggest_loss || 0)}</span>
                            <span className="text-[8px] text-white/30 ml-1">Worst</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Round History List */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">Round History</h3>

                {historyLoading && (
                    <div className="flex items-center justify-center py-12">
                        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                    </div>
                )}

                {!historyLoading && (!history?.rounds || history.rounds.length === 0) && (
                    <div className="flex flex-col items-center justify-center py-16 text-white/20">
                        <span className="material-symbols-outlined text-5xl mb-3">casino</span>
                        <p className="text-sm font-bold">No rounds played yet</p>
                        <p className="text-[10px] mt-1">Head to the lobby and start playing!</p>
                    </div>
                )}

                {history?.rounds?.map((round, idx) => {
                    const outcome = outcomeLabels[round.outcome] || { text: round.outcome, color: 'text-white/50', icon: 'help' };
                    const isWin = round.payout > 0;

                    return (
                        <div
                            key={round.id || idx}
                            className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0"
                        >
                            {/* Outcome icon */}
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isWin ? 'bg-green-500/10' : round.payout === 0 ? 'bg-white/5' : 'bg-red-500/10'
                                }`}>
                                <span className={`material-symbols-outlined text-sm ${outcome.color}`}>
                                    {outcome.icon}
                                </span>
                            </div>

                            {/* Details */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs font-bold ${outcome.color}`}>{outcome.text}</span>
                                    <span className="text-[9px] text-white/20">
                                        {round.player_hand_value} vs {round.house_hand_value}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-white/30">Bet: ${round.bet}</span>
                                    <span className="text-[9px] text-white/20">•</span>
                                    <span className="text-[9px] text-white/30">{formatDate(round.created_at)}</span>
                                </div>
                            </div>

                            {/* Payout */}
                            <div className="text-right">
                                <span className={`text-sm font-black ${isWin ? 'text-green-400' : round.payout === 0 ? 'text-white/30' : 'text-red-400'}`}>
                                    {formatMoney(round.payout)}
                                </span>
                                <p className="text-[8px] text-white/20">Bal: ${round.balance_after?.toLocaleString()}</p>
                            </div>
                        </div>
                    );
                })}

                {history && history.total > history.rounds.length && (
                    <button
                        onClick={() => fetchHistory(50, history.rounds.length)}
                        className="w-full mt-3 py-2 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white/60 hover:bg-white/10 transition-all"
                    >
                        Load More ({history.total - history.rounds.length} remaining)
                    </button>
                )}
            </div>

            {/* Bottom bar */}
            <div className="flex justify-center pb-8 pt-2">
                <div className="h-1.5 w-32 rounded-full bg-white/10"></div>
            </div>
        </div>
    );
}
