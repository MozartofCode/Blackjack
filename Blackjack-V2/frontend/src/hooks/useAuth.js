import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const api = axios.create({
    headers: { 'Content-Type': 'application/json' },
});

export const useAuth = () => {
    const [player, setPlayer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [history, setHistory] = useState(null);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Restore player from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem('bj_player');
        if (stored) {
            try {
                setPlayer(JSON.parse(stored));
            } catch {
                localStorage.removeItem('bj_player');
            }
        }
        setLoading(false);
    }, []);

    const register = async (playerName, pin) => {
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.post('/api/auth/register', { playerName, pin });
            setPlayer(data.player);
            localStorage.setItem('bj_player', JSON.stringify(data.player));
            return data.player;
        } catch (err) {
            const msg = err.response?.data?.message || 'Registration failed';
            setError(msg);
            throw new Error(msg);
        } finally {
            setLoading(false);
        }
    };

    const login = async (playerName, pin) => {
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.post('/api/auth/login', { playerName, pin });
            setPlayer(data.player);
            localStorage.setItem('bj_player', JSON.stringify(data.player));
            return data.player;
        } catch (err) {
            const msg = err.response?.data?.message || 'Login failed';
            setError(msg);
            throw new Error(msg);
        } finally {
            setLoading(false);
        }
    };

    const logout = () => {
        setPlayer(null);
        setHistory(null);
        localStorage.removeItem('bj_player');
        localStorage.removeItem('bj_session_id');
    };

    const refreshProfile = useCallback(async () => {
        if (!player?.id) return;
        try {
            const { data } = await api.get(`/api/players/${player.id}/profile`);
            const updated = data.player;
            setPlayer(updated);
            localStorage.setItem('bj_player', JSON.stringify(updated));
        } catch (err) {
            console.error('Failed to refresh profile', err);
        }
    }, [player?.id]);

    const fetchHistory = useCallback(async (limit = 50, offset = 0) => {
        if (!player?.id) return;
        setHistoryLoading(true);
        try {
            const { data } = await api.get(`/api/players/${player.id}/history?limit=${limit}&offset=${offset}`);
            setHistory(data);
        } catch (err) {
            console.error('Failed to fetch history', err);
        } finally {
            setHistoryLoading(false);
        }
    }, [player?.id]);

    return {
        player,
        loading,
        error,
        history,
        historyLoading,
        register,
        login,
        logout,
        refreshProfile,
        fetchHistory,
        clearError: () => setError(null),
    };
};
