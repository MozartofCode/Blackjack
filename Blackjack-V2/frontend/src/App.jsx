import { useState, useEffect } from 'react';
import { useBlackjack } from './hooks/useBlackjack';
import LobbyView from './components/LobbyView';
import GameTable from './components/GameTable';

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
        error
    } = useBlackjack();

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
                    // If hit causes bust, the useEffect below will trigger houseTurn
                    break;

                case 'stand':
                    await stand();
                    // House turn triggered by GameTable after visual bots play
                    break;

                case 'double':
                    // Visual Double: Hit once, then Stand.
                    const hitState = await hit();
                    // Only stand/finish if didn't bust on the hit
                    if (!hitState.computed.isPlayerBust) {
                        await stand();
                    }
                    // House turn triggered by GameTable after visual bots play
                    break;

                case 'house':
                    await houseTurn();
                    break;

                case 'leave':
                    await leaveSession();
                    break;

                default:
                    console.warn(`Unknown action: ${action}`);
            }
        } catch (err) {
            console.error("Game Action Error:", err);
            // Error is already captured in hook state
        }
    };

    // ─── Render ────────────────────────────────────────────────────────

    return (
        <div className="font-display antialiased text-white bg-background-dark min-h-screen">
            {loading && session && <LoadingOverlay />} {/* Only overlay if mid-game, lobby handles its own */}

            {error && <ErrorToast error={error} requestId={requestId} onRetry={() => window.location.reload()} />}

            {!session ? (
                <LobbyView
                    onJoin={createSession}
                    stats={globalStats}
                />
            ) : (
                <GameTable
                    session={session}
                    gameState={gameState}
                    onAction={handleAction}
                    latency={latency}
                    requestId={requestId}
                />
            )}
        </div>
    );
}

export default App;
