import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { InstallProgress } from '../types/installer';
import { ModpackVersion, resolveLoader } from '../types/modpack';

export interface ProgressState {
    step: string;
    percent: number;
    downloadedBytes?: number;
    totalBytes?: number | null;
    speedBps?: number;
    extractedFiles?: number;
    totalFiles?: number;
    speedFps?: number;
    mode: 'step' | 'download' | 'extract';
}

export type InstallStatus = 'running' | 'cancelling' | 'done' | 'error' | 'cancelled';

export interface InstallJob {
    modpackId: string;
    name: string;
    version: string;
    isUpdate: boolean;
    status: InstallStatus;
    progress: ProgressState;
    error?: string;
}

interface InstallContextValue {
    job: InstallJob | null;
    isInstalling: boolean;
    /** Resuelve a true si terminó bien, false si falló o se canceló */
    startInstall: (modpack: ModpackVersion, opts: { name: string; basePath: string; isUpdate: boolean }) => Promise<boolean>;
    cancelInstall: () => Promise<void>;
    dismiss: () => void;
}

const InstallContext = createContext<InstallContextValue | null>(null);

export function useInstall() {
    const ctx = useContext(InstallContext);
    if (!ctx) throw new Error('useInstall debe usarse dentro de InstallProvider');
    return ctx;
}

/** Debe coincidir con INSTALL_CANCELLED en commands.rs */
const CANCELLED_ERROR = 'CANCELLED';
/** Tiempo que se muestra la notificación de éxito antes de ocultarse */
const DONE_DISMISS_MS = 5000;

function toProgress(p: InstallProgress): ProgressState {
    if (p.type === 'download') {
        return {
            step: p.step,
            percent: p.percent,
            mode: 'download',
            downloadedBytes: p.downloaded_bytes,
            totalBytes: p.total_bytes,
            speedBps: p.speed_bps,
        };
    }
    if (p.type === 'extract') {
        return {
            step: p.step,
            percent: p.percent,
            mode: 'extract',
            extractedFiles: p.extracted_files,
            totalFiles: p.total_files,
            speedFps: p.speed_fps,
        };
    }
    return { step: p.step, percent: p.percent, mode: 'step' };
}

export function InstallProvider({ children }: Readonly<{ children: React.ReactNode }>) {
    const [job, setJob] = useState<InstallJob | null>(null);
    const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Un único listener global: el progreso sigue llegando aunque se cambie de pantalla
    useEffect(() => {
        const unlisten = listen<InstallProgress>('install_progress', (e) => {
            setJob(prev => prev && prev.status === 'running'
                ? { ...prev, progress: toProgress(e.payload) }
                : prev);
        });
        return () => { unlisten.then(un => un()); };
    }, []);

    useEffect(() => () => {
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
    }, []);

    const dismiss = useCallback(() => {
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        setJob(prev => prev && (prev.status === 'running' || prev.status === 'cancelling') ? prev : null);
    }, []);

    const isInstalling = job?.status === 'running' || job?.status === 'cancelling';

    const startInstall = useCallback<InstallContextValue['startInstall']>(async (modpack, { name, basePath, isUpdate }) => {
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        const { loader, loaderVersion } = resolveLoader(modpack);

        setJob({
            modpackId: modpack.modpackId,
            name,
            version: modpack.version,
            isUpdate,
            status: 'running',
            progress: { step: 'Iniciando instalación...', percent: 0, mode: 'step' },
        });

        try {
            if (isUpdate) {
                // Solo reemplaza mods y overrides; el loader ya está instalado
                await invoke('update_modpack', {
                    basePath,
                    overridesUrl: modpack.overridesUrl,
                    modsUrl: modpack.modsUrl,
                    modpackId: modpack.modpackId,
                    modpackVersion: modpack.version,
                });
            } else {
                await invoke('install_modpack', {
                    basePath,
                    mcVersion: modpack.minecraftVersion,
                    loader,
                    loaderVersion,
                    overridesUrl: modpack.overridesUrl,
                    modsUrl: modpack.modsUrl,
                    modpackId: modpack.modpackId,
                    modpackVersion: modpack.version,
                });
            }
            setJob(prev => prev && { ...prev, status: 'done', progress: { ...prev.progress, percent: 100 } });
            dismissTimer.current = setTimeout(() => setJob(null), DONE_DISMISS_MS);
            return true;
        } catch (err) {
            const cancelled = String(err) === CANCELLED_ERROR;
            setJob(prev => prev && {
                ...prev,
                status: cancelled ? 'cancelled' : 'error',
                error: cancelled ? undefined : String(err),
            });
            if (cancelled) {
                dismissTimer.current = setTimeout(() => setJob(null), DONE_DISMISS_MS);
            }
            return false;
        }
    }, []);

    const cancelInstall = useCallback(async () => {
        setJob(prev => prev && prev.status === 'running' ? { ...prev, status: 'cancelling' } : prev);
        await invoke('cancel_install');
    }, []);

    return (
        <InstallContext.Provider value={{ job, isInstalling, startInstall, cancelInstall, dismiss }}>
            {children}
        </InstallContext.Provider>
    );
}
