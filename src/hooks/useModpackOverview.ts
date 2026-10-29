import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { fetchModpackIndex, fetchModpackVersion } from '../repositories/ModpackRepository';
import { useInstall } from '../context/InstallContext';
import type { ModpackEntry, ModpackVersion } from '../types/modpack';

export type ModpackStatus = 'not-installed' | 'installed' | 'update-available';

export interface ModpackOverview {
    entry: ModpackEntry;
    /** latest.json; puede faltar si no se pudo descargar */
    latest: ModpackVersion | null;
    status: ModpackStatus;
}

async function loadOverview(entry: ModpackEntry, basePath: string | null): Promise<ModpackOverview> {
    const latest = await fetchModpackVersion(entry.id).catch(() => null);
    if (!basePath) return { entry, latest, status: 'not-installed' };

    const modpackId = latest?.modpackId ?? entry.id;
    const [installed, installedVersion] = await Promise.all([
        invoke<boolean>('is_modpack_installed', { basePath, modpackId }).catch(() => false),
        invoke<string | null>('get_installed_version', { basePath, modpackId }).catch(() => null),
    ]);

    let status: ModpackStatus = 'not-installed';
    if (installed) {
        // Sin versión registrada (instalación antigua) se considera al día
        const outdated = latest && installedVersion !== null && installedVersion !== latest.version;
        status = outdated ? 'update-available' : 'installed';
    }
    return { entry, latest, status };
}

/** Índice de modpacks enriquecido con su última versión y estado en disco */
export function useModpackOverview(basePath: string | null) {
    const [items, setItems] = useState<ModpackOverview[] | null>(null);
    const [error, setError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const { job } = useInstall();
    // Recalcular estados cuando termina una instalación
    const jobFinished = job !== null && job.status !== 'running' && job.status !== 'cancelling';

    useEffect(() => {
        let cancelled = false;
        setError(false);
        fetchModpackIndex()
            .then(index => Promise.all(index.modpacks.map(e => loadOverview(e, basePath))))
            .then(result => { if (!cancelled) setItems(result); })
            .catch(() => { if (!cancelled) setError(true); });
        return () => { cancelled = true; };
    }, [basePath, reloadKey, jobFinished]);

    return {
        items,
        error,
        reload: () => { setItems(null); setReloadKey(k => k + 1); },
    };
}
