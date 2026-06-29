import type { ModpackIndex, ModpackVersion } from '../types/modpack';

// Cambia esta URL por la de tu repo
const REPO_BASE = 'https://me.jonaykb.com/modpacks/';

export async function fetchModpackIndex(): Promise<ModpackIndex> {
    const res = await fetch(`${REPO_BASE}index.json`);
    if (!res.ok) throw new Error(`Error obteniendo índice: ${res.status}`);
    return res.json();
}

export async function fetchModpackVersion(modpackId: string): Promise<ModpackVersion> {
    const res = await fetch(`${REPO_BASE}/${modpackId}latest.json`);
    if (!res.ok) throw new Error(`Error obteniendo versión: ${res.status}`);
    return res.json();
}