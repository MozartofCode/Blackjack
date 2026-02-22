import { useState } from 'react';

export default function LoginView({ onLogin, onRegister, error, clearError }) {
    const [mode, setMode] = useState('login'); // 'login' or 'register'
    const [playerName, setPlayerName] = useState('');
    const [pin, setPin] = useState('');
    const [localError, setLocalError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e, forcedMode) => {
        if (e) e.preventDefault();
        const activeMode = forcedMode || mode;
        setLocalError('');
        clearError?.();

        if (!playerName.trim()) {
            setLocalError('Enter a player name');
            return;
        }
        if (pin.length !== 4) {
            setLocalError('Password must be 4 digits');
            return;
        }

        setSubmitting(true);
        try {
            if (activeMode === 'register') {
                await onRegister(playerName.trim(), pin);
            } else {
                await onLogin(playerName.trim(), pin);
            }
        } catch {
            // Error handled by parent
        } finally {
            setSubmitting(false);
        }
    };

    const displayError = localError || error;

    return (
        <div className="relative flex h-screen w-full flex-col bg-background-dark overflow-hidden felt-bg">
            {/* Background decorative elements */}
            <div className="absolute -bottom-20 -left-20 pointer-events-none opacity-[0.03]">
                <span className="material-symbols-outlined text-[300px] text-white">playing_cards</span>
            </div>
            <div className="absolute -top-20 -right-20 pointer-events-none opacity-[0.03]">
                <span className="material-symbols-outlined text-[300px] text-white">casino</span>
            </div>

            {/* Header */}
            <div className="flex items-center justify-center p-8 pt-16">
                <div className="flex flex-col items-center">
                    <h2 className="text-xs font-black uppercase tracking-[0.3em] text-primary mb-1">Casino Royale</h2>
                    <h1 className="text-3xl font-light tracking-tight text-white">Welcome Back</h1>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-1 flex-col items-center justify-center px-6 pb-20">
                <div className="glass-card gold-glow w-full max-w-sm rounded-xl p-8 flex flex-col gap-6">
                    <form onSubmit={(e) => handleSubmit(e)} className="flex flex-col gap-6">

                        {/* Player Name */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-primary/80 ml-1">Player Name</label>
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-primary/40 text-lg">person</span>
                                <input
                                    value={playerName}
                                    onChange={(e) => setPlayerName(e.target.value)}
                                    className="w-full rounded-lg bg-black/40 border border-white/10 py-3 pl-10 pr-4 text-sm text-white focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all"
                                    placeholder="Enter your alias"
                                    type="text"
                                    maxLength={20}
                                    required
                                />
                            </div>
                        </div>

                        {/* Password (PIN) */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-primary/80 ml-1">Password</label>
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-primary/40 text-lg">lock</span>
                                <input
                                    value={pin}
                                    onChange={(e) => {
                                        const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                                        setPin(v);
                                    }}
                                    className="w-full rounded-lg bg-black/40 border border-white/10 py-3 pl-10 pr-4 text-sm text-white focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all"
                                    placeholder="4-digit pin"
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={4}
                                    required
                                />
                            </div>
                        </div>

                        {/* Error */}
                        {displayError && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                                <span className="material-symbols-outlined text-red-500 text-sm">error</span>
                                <span className="text-xs font-bold text-red-400">{displayError}</span>
                            </div>
                        )}

                        {/* Buttons */}
                        <div className="flex flex-col gap-3">
                            <button
                                type="submit"
                                onClick={() => setMode('login')}
                                disabled={submitting}
                                className="group relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-white px-6 py-4 transition-transform active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_rgba(255,255,255,0.5)] disabled:opacity-50"
                            >
                                <span className="text-base font-black uppercase tracking-widest text-black">
                                    {submitting && mode === 'login' ? 'Signing In...' : 'Sign In'}
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={(e) => handleSubmit(e, 'register')}
                                disabled={submitting}
                                className="w-full py-3 rounded-lg border border-primary/30 text-primary text-xs font-black uppercase tracking-widest hover:bg-primary/10 transition-all active:scale-95 disabled:opacity-50"
                            >
                                {submitting && mode === 'register' ? 'Creating...' : 'Register New Account'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Subtle info */}
                <p className="mt-8 text-[10px] text-white/20 text-center max-w-xs leading-relaxed">
                    Enter any name and a 4-digit password to begin.
                    Your progress is saved automatically.
                </p>
            </div>

            {/* iOS Home Indicator */}
            <div className="flex justify-center pb-8">
                <div className="h-1.5 w-32 rounded-full bg-white/10"></div>
            </div>
        </div>
    );
}
