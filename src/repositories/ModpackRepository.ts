import { invoke } from '@tauri-apps/api/core';
import type { ModpackIndex, ModpackVersion } from '../types/modpack';

const REPO_BASE = 'https://me.jonaykb.com/modpacks';

let indexPromise: Promise<ModpackIndex> | null = null;

/** El índice se comparte entre Navbar y Home; si falla se vuelve a pedir */
export function fetchModpackIndex(): Promise<ModpackIndex> {
    indexPromise ??= invoke<string>('fetch_text', { url: `${REPO_BASE}/index.json` })
        .then((raw) => JSON.parse(raw) as ModpackIndex)
        .catch((err) => {
            indexPromise = null;
            throw err;
        });
    return indexPromise;
}
export async function fetchModpackVersion(modpackId: string): Promise<ModpackVersion> {
    const raw = await invoke<string>('fetch_text', { url: `${REPO_BASE}/${modpackId}/latest.json` });
    return JSON.parse(raw);
}