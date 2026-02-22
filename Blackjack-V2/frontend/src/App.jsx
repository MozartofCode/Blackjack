import { useState } from 'react';
import { useBlackjack } from './hooks/useBlackjack';
import { useAuth } from './hooks/useAuth';
import LoginView from './components/LoginView';
import LobbyView from './components/LobbyView';
import GameTable from './components/GameTable';
import HistoryView from './components/HistoryView';

// Loading Component
const LoadingOverlay = () => (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
            <p className="text-white font-bold tracking-widest text-xs uppercase animate-pulse">Connecting to VIP Server...</p>
        </div>
    </div>
);

// Error Component
const ErrorToast = ({ error, requestId, onRetry }) => (
    <div className="fixed top-4 right-4 z-[110] bg-red-900/90 border border-red-500 text-white px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 animate-bounce">
        <span className="material-symbols-outlined">error</span>
        <div className="flex flex-col">
            <span className="text-sm font-bold">{error}</span>
            <span className="text-[10px] opacity-70">Trace: {requestId?.slice(0, 8)}</span>
        </div>
        <button onClick={onRetry} className="ml-2 text-xs underline opacity-50">Retry</button>
    </div>
);

function App() {
    const {
        player,
        loading: authLoading,
        error: authError,
        history,
        historyLoading,
        register,
        login,
        logout,
        refreshProfile,
        fetchHistory,
        clearError: clearAuthError,
    } = useAuth();

    const {
        session,
        gameState,
        createSession,
        leaveSession,
        placeBet,
        hit,
        stand,
        houseTurn,
        latency,
        requestId,
        globalStats,
        loading,
        error,
        fetchBots,
        recordBotRound,
        getBotHistory,
    } = useBlackjack();

    const [view, setView] = useState('lobby'); // 'lobby' | 'history'

    // ─── Game Loop Logic ───────────────────────────────────────────────

    const handleAction = async (action, payload) => {
        try {
            switch (action) {
                case 'bet':
                    const betAmount = parseInt(payload) || 50;
                    await placeBet(betAmount);
                    break;

                case 'hit':
                    await hit();
                    break;

                case 'stand':
                    await stand();
                    break;

                case 'double':
                    const hitState = await hit();
                    if (!hitState.computed.isPlayerBust) {
                        await stand();
                    }
                    break;

                case 'house':
                    await houseTurn();
                    // Refresh player profile after round ends (stats update)
                    setTimeout(() => refreshProfile(), 1000);
                    break;

                case 'leave':
                    await leaveSession();
                    refreshProfile();
                    setView('lobby');
                    break;

                default:
                    console.warn(`Unknown action: ${action}`);
            }
        } catch (err) {
            console.error("Game Action Error:", err);
        }
    };

    const handleJoin = async (name, buyIn) => {
        // Use the logged-in player's name
        await createSession(player?.player_name || name, buyIn);
    };

    const handleLogout = () => {
        if (session) {
            leaveSession();
        }
        logout();
        setView('lobby');
    };

    // ─── Render ────────────────────────────────────────────────────────

    // Auth loading
    if (authLoading) {
        return (
            <div className="font-display antialiased text-white bg-background-dark min-h-screen flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
            </div>
        );
    }

    // Not logged in → Show login
    if (!player) {
        return (
            <div className="font-display antialiased text-white bg-background-dark min-h-screen">
                <LoginView
                    onLogin={login}
                    onRegister={register}
                    error={authError}
                    clearError={clearAuthError}
                />
            </div>
        );
    }

    return (
        <div className="font-display antialiased text-white bg-background-dark min-h-screen">
            {loading && session && <LoadingOverlay />}

            {error && <ErrorToast error={error} requestId={requestId} onRetry={() => window.location.reload()} />}

            {/* History View */}
            {view === 'history' && !session && (
                <HistoryView
                    player={player}
                    history={history}
                    historyLoading={historyLoading}
                    fetchHistory={fetchHistory}
                    onBack={() => setView('lobby')}
                />
            )}

            {/* Lobby View */}
            {view === 'lobby' && !session && (
                <LobbyView
                    onJoin={handleJoin}
                    stats={globalStats}
                    player={player}
                    onLogout={handleLogout}
                    onHistory={() => setView('history')}
                />
            )}

            {/* Game Table */}
            {session && (
                <GameTable
                    session={session}
                    gameState={gameState}
                    onAction={handleAction}
                    latency={latency}
                    requestId={requestId}
                    fetchBots={fetchBots}
                    recordBotRound={recordBotRound}
                    getBotHistory={getBotHistory}
                />
            )}
        </div>
    );
}

export default App;
