import React, { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import JSZip from 'jszip';
import { layout, logo, header, badge, progress as pg, box, text, btn, spinner, dropZone as dz } from '../styles/components';


interface Manifest {
    name: string;
    version: string;
    minecraft: { version: string; modLoaders: { id: string; primary: boolean }[] };
    files: { projectID: number; fileID: number; required: boolean }[];
}

interface Progress {
    phase: string;
    current: number;
    total: number;
    message: string;
}

const CF_API_KEY = import.meta.env.VITE_CURSEFORGE_API_KEY as string;

function getLoader(manifest: Manifest) {
    const primary = manifest.minecraft.modLoaders.find(l => l.primary)!;
    const [type, version] = primary.id.split('-');
    return { id: primary.id, type, version };
}

export default function ModpackLauncher() {
    const [manifest, setManifest] = useState<Manifest | null>(null);
    const [progress, setProgress] = useState<Progress | null>(null);
    const [installed, setInstalled] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const [offlineHovered, setOfflineHovered] = useState(false);
    const [msHovered, setMsHovered] = useState(false);
    const initDone = useRef(false);
    const handleZipPath = useCallback(async (filePath: string) => {
        setError(null);
        console.log('[handleZipPath] Iniciando con:', filePath);

        const bytes = await readFile(filePath);
        console.log('[handleZipPath] Archivo leído, bytes:', bytes.length);

        const zip = await JSZip.loadAsync(bytes);
        console.log('[handleZipPath] ZIP parseado');

        const mf: Manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
        console.log('[handleZipPath] Manifest:', mf.name, mf.version, mf.minecraft.version);
        setManifest(mf);

        const loader = getLoader(mf);
        console.log('[handleZipPath] Loader detectado:', loader);

        try {
            // 1. Descargar mods
            const requiredFiles = mf.files.filter(f => f.required);
            console.log('[handleZipPath] Mods requeridos:', requiredFiles.length);

            for (let i = 0; i < requiredFiles.length; i += 50) {
                const batch = requiredFiles.slice(i, i + 50);
                console.log(`[CurseForge] Batch ${i / 50 + 1}: solicitando ${batch.length} fileIDs`);

                const res = await fetch('https://api.curseforge.com/v1/mods/files', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': CF_API_KEY, 'User-Agent': 'KBLauncher/0.1.0 (jonaykb@gmail.com)' },
                    body: JSON.stringify({ fileIds: batch.map(f => f.fileID) }),
                });
                console.log('[CurseForge] Response status:', res.status);
                if (!res.ok) throw new Error(`CurseForge API error: ${res.status}`);

                const { data } = await res.json();
                console.log('[CurseForge] Mods recibidos en batch:', data.length);

                for (const [j, modFile] of (data as any[]).entries()) {
                    const url: string = modFile.downloadUrl
                        ?? `https://mediafilez.forgecdn.net/files/${Math.floor(modFile.id / 1000)}/${modFile.id % 1000}/${modFile.fileName}`;
                    console.log(`[mod ${i + j + 1}/${requiredFiles.length}] ${modFile.fileName} → ${url}`);

                    setProgress({ phase: 'mods', current: i + j + 1, total: requiredFiles.length, message: modFile.fileName });

                    await invoke('download_mod_file', { url, fileName: modFile.fileName, instanceName: mf.name });
                    console.log(`[mod ${i + j + 1}] descargado OK`);
                }
            }

            // 2. Extraer overrides
            console.log('[handleZipPath] Extrayendo overrides...');
            setProgress({ phase: 'overrides', current: 0, total: 1, message: 'Copiando configs...' });
            await invoke('extract_overrides', {
                zipBytes: Array.from(bytes),
                instanceName: mf.name,
            });
            console.log('[handleZipPath] Overrides extraídos OK');

            // 3. Launch (instala loader + lanza)
            console.log('[handleZipPath] Invocando launch con versionConfig:', {
                name: `${mf.name}-${loader.type}`,
                loader: loader.type,
                loaderVersion: loader.version,
                minecraftVersion: mf.minecraft.version,
            });
            setProgress({ phase: 'loader', current: 0, total: 1, message: `Instalando ${loader.id} y lanzando...` });

            const result = await invoke('launch', {
                versionConfig: {
                    name: `${mf.name}-${loader.type}`,
                    loader: loader.type,
                    loaderVersion: loader.version,
                    minecraftVersion: mf.minecraft.version,
                },
                launchConfig: {
                    username: 'KBPlayer',
                    uuid: '00000000-0000-0000-0000-000000000000',
                    javaDistribution: 'temurin',
                },
            });
            console.log('[handleZipPath] launch result:', result);

            setInstalled(true);
            setProgress(null);
        } catch (err) {
            console.error('[handleZipPath] ERROR:', err);
            setError(String(err));
            setProgress(null);
        }
    }, []);


    useEffect(() => {
        if (initDone.current) return;
        initDone.current = true;

        invoke('init_app_state', {
            qualifier: 'com',
            organization: 'MCKBServers',
            application: 'KBLauncher',
        }).catch(console.error);

        const unlistenLighty = listen<{ eventType: string; data: any }>('lighty-event', (e) => {
            const { eventType, data } = e.payload;
            if (eventType === 'core' || eventType === 'java' || eventType === 'loader') {
                setProgress(prev => ({
                    phase: eventType,
                    current: data?.current ?? prev?.current ?? 0,
                    total: data?.total ?? prev?.total ?? 1,
                    message: data?.type ?? prev?.message ?? '',
                }));
            }
        });

        const unlistenDrop = listen<{ paths: string[] }>('tauri://drag-drop', (e) => {
            const path = e.payload.paths[0];
            if (path?.endsWith('.zip')) handleZipPath(path);
        });

        return () => {
            unlistenLighty.then(fn => fn());
            unlistenDrop.then(fn => fn());
        };
    }, [handleZipPath]);


    async function launchOffline() {
        if (!manifest) return;
        const loader = getLoader(manifest);
        console.log('[launchOffline] manifest:', manifest.name, 'loader:', loader);
        try {
            console.log('[launchOffline] invocando launch...');
            const result = await invoke('launch', {
                versionConfig: {
                    name: `${manifest.name}-${loader.type}`,
                    loader: loader.type,
                    loaderVersion: loader.version,
                    minecraftVersion: manifest.minecraft.version,
                },
                launchConfig: {
                    username: 'KBPlayer',
                    uuid: '00000000-0000-0000-0000-000000000000',
                    javaDistribution: 'temurin',
                },
            });
            console.log('[launchOffline] result:', result);
        } catch (err) {
            console.error('[launchOffline] ERROR:', err);
            setError(String(err));
        }
    }

    async function launchMicrosoft() {
        if (!manifest) return;
        const loader = getLoader(manifest);
        console.log('[launchMicrosoft] manifest:', manifest.name, 'loader:', loader);
        try {
            console.log('[launchMicrosoft] autenticando con Microsoft...');
            const profile = await invoke<{ username: string; uuid: string }>(
                'authenticate_microsoft',
                { clientId: import.meta.env.VITE_AZURE_CLIENT_ID }
            );
            console.log('[launchMicrosoft] profile:', profile);

            console.log('[launchMicrosoft] invocando launch...');
            const result = await invoke('launch', {
                versionConfig: {
                    name: `${manifest.name}-${loader.type}`,
                    loader: loader.type,
                    loaderVersion: loader.version,
                    minecraftVersion: manifest.minecraft.version,
                },
                launchConfig: {
                    username: profile.username,
                    uuid: profile.uuid,
                    javaDistribution: 'temurin',
                },
            });
            console.log('[launchMicrosoft] result:', result);
        } catch (err) {
            console.error('[launchMicrosoft] ERROR:', err);
            setError(String(err));
        }
    }



    const phaseLabel: Record<string, string> = {
        loader: 'Instalando loader',
        mods: 'Descargando mods',
        overrides: 'Copiando configuración',
        core: 'Descargando assets',
        java: 'Instalando Java',
    };


    return (
        <div style={layout.fullscreenCenter}>
            <div style={layout.card}>

                <div style={header.zone}>
                    <div style={logo.wrap}>
                        <span style={logo.kb}>KB</span>
                        <span style={logo.dot}>·</span>
                        <span style={logo.text}>LAUNCHER</span>
                    </div>
                    <div style={header.iconWrap}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                            stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="3" width="20" height="14" rx="2" />
                            <path d="M8 21h8M12 17v4" />
                        </svg>
                    </div>
                    <h2 style={header.title}>
                        {!manifest && 'Selecciona un modpack'}
                        {manifest && !installed && 'Instalando modpack'}
                        {installed && 'Listo para jugar'}
                    </h2>
                    <p style={header.subtitle}>
                        {!manifest && 'Arrastra el .zip de CurseForge para comenzar'}
                        {manifest && !installed && `${manifest.name} · MC ${manifest.minecraft.version}`}
                        {installed && manifest && `${manifest.name} v${manifest.version}`}
                    </p>
                </div>

                {!manifest && (
                    <div
                        style={{ ...dz.base, ...(dragging ? dz.active : {}) }}
                        onClick={async () => {
                            const path = await open({ filters: [{ name: 'Modpack', extensions: ['zip'] }] });
                            if (typeof path === 'string') await handleZipPath(path);
                        }}
                        onDragOver={e => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={e => e.preventDefault()}
                    >
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                            stroke={dragging ? 'var(--accent)' : 'var(--text-faint)'} strokeWidth="1.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <span style={{ ...dz.label, ...(dragging ? dz.labelActive : {}) }}>
                            {dragging ? 'Suelta aquí' : 'Seleccionar o arrastrar .zip'}
                        </span>
                        <span style={dz.hint}>Formato CurseForge (manifest.json)</span>
                    </div>
                )}

                {manifest && (
                    <div style={badge.wrap}>
                        <div style={badge.left}>
                            <div style={badge.dot} />
                            <span style={badge.label}>MODPACK</span>
                        </div>
                        <span style={badge.valueSmall}>{manifest.name} v{manifest.version}</span>
                    </div>
                )}

                {progress && (
                    <>
                        <div style={pg.container}>
                            <div style={pg.track}>
                                <div style={{
                                    ...pg.bar,
                                    width: progress.total > 0 ? `${Math.round((progress.current / progress.total) * 100)}%` : '0%',
                                }} />
                            </div>
                            <span style={pg.percentage}>
                                {progress.total > 0 ? `${Math.round((progress.current / progress.total) * 100)}%` : '—'}
                            </span>
                        </div>
                        <div style={box.status}>
                            <div style={layout.row}>
                                <div style={spinner} />
                                <div>
                                    <div style={text.phaseLabel}>
                                        {phaseLabel[progress.phase] ?? progress.phase}
                                        {progress.phase === 'mods' && (
                                            <span style={text.phaseMuted}> {progress.current}/{progress.total}</span>
                                        )}
                                    </div>
                                    <div style={text.statusSmall}>{progress.message}</div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {error && (
                    <div style={box.error}>
                        <div style={layout.row}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
                                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                            </svg>
                            <span style={text.error}>{error}</span>
                        </div>
                    </div>
                )}

                {installed && (
                    <div style={btn.row}>
                        <button
                            style={{ ...btn.secondary, ...(offlineHovered ? btn.secondaryHover : {}) }}
                            onMouseEnter={() => setOfflineHovered(true)}
                            onMouseLeave={() => setOfflineHovered(false)}
                            onClick={launchOffline}
                        >Jugar Offline</button>
                        <button
                            style={{ ...btn.primary, ...(msHovered ? btn.primaryHover : {}) }}
                            onMouseEnter={() => setMsHovered(true)}
                            onMouseLeave={() => setMsHovered(false)}
                            onClick={launchMicrosoft}
                        >Cuenta Microsoft</button>
                    </div>
                )}

            </div>
        </div>
    );

}
