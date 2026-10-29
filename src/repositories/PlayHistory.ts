const LS_KEY = 'kb_play_history';

/** modpackId → última vez jugado (epoch ms) */
export type PlayHistory = Record<string, number>;

export function getPlayHistory(): PlayHistory {
    try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

export function recordPlayed(modpackId: string) {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify({ ...getPlayHistory(), [modpackId]: Date.now() }));
    } catch { /* el historial es opcional */ }
}

/** Id del modpack jugado más recientemente, si hay alguno */
export function getLastPlayed(history: PlayHistory = getPlayHistory()): string | null {
    const entries = Object.entries(history);
    if (entries.length === 0) return null;
    return entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

/** "hace 5 min", "hace 2 días"... */
export function formatTimeAgo(ts: number): string {
    const diff = Math.max(0, Date.now() - ts);
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'hace un momento';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'ayer' : `hace ${d} días`;
}
