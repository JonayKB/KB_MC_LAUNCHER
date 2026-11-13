import { useEffect, useState } from 'react';
import { fetchPlayerStats, fetchServerStatus, type PlayerStats, type ServerStatus } from '../repositories/ServerRepository';

const STATUS_REFRESH_MS = 60_000;

/**
 * Estado del servidor (se refresca cada minuto mientras la pantalla está abierta) y
 * estadísticas del jugador en él. Las estadísticas se vuelven a pedir al cerrar el juego:
 * el mod las envía al salir del servidor.
 * Si el bot no responde, no se muestra nada: no es un error para el jugador.
 */
export function useServerData(address: string | null, playerName: string | null, playing: boolean) {
    const [status, setStatus] = useState<ServerStatus | null>(null);
    const [stats, setStats] = useState<PlayerStats | null>(null);

    useEffect(() => {
        setStatus(null);
        if (!address) return;
        let cancelled = false;
        const load = () => fetchServerStatus(address)
            .then(s => { if (!cancelled) setStatus(s); })
            .catch(err => console.warn('[useServerData] Estado del servidor no disponible:', err));
        load();
        const id = setInterval(load, STATUS_REFRESH_MS);
        return () => { cancelled = true; clearInterval(id); };
    }, [address]);

    const serverId = status?.id ?? null;
    // Otro servidor u otra cuenta: lo anterior ya no vale
    useEffect(() => setStats(null), [serverId, playerName]);
    useEffect(() => {
        // En partida se conserva lo último; al cerrar el juego se vuelve a pedir
        if (serverId === null || !playerName || playing) return;
        let cancelled = false;
        fetchPlayerStats(serverId, playerName)
            .then(s => { if (!cancelled) setStats(s); })
            .catch(err => console.warn('[useServerData] Estadísticas no disponibles:', err));
        return () => { cancelled = true; };
    }, [serverId, playerName, playing]);

    return { status, stats };
}
