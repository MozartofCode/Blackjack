import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const api = axios.create({
    headers: {
        'Content-Type': 'application/json',
    },
});

export const useBlackjack = () => {
    // Session State
    const [session, setSession] = useState(null);
    const [gameState, setGameState] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Metadata
    const [latency, setLatency] = useState(0);
    const [requestId, setRequestId] = useState(null);
    const [globalStats, setGlobalStats] = useState(null);
    const [health, setHealth] = useState(null);

    // Interceptor for Latency & Request ID
    useEffect(() => {
        const responseInterceptor = api.interceptors.response.use(
            (response) => {
                const latencyHeader = response.headers['x-response-time'];
                const reqIdHeader = response.headers['x-request-id'];

                if (latencyHeader) {
                    const lat = parseFloat(latencyHeader.replace('ms', ''));
                    setLatency(lat);
                }
                if (reqIdHeader) setRequestId(reqIdHeader);

                return response;
            },
            (error) => {
                // Also capture headers on error
                if (error.response) {
                    const reqIdHeader = error.response.headers['x-request-id'];
                    if (reqIdHeader) setRequestId(reqIdHeader);
                }
                return Promise.reject(error);
            }
        );

        return () => {
            api.interceptors.response.eject(responseInterceptor);
        };
    }, []);

    // 1. Session Management
    const initSession = useCallback(async () => {
        const storedId = localStorage.getItem('bj_session_id');
        if (storedId) {
            setLoading(true);
            try {
                // Validate session exists
                const { data } = await api.get(`/api/sessions/${storedId}`);
                if (data && data.session) {
                    // Session active -> Load Game State
                    const stateRes = await api.get(`/api/game/${storedId}/state`);
                    setSession(data.session);
                    setGameState(stateRes.data);
                } else {
                    localStorage.removeItem('bj_session_id');
                }
            } catch (err) {
                // 404 means session expired/deleted
                localStorage.removeItem('bj_session_id');
            } finally {
                setLoading(false);
            }
        }
    }, []);

    const createSession = async (playerName, buyIn) => {
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.post('/api/sessions', {
                playerName,
                startingBalance: parseFloat(buyIn.replace(/[^0-9.]/g, ''))
            });
            setSession(data.session);
            setGameState(data);
            localStorage.setItem('bj_session_id', data.session.id);
            return data;
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to join table');
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const leaveSession = async () => {
        if (!session?.id) return;
        setLoading(true);
        try {
            await api.delete(`/api/sessions/${session.id}`);
            setSession(null);
            setGameState(null);
            localStorage.removeItem('bj_session_id');
        } catch (err) {
            console.error("Error leaving session:", err);
        } finally {
            setLoading(false);
        }
    };

    // 2. Game Actions
    const performAction = async (endpoint, body = {}) => {
        if (!session?.id) return;
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.post(`/api/game/${session.id}/${endpoint}`, body);
            setGameState(data);
            return data;
        } catch (err) {
            // If 404, the session expired or the backend restarted — auto-recover
            if (err.response?.status === 404) {
                console.warn('Session not found — backend may have restarted. Returning to lobby.');
                setSession(null);
                setGameState(null);
                localStorage.removeItem('bj_session_id');
                setError('Session expired. Please rejoin the table.');
            } else {
                setError(err.response?.data?.message || 'Action failed');
            }
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const placeBet = (amount) => performAction('begin-round', { bet: amount });
    const hit = () => performAction('hit');
    const stand = () => performAction('stand');
    const double = async () => {
        // Visual double: Hit, then Stand
        // Backend doesn't support atomic double yet, simulating it
        await hit();
        // Only stand if not busted
        // We'll let the UI handle this check based on new gameState
    };
    const houseTurn = () => performAction('house');

    // 3. Polling (Stats & Health)
    const fetchStats = useCallback(async () => {
        try {
            const [statsRes, healthRes] = await Promise.all([
                api.get('/api/stats'),
                api.get('/api/health')
            ]);
            setGlobalStats(statsRes.data);
            setHealth(healthRes.data);
        } catch (err) {
            console.error("Polling failed", err);
        }
    }, []);

    useEffect(() => {
        initSession();
        fetchStats();
        const interval = setInterval(fetchStats, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, [initSession, fetchStats]);

    return {
        session,
        gameState,
        loading,
        error,
        latency,
        requestId,
        globalStats,
        health,
        createSession,
        leaveSession,
        placeBet,
        hit,
        stand,
        houseTurn,
    };
};
