import React, { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import JSZip from 'jszip';

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
        <div style={styles.container}>
            <div style={styles.card}>

                {/* Header */}
                <div style={styles.headerZone}>
                    <div style={styles.logoMark}>
                        <span style={styles.logoKb}>KB</span>
                        <span style={styles.logoDot}>·</span>
                        <span style={styles.logoText}>LAUNCHER</span>
                    </div>
                    <div style={styles.iconWrap}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                            stroke="#E8192C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="3" width="20" height="14" rx="2" />
                            <path d="M8 21h8M12 17v4" />
                        </svg>
                    </div>
                    <h2 style={styles.title}>
                        {!manifest && 'Selecciona un modpack'}
                        {manifest && !installed && 'Instalando modpack'}
                        {installed && 'Listo para jugar'}
                    </h2>
                    <p style={styles.subtitle}>
                        {!manifest && 'Arrastra el .zip de CurseForge para comenzar'}
                        {manifest && !installed && `${manifest.name} · MC ${manifest.minecraft.version}`}
                        {installed && manifest && `${manifest.name} v${manifest.version}`}
                    </p>
                </div>

                {/* Drop zone */}
                {!manifest && (
                    <div
                        style={{
                            ...styles.dropZone,
                            borderColor: dragging ? '#E8192C' : '#2a2a32',
                            backgroundColor: dragging ? '#1a080a' : '#18181c',
                        }}
                        onClick={async () => {
                            const path = await open({
                                filters: [{ name: 'Modpack', extensions: ['zip'] }],
                            });
                            if (typeof path === 'string') await handleZipPath(path);
                        }}
                        onDragOver={e => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={e => e.preventDefault()}
                    >
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                            stroke={dragging ? '#E8192C' : '#52525e'} strokeWidth="1.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <span style={{ ...styles.dropLabel, color: dragging ? '#E8192C' : '#52525e' }}>
                            {dragging ? 'Suelta aquí' : 'Seleccionar o arrastrar .zip'}
                        </span>
                        <span style={styles.dropHint}>Formato CurseForge (manifest.json)</span>
                    </div>
                )}

                {/* Modpack info badge — visible durante instalación */}
                {manifest && (
                    <div style={styles.versionBadge}>
                        <div style={styles.versionLeft}>
                            <div style={styles.verDot} />
                            <span style={styles.versionLabel}>MODPACK</span>
                        </div>
                        <span style={styles.versionValue}>{manifest.name} v{manifest.version}</span>
                    </div>
                )}

                {/* Barra de progreso */}
                {progress && (
                    <>
                        <div style={styles.progressContainer}>
                            <div style={styles.progressTrack}>
                                <div style={{
                                    ...styles.progressBar,
                                    width: progress.total > 0
                                        ? `${Math.round((progress.current / progress.total) * 100)}%`
                                        : '0%',
                                }} />
                            </div>
                            <span style={styles.percentageText}>
                                {progress.total > 0
                                    ? `${Math.round((progress.current / progress.total) * 100)}%`
                                    : '—'}
                            </span>
                        </div>

                        <div style={styles.statusBox}>
                            <div style={styles.rowFlex}>
                                <div style={styles.spinner} />
                                <div>
                                    <div style={styles.phaseLabel}>
                                        {phaseLabel[progress.phase] ?? progress.phase}
                                        {progress.phase === 'mods' && (
                                            <span style={styles.phaseCount}> {progress.current}/{progress.total}</span>
                                        )}
                                    </div>
                                    <div style={styles.statusText}>{progress.message}</div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Error */}
                {error && (
                    <div style={styles.errorBox}>
                        <div style={styles.rowFlex}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                stroke="#E8192C" strokeWidth="2" strokeLinecap="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 8v4M12 16h.01" />
                            </svg>
                            <span style={styles.errorText}>{error}</span>
                        </div>
                    </div>
                )}

                {/* Botones de launch */}
                {installed && (
                    <div style={styles.buttonRow}>
                        <button
                            style={{ ...styles.secondaryButton, ...(offlineHovered ? styles.secondaryButtonHover : {}) }}
                            onMouseEnter={() => setOfflineHovered(true)}
                            onMouseLeave={() => setOfflineHovered(false)}
                            onClick={launchOffline}
                        >
                            Jugar Offline
                        </button>
                        <button
                            style={{ ...styles.primaryButton, ...(msHovered ? styles.primaryButtonHover : {}) }}
                            onMouseEnter={() => setMsHovered(true)}
                            onMouseLeave={() => setMsHovered(false)}
                            onClick={launchMicrosoft}
                        >
                            Cuenta Microsoft
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#080809',
        color: '#f5f5f7',
        fontFamily: '"Barlow", system-ui, sans-serif',
        padding: '24px',
    },
    card: {
        width: '100%',
        maxWidth: '480px',
        backgroundColor: '#101013',
        borderRadius: '10px',
        padding: '32px',
        border: '1px solid #2a2a32',
        borderTop: '2px solid #E8192C',
        display: 'flex',
        flexDirection: 'column',
        gap: '22px',
    },
    headerZone: {
        textAlign: 'center',
    },
    logoMark: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        marginBottom: '14px',
        fontFamily: '"Barlow Condensed", system-ui, sans-serif',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.15em',
    },
    logoKb: { color: '#E8192C' },
    logoDot: { color: '#52525e' },
    logoText: { color: '#52525e' },
    iconWrap: {
        width: '44px',
        height: '44px',
        borderRadius: '8px',
        background: '#18181c',
        border: '1px solid #2a2a32',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 14px',
    },
    title: {
        fontFamily: '"Barlow Condensed", system-ui, sans-serif',
        fontSize: '24px',
        fontWeight: 800,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.02em',
        color: '#f5f5f7',
        margin: '0 0 6px',
    },
    subtitle: {
        fontSize: '18px',
        color: '#9898a8',
        margin: 0,
    },
    dropZone: {
        border: '2px dashed',
        borderRadius: '8px',
        padding: '36px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background-color 0.15s',
    },
    dropLabel: {
        fontFamily: '"Barlow Condensed", system-ui, sans-serif',
        fontSize: '15px',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        transition: 'color 0.15s',
    },
    dropHint: {
        fontSize: '12px',
        color: '#3a3a48',
    },
    versionBadge: {
        background: '#18181c',
        border: '1px solid #2a2a32',
        borderRadius: '6px',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    versionLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    verDot: {
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: '#E8192C',
        flexShrink: 0,
    },
    versionLabel: {
        fontFamily: '"Barlow Condensed", system-ui, sans-serif',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.12em',
        color: '#52525e',
    },
    versionValue: {
        fontFamily: '"Barlow Condensed", system-ui, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        color: '#f5f5f7',
        letterSpacing: '0.03em',
    },
    progressContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
    },
    progressTrack: {
        flex: 1,
        height: '6px',
        backgroundColor: '#202026',
        borderRadius: '3px',
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        background: '#E8192C',
        borderRadius: '3px',
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    },
    percentageText: {
        fontFamily: '"Barlow Condensed", system-ui, sans-serif',
        fontSize: '18px',
        fontWeight: 700,
        color: '#E8192C',
        width: '40px',
        textAlign: 'right' as const,
    },
    statusBox: {
        backgroundColor: '#18181c',
        border: '1px solid #2a2a32',
        borderLeft: '3px solid #E8192C',
        borderRadius: '0 8px 8px 0',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        minHeight: '44px',
    },
    errorBox: {
        backgroundColor: '#2a0a0e',
        border: '1px solid #3a1018',
        borderLeft: '3px solid #E8192C',
        borderRadius: '0 8px 8px 0',
        padding: '14px 16px',
    },
    rowFlex: {
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        width: '100%',
    },
    phaseLabel: {
        fontFamily: '"Barlow Condensed", system-ui, sans-serif',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.1em',
        color: '#E8192C',
        textTransform: 'uppercase' as const,
        marginBottom: '2px',
    },
    phaseCount: {
        color: '#52525e',
    },
    statusText: {
        fontSize: '13px',
        color: '#9898a8',
        lineHeight: 1.4,
        wordBreak: 'break-all' as const,
    },
    errorText: {
        fontSize: '14px',
        color: '#fca5a5',
        lineHeight: '1.5',
        fontWeight: 500,
    },
    spinner: {
        width: '14px',
        height: '14px',
        border: '2px solid #E8192C',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        flexShrink: 0,
        animation: 'spin 0.8s linear infinite',
    },
    buttonRow: {
        display: 'flex',
        gap: '10px',
    },
    primaryButton: {
        flex: 1,
        padding: '11px',
        backgroundColor: '#E8192C',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        fontFamily: '"Barlow Condensed", system-ui, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.08em',
        cursor: 'pointer',
        transition: 'background-color 0.15s',
    },
    primaryButtonHover: {
        backgroundColor: '#B01020',
    },
    secondaryButton: {
        flex: 1,
        padding: '11px',
        backgroundColor: 'transparent',
        color: '#9898a8',
        border: '1px solid #2a2a32',
        borderRadius: '6px',
        fontFamily: '"Barlow Condensed", system-ui, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.08em',
        cursor: 'pointer',
        transition: 'background-color 0.15s, color 0.15s',
    },
    secondaryButtonHover: {
        backgroundColor: '#18181c',
        color: '#f5f5f7',
    },
};