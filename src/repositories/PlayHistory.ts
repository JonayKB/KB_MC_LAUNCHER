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

// ── Tiempo jugado ──────────────────────────────────────────────────────────

const LS_SESSIONS_KEY = 'kb_play_sessions';
/** Sesiones guardadas por modpack; el total sigue sumando aunque se descarten las viejas */
const MAX_SESSIONS = 30;
/** Más cortas que esto suelen ser cierres/crashes al arrancar: no cuentan */
const MIN_SESSION_SECS = 15;
/** Se emite en window al guardar una sesión, para refrescar las pantallas abiertas */
export const PLAYTIME_CHANGED_EVENT = 'kb-playtime-changed';

export interface PlaySession {
    /** epoch ms */
    startedAt: number;
    durationSecs: number;
}

export interface ModpackPlaytime {
    totalSecs: number;
    sessionCount: number;
    /** Más reciente primero */
    sessions: PlaySession[];
}

function getAllPlaytime(): Record<string, ModpackPlaytime> {
    try {
        const raw = localStorage.getItem(LS_SESSIONS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

export function getPlaytime(modpackId: string): ModpackPlaytime {
    return getAllPlaytime()[modpackId] ?? { totalSecs: 0, sessionCount: 0, sessions: [] };
}

export function recordSession(modpackId: string, durationSecs: number) {
    if (durationSecs < MIN_SESSION_SECS) return;
    const all = getAllPlaytime();
    const prev = all[modpackId] ?? { totalSecs: 0, sessionCount: 0, sessions: [] };
    all[modpackId] = {
        totalSecs: prev.totalSecs + durationSecs,
        sessionCount: prev.sessionCount + 1,
        sessions: [{ startedAt: Date.now() - durationSecs * 1000, durationSecs }, ...prev.sessions].slice(0, MAX_SESSIONS),
    };
    try {
        localStorage.setItem(LS_SESSIONS_KEY, JSON.stringify(all));
    } catch { /* el historial es opcional */ }
    window.dispatchEvent(new CustomEvent(PLAYTIME_CHANGED_EVENT, { detail: modpackId }));
}

/** "2 h 15 min", "45 min", "menos de 1 min" */
export function formatDuration(secs: number): string {
    const min = Math.floor(secs / 60);
    if (min < 1) return 'menos de 1 min';
    const h = Math.floor(min / 60);
    if (h === 0) return `${min} min`;
    const rest = min % 60;
    return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}
