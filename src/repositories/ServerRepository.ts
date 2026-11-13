import { invoke } from '@tauri-apps/api/core';

/**
 * Estado de los servidores y estadísticas de cada jugador, que publica KB_Discord_Bot.
 * Contrato: KB_Discord_Bot/docs/launcher-contract.md
 */
const BASE_URL = 'https://discord.jonaykb.com/servers';
const FORMAT_VERSION = 1;

export const STAT_KEYS = ['playTimeSeconds', 'mobKills', 'deaths', 'distanceCm', 'advancements'] as const;
export type StatKey = typeof STAT_KEYS[number];
export type Period = 'total' | 'weekly';

export interface ServerStatus {
    id: number;
    name: string;
    address: string;
    online: boolean;
    playersOnline: number;
    maxPlayers: number;
    /** Puede ser solo una muestra: el número real es playersOnline */
    players: string[];
    tps: number | null;
    mapUrl: string | null;
    inviteUrl: string | null;
}

export interface PlayerStats {
    name: string;
    updatedAt: number | null;
    total: Partial<Record<StatKey, number>>;
    weekly: Partial<Record<StatKey, number>>;
    rank: Record<Period, Partial<Record<StatKey, number | null>>>;
    rankedPlayers: Record<Period, number>;
}

function httpsUrl(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    try {
        return new URL(value).protocol === 'https:' ? value : null;
    } catch {
        return null;
    }
}

const count = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0);

/** "Play.KB.com:25565" y "play.kb.com" son el mismo servidor */
export function normalizeAddress(address: string): string {
    return address.trim().toLowerCase().replace(/:25565$/, '');
}

function parseServer(raw: any): ServerStatus | null {
    if (!Number.isInteger(raw?.id) || typeof raw?.address !== 'string' || typeof raw?.name !== 'string') return null;
    return {
        id: raw.id,
        name: raw.name,
        address: raw.address,
        online: raw.online === true,
        playersOnline: count(raw.playersOnline),
        maxPlayers: count(raw.maxPlayers),
        players: Array.isArray(raw.players) ? raw.players.filter((p: unknown): p is string => typeof p === 'string') : [],
        tps: typeof raw.tps === 'number' && Number.isFinite(raw.tps) ? raw.tps : null,
        mapUrl: httpsUrl(raw.mapUrl),
        inviteUrl: httpsUrl(raw.inviteUrl),
    };
}

export function parseServerFeed(raw: string): ServerStatus[] {
    const feed = JSON.parse(raw);
    if (feed?.version !== FORMAT_VERSION || !Array.isArray(feed.servers)) throw new Error('Formato de servidores no compatible');
    return feed.servers.map(parseServer).filter((s: ServerStatus | null): s is ServerStatus => s !== null);
}

/** Estado del servidor con esa dirección, o null si el bot no lo publica */
export async function fetchServerStatus(address: string): Promise<ServerStatus | null> {
    const servers = parseServerFeed(await invoke<string>('fetch_text', { url: `${BASE_URL}/status.json` }));
    const wanted = normalizeAddress(address);
    return servers.find(s => normalizeAddress(s.address) === wanted) ?? null;
}

function parseStats(raw: any): Partial<Record<StatKey, number>> {
    const out: Partial<Record<StatKey, number>> = {};
    for (const key of STAT_KEYS) {
        const v = raw?.[key];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[key] = v;
    }
    return out;
}

function parseRank(raw: any): Partial<Record<StatKey, number | null>> {
    const out: Partial<Record<StatKey, number | null>> = {};
    for (const key of STAT_KEYS) out[key] = Number.isInteger(raw?.[key]) && raw[key] > 0 ? raw[key] : null;
    return out;
}

export function parsePlayerStats(raw: string): PlayerStats {
    const data = JSON.parse(raw);
    if (data?.version !== FORMAT_VERSION || typeof data.name !== 'string') throw new Error('Formato de estadísticas no compatible');
    const updatedAt = Date.parse(data.updatedAt);
    return {
        name: data.name,
        updatedAt: Number.isNaN(updatedAt) ? null : updatedAt,
        total: parseStats(data.total),
        weekly: parseStats(data.weekly),
        rank: { total: parseRank(data.rank?.total), weekly: parseRank(data.rank?.weekly) },
        rankedPlayers: { total: count(data.rankedPlayers?.total), weekly: count(data.rankedPlayers?.weekly) },
    };
}

/** Estadísticas del jugador en ese servidor, o null si aún no tiene (nunca ha entrado) */
export async function fetchPlayerStats(serverId: number, name: string): Promise<PlayerStats | null> {
    try {
        const raw = await invoke<string>('fetch_text', { url: `${BASE_URL}/${serverId}/players/${encodeURIComponent(name)}` });
        return parsePlayerStats(raw);
    } catch (err) {
        // reqwest: "HTTP status client error (404 Not Found)"; la URL también podría contener "404"
        if (/\(404 /.test(String(err))) return null;
        throw err;
    }
}

export function formatStat(key: StatKey, value: number): string {
    if (key === 'playTimeSeconds') {
        const h = Math.floor(value / 3600);
        const m = Math.floor((value % 3600) / 60);
        if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`;
        return h > 0 ? `${h} h ${m} min` : `${m} min`;
    }
    if (key === 'distanceCm') {
        const m = value / 100;
        return m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`;
    }
    // toLocaleString('es-ES') no separa los números de 4 cifras (2841)
    return String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export const STAT_LABELS: Record<StatKey, string> = {
    playTimeSeconds: 'Tiempo jugado',
    mobKills: 'Mobs',
    deaths: 'Muertes',
    distanceCm: 'Distancia',
    advancements: 'Logros',
};
