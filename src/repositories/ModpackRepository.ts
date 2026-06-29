import { invoke } from '@tauri-apps/api/core';
import type { ModpackIndex, ModpackVersion } from '../types/modpack';

const REPO_BASE = 'https://me.jonaykb.com/modpacks';

export async function fetchModpackIndex(): Promise<ModpackIndex> {
    const raw = await invoke<string>('fetch_text', { url: `${REPO_BASE}/index.json` });
    return JSON.parse(raw);
}

export async function fetchModpackVersion(modpackId: string): Promise<ModpackVersion> {
    const raw = await invoke<string>('fetch_text', { url: `${REPO_BASE}/${modpackId}/latest.json` });
    return JSON.parse(raw);
}