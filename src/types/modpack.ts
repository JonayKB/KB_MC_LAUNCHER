export interface ModpackEntry {
    id: string;
    name: string;
    description: string;
    imageUrl?: string;
    /**
     * Fecha y hora ISO 8601 a partir de la que se puede descargar,
     * p. ej. "2026-11-15T18:00:00+01:00". Sin ella, ya está disponible.
     */
    release_date?: string;
    /**
     * Fecha y hora ISO 8601 en que se cerró (o se cerrará) el servidor. A partir
     * de ella se muestra como terminado, pero se puede seguir instalando y jugando.
     */
    end_date?: string;
}

export interface ModpackIndex {
    modpacks: ModpackEntry[];
}

export type ModLoader = 'forge' | 'neoforge' | 'fabric' | 'vanilla';

export interface ModpackVersion {
    id: string;
    modpackId: string;
    version: string;
    /** Por defecto "forge" (modpacks antiguos no lo indican) */
    loader?: ModLoader;
    /** Versión del loader: "0.16.10" para Fabric, "47.4.10" para Forge, "21.1.265" para NeoForge; sin usar en Vanilla */
    loaderVersion?: string;
    /** @deprecated usar loaderVersion; se mantiene para los latest.json antiguos */
    forgeVersion?: string;
    minecraftVersion: string;    // "1.20.1"
    modsUrl: string;             // URL a carpeta/zip de mods
    overridesUrl: string;        // URL a carpeta/zip de overrides
    changelog?: string;
    images?: string[]
}

export const LOADER_LABELS: Record<ModLoader, string> = {
    forge: 'Forge',
    neoforge: 'NeoForge',
    fabric: 'Fabric',
    vanilla: 'Vanilla',
};

/** Loader y versión efectivos, compatibles con el formato antiguo (solo forgeVersion) */
export function resolveLoader(m: ModpackVersion): { loader: ModLoader; loaderVersion: string } {
    const loader = m.loader ?? 'forge';
    return { loader, loaderVersion: m.loaderVersion ?? m.forgeVersion ?? '' };
}

/**
 * Momento (epoch ms) en que se publica el modpack, o null si ya está abierto.
 * Una fecha mal escrita no bloquea el modpack: se avisa en consola y se abre.
 */
export function releaseTime(entry: Pick<ModpackEntry, 'id' | 'release_date'>): number | null {
    return parseEntryDate(entry.id, 'release_date', entry.release_date);
}

/** Momento (epoch ms) en que se cierra el servidor, o null si no tiene fin previsto */
export function endTime(entry: Pick<ModpackEntry, 'id' | 'end_date'>): number | null {
    return parseEntryDate(entry.id, 'end_date', entry.end_date);
}

function parseEntryDate(id: string, field: string, value?: string): number | null {
    if (!value) return null;
    const t = Date.parse(value);
    if (Number.isNaN(t)) {
        console.warn(`[modpack] ${field} inválida en "${id}": ${value}`);
        return null;
    }
    return t;
}

/** Próximo lanzamiento o cierre pendiente entre varios modpacks, o null si no queda ninguno */
export function nextDeadline(entries: Pick<ModpackEntry, 'id' | 'release_date' | 'end_date'>[], now = Date.now()): number | null {
    const future = entries
        .flatMap(e => [releaseTime(e), endTime(e)])
        .filter((t): t is number => t !== null && t > now);
    return future.length ? Math.min(...future) : null;
}

/** Si el modpack todavía no se puede descargar */
export function isUpcoming(entry: Pick<ModpackEntry, 'id' | 'release_date'>, now = Date.now()): boolean {
    const t = releaseTime(entry);
    return t !== null && t > now;
}

/** Si el servidor del modpack ya se ha dado por terminado */
export function isEnded(entry: Pick<ModpackEntry, 'id' | 'end_date'>, now = Date.now()): boolean {
    const t = endTime(entry);
    return t !== null && t <= now;
}

/** "15 nov, 18:00" (con año si no es el actual), en la hora local del jugador */
export function formatReleaseDate(ts: number): string {
    const date = new Date(ts);
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleString('es-ES', {
        day: 'numeric',
        month: 'short',
        ...(sameYear ? {} : { year: 'numeric' }),
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** Tiempo restante legible: "3 d 4 h", "2 h 15 min", "12 min 30 s", "45 s" */
export function formatCountdown(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`;
    if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
    if (m > 0) return `${m} min ${s} s`;
    return `${s} s`;
}
