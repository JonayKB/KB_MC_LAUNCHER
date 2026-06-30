export interface ModpackEntry {
    id: string;
    name: string;
    description: string;
    imageUrl?: string;
}

export interface ModpackIndex {
    modpacks: ModpackEntry[];
}

export interface ModpackVersion {
    id: string;
    modpackId: string;
    version: string;
    forgeVersion: string;        // "47.4.10"
    minecraftVersion: string;    // "1.20.1"
    modsUrl: string;             // URL a carpeta/zip de mods
    overridesUrl: string;        // URL a carpeta/zip de overrides
    changelog?: string;
    images?: string[]
}

export interface InstalledModpack {
    modpackId: string;
    version: string;
    instancePath: string;        // path absoluto en disco
    installedAt: string;         // ISO date
}