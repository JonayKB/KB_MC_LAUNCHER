export interface ModpackEntry {
    id: string;
    name: string;
    description: string;
    imageUrl?: string;
}

export interface ModpackIndex {
    modpacks: ModpackEntry[];
}

export type ModLoader = 'forge' | 'fabric';

export interface ModpackVersion {
    id: string;
    modpackId: string;
    version: string;
    /** Por defecto "forge" (modpacks antiguos no lo indican) */
    loader?: ModLoader;
    /** Versión del loader: "0.16.10" para Fabric, "47.4.10" para Forge */
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
    fabric: 'Fabric',
};

/** Loader y versión efectivos, compatibles con el formato antiguo (solo forgeVersion) */
export function resolveLoader(m: ModpackVersion): { loader: ModLoader; loaderVersion: string } {
    const loader = m.loader ?? 'forge';
    return { loader, loaderVersion: m.loaderVersion ?? m.forgeVersion ?? '' };
}
