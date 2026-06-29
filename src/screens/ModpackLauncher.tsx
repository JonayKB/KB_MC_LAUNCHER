import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { layout, logo, header, badge, progress as pg, box, text, btn, spinner } from '../styles/components';
import { fetchModpackVersion } from '../repositories/ModpackRepository';
import type { InstalledModpack, ModpackVersion } from '../types/modpack';
import { useUser } from '../context/UserContext';

interface Props {
    installed: InstalledModpack;
    onUninstall: () => void;
    onChangeModpack: () => void;
}

interface Progress {
    phase: string;
    current: number;
    total: number;
    message: string;
}

type LauncherState = 'checking' | 'ready' | 'update-available' | 'updating' | 'repairing' | 'launching' | 'error';

const phaseLabel: Record<string, string> = {
    forge: 'Instalando Forge',
    mods: 'Copiando mods',
    overrides: 'Aplicando overrides',
    core: 'Descargando assets',
    java: 'Instalando Java',
    loader: 'Instalando loader',
};

export default function ModpackLauncher({ installed, onUninstall, onChangeModpack }: Readonly<Props>) {
    const { hasMinecraftOwned, username } = useUser();

    const [state, setState] = useState<LauncherState>('checking');
    const [latestVersion, setLatestVersion] = useState<ModpackVersion | null>(null);
    const [progress, setProgress] = useState<Progress | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [playOfflineHovered, setPlayOfflineHovered] = useState(false);
    const [playMsHovered, setPlayMsHovered] = useState(false);
    const [updateHovered, setUpdateHovered] = useState(false);
    const [repairHovered, setRepairHovered] = useState(false);
    const [uninstallHovered, setUninstallHovered] = useState(false);
    const [changeHovered, setChangeHovered] = useState(false);
    const [confirmUninstall, setConfirmUninstall] = useState(false);

    const initDone = useRef(false);

    // Listener eventos lighty
    useEffect(() => {
        const unlisten = listen<{ eventType: string; data: any }>('lighty-event', (e) => {
            const { eventType, data } = e.payload;
            if (['core', 'java', 'loader'].includes(eventType)) {
                setProgress(prev => ({
                    phase: eventType,
                    current: data?.current ?? prev?.current ?? 0,
                    total: data?.total ?? prev?.total ?? 1,
                    message: data?.type ?? prev?.message ?? '',
                }));
            }
        });
        return () => { unlisten.then(fn => fn()); };
    }, []);

    // Al montar: init lighty + comprobar versión
    useEffect(() => {
        if (initDone.current) return;
        initDone.current = true;

        invoke('init_app_state', {
            qualifier: 'com',
            organization: 'MCKBServers',
            application: 'KBLauncher',
        }).catch(console.error);

        checkVersion();
    }, []);

    async function checkVersion() {
        setState('checking');
        setError(null);
        try {
            const latest = await fetchModpackVersion(installed.modpackId);
            setLatestVersion(latest);
            setState(latest.version === installed.version ? 'ready' : 'update-available');
        } catch (err) {
            console.error('[checkVersion]', err);
            setError(String(err));
            setState('error');
        }
    }

    async function applyModsAndOverrides(version: ModpackVersion) {
        await invoke('download_and_extract_zip', {
            url: version.modsUrl,
            instanceName: installed.modpackId,
            targetFolder: 'mods',
            mode: 'replace',
        });
        setProgress({ phase: 'overrides', current: 0, total: 1, message: 'Aplicando overrides...' });
        await invoke('download_and_extract_zip', {
            url: version.overridesUrl,
            instanceName: installed.modpackId,
            targetFolder: 'overrides',
            mode: 'replace',
        });
    }

    async function handleUpdate() {
        if (!latestVersion) return;
        setState('updating');
        setError(null);
        try {
            setProgress({ phase: 'mods', current: 0, total: 1, message: 'Descargando mods...' });
            await applyModsAndOverrides(latestVersion);
            setProgress(null);
            setState('ready');
        } catch (err) {
            console.error('[handleUpdate]', err);
            setError(String(err));
            setState('error');
            setProgress(null);
        }
    }

    async function handleRepair() {
        if (!latestVersion) return;
        setState('repairing');
        setError(null);
        try {
            setProgress({ phase: 'forge', current: 0, total: 1, message: `Reinstalando Forge ${latestVersion.forgeVersion}...` });
            await invoke('launch', {
                versionConfig: {
                    name: `${installed.modpackId}-forge`,
                    loader: 'forge',
                    loaderVersion: latestVersion.forgeVersion,
                    minecraftVersion: latestVersion.minecraftVersion,
                },
                launchConfig: {
                    username: '_repair_',
                    uuid: '00000000-0000-0000-0000-000000000000',
                    javaDistribution: 'temurin',
                },
            });
            setProgress({ phase: 'mods', current: 0, total: 1, message: 'Reemplazando mods...' });
            await applyModsAndOverrides(latestVersion);
            setProgress(null);
            setState('ready');
        } catch (err) {
            console.error('[handleRepair]', err);
            setError(String(err));
            setState('error');
            setProgress(null);
        }
    }

    async function launchGame(profile: { username: string; uuid: string; accessToken?: string }) {
        if (!latestVersion) return;
        setState('launching');
        setError(null);
        try {
            await invoke('launch', {
                versionConfig: {
                    name: `${installed.modpackId}-forge`,
                    loader: 'forge',
                    loaderVersion: latestVersion.forgeVersion,
                    minecraftVersion: latestVersion.minecraftVersion,
                },
                launchConfig: {
                    username: profile.username,
                    uuid: profile.uuid,
                    javaDistribution: 'temurin',
                },
            });
            setState('ready');
        } catch (err) {
            console.error('[launchGame]', err);
            setError(String(err));
            setState('error');
        }
    }

    async function handlePlayOffline() {
        setState('launching');
        setError(null);
        try {
            // Autenticamos a través de lighty para obtener un perfil offline correcto
            const profile = await invoke<{ username: string; uuid: string }>('authenticate_offline', {
                username: username ?? 'KBPlayer',
            });

            await launchGame(profile);
        } catch (err) {
            console.error('[PlayOffline]', err);
            setError(String(err));
            setState('error');
        }
    }

    async function handlePlayMicrosoft() {
        setState('launching'); // Asegúrate de cambiar el estado antes
        setError(null);
        try {
            // Usamos el clientId de tus variables de entorno directamente en el invoke global
            const profile = await invoke<{ username: string; uuid: string }>(
                'authenticate_microsoft',
                { clientId: import.meta.env.VITE_AZURE_CLIENT_ID }
            );

            await launchGame(profile);
        } catch (err) {
            console.error('[PlayMicrosoft]', err);
            setError(String(err));
            setState('error');
        }
    }

    const isBusy = ['checking', 'updating', 'repairing', 'launching'].includes(state);

    return (
        <div style={layout.fullscreenCenter}>
            <div style={layout.card}>

                {/* Header */}
                <div style={header.zone}>
                    <div style={logo.wrap}>
                        <span style={logo.kb}>KB</span>
                        <span style={logo.dot}>·</span>
                        <span style={logo.text}>LAUNCHER</span>
                    </div>
                    <div style={header.iconWrap}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                            stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                    </div>
                    <h2 style={header.title}>
                        {state === 'checking' && 'Comprobando versión'}
                        {state === 'ready' && 'Listo para jugar'}
                        {state === 'update-available' && 'Actualización disponible'}
                        {state === 'updating' && 'Actualizando modpack'}
                        {state === 'repairing' && 'Reparando instalación'}
                        {state === 'launching' && 'Lanzando juego'}
                        {state === 'error' && 'Ha ocurrido un error'}
                    </h2>
                    <p style={header.subtitle}>
                        {state === 'checking' && 'Verificando si hay actualizaciones...'}
                        {state === 'ready' && `${installed.modpackId} · v${installed.version}`}
                        {state === 'update-available' && `v${installed.version} → v${latestVersion?.version}`}
                        {state === 'updating' && 'Descargando mods y configs...'}
                        {state === 'repairing' && 'Reinstalando Forge, mods y configs'}
                        {state === 'launching' && 'Iniciando Minecraft...'}
                        {state === 'error' && 'Comprueba tu conexión e inténtalo de nuevo'}
                    </p>
                </div>

                {/* Badge versión */}
                {latestVersion && (
                    <div style={badge.wrap}>
                        <div style={badge.left}>
                            <div style={badge.dot} />
                            <span style={badge.label}>
                                {state === 'update-available' ? 'VERSIÓN INSTALADA' : 'VERSIÓN'}
                            </span>
                        </div>
                        <span style={badge.valueSmall}>
                            v{installed.version}
                            {state === 'update-available' && (
                                <span style={{ color: 'var(--accent)', marginLeft: '8px' }}>
                                    → v{latestVersion.version} disponible
                                </span>
                            )}
                        </span>
                    </div>
                )}

                {/* Progress */}
                {progress && isBusy && (
                    <>
                        <div style={pg.container}>
                            <div style={pg.track}>
                                <div style={{
                                    ...pg.bar,
                                    width: progress.total > 1
                                        ? `${Math.round((progress.current / progress.total) * 100)}%`
                                        : '100%',
                                    opacity: progress.total <= 1 ? 0.6 : 1,
                                }} />
                            </div>
                            {progress.total > 1 && (
                                <span style={pg.percentage}>
                                    {Math.round((progress.current / progress.total) * 100)}%
                                </span>
                            )}
                        </div>
                        <div style={box.status}>
                            <div style={layout.row}>
                                <div style={spinner} />
                                <div>
                                    <div style={text.phaseLabel}>
                                        {phaseLabel[progress.phase] ?? progress.phase}
                                    </div>
                                    <div style={text.statusSmall}>{progress.message}</div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Checking spinner sin progress */}
                {state === 'checking' && !progress && (
                    <div style={box.status}>
                        <div style={layout.row}>
                            <div style={spinner} />
                            <span style={text.status}>Conectando con el servidor...</span>
                        </div>
                    </div>
                )}

                {/* Error */}
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

                {/* Botones principales */}
                {state === 'ready' && (
                    <div style={btn.row}>
                        {!hasMinecraftOwned ? (
                            <button
                                style={{ ...btn.primary, ...(playOfflineHovered ? btn.primaryHover : {}) }}
                                onMouseEnter={() => setPlayOfflineHovered(true)}
                                onMouseLeave={() => setPlayOfflineHovered(false)}
                                onClick={handlePlayOffline}
                            >▶ Jugar Offline</button>
                        ) : (
                            <>
                                <button
                                    style={{ ...btn.secondary, ...(playOfflineHovered ? btn.secondaryHover : {}) }}
                                    onMouseEnter={() => setPlayOfflineHovered(true)}
                                    onMouseLeave={() => setPlayOfflineHovered(false)}
                                    onClick={handlePlayOffline}
                                >Jugar Offline</button>
                                <button
                                    style={{ ...btn.primary, ...(playMsHovered ? btn.primaryHover : {}) }}
                                    onMouseEnter={() => setPlayMsHovered(true)}
                                    onMouseLeave={() => setPlayMsHovered(false)}
                                    onClick={handlePlayMicrosoft}
                                >▶ Microsoft</button>
                            </>
                        )}
                    </div>
                )}

                {/* Update available */}
                {state === 'update-available' && (
                    <div style={btn.row}>
                        <button
                            style={{ ...btn.secondary, ...(playOfflineHovered ? btn.secondaryHover : {}) }}
                            onMouseEnter={() => setPlayOfflineHovered(true)}
                            onMouseLeave={() => setPlayOfflineHovered(false)}
                            onClick={() => setState('ready')}
                        >Jugar sin actualizar</button>
                        <button
                            style={{ ...btn.primary, ...(updateHovered ? btn.primaryHover : {}) }}
                            onMouseEnter={() => setUpdateHovered(true)}
                            onMouseLeave={() => setUpdateHovered(false)}
                            onClick={handleUpdate}
                        >Actualizar ahora</button>
                    </div>
                )}

                {/* Error — reintentar */}
                {state === 'error' && (
                    <div style={btn.row}>
                        <button
                            style={{ ...btn.secondary, ...(changeHovered ? btn.secondaryHover : {}) }}
                            onMouseEnter={() => setChangeHovered(true)}
                            onMouseLeave={() => setChangeHovered(false)}
                            onClick={onChangeModpack}
                        >Cambiar modpack</button>
                        <button
                            style={{ ...btn.primary, ...(updateHovered ? btn.primaryHover : {}) }}
                            onMouseEnter={() => setUpdateHovered(true)}
                            onMouseLeave={() => setUpdateHovered(false)}
                            onClick={checkVersion}
                        >Reintentar</button>
                    </div>
                )}

                {/* Acciones secundarias — reparar / desinstalar / cambiar */}
                {(state === 'ready' || state === 'update-available') && (
                    <div style={secondaryRow}>
                        <button
                            style={{ ...secondaryBtn, ...(repairHovered ? secondaryBtnHover : {}) }}
                            onMouseEnter={() => setRepairHovered(true)}
                            onMouseLeave={() => setRepairHovered(false)}
                            onClick={handleRepair}
                        >Reparar</button>

                        <button
                            style={{ ...secondaryBtn, ...(changeHovered ? secondaryBtnHover : {}) }}
                            onMouseEnter={() => setChangeHovered(true)}
                            onMouseLeave={() => setChangeHovered(false)}
                            onClick={onChangeModpack}
                        >Cambiar modpack</button>

                        <button
                            style={{ ...secondaryBtn, color: confirmUninstall ? 'var(--accent)' : undefined, ...(uninstallHovered ? secondaryBtnHover : {}) }}
                            onMouseEnter={() => setUninstallHovered(true)}
                            onMouseLeave={() => setUninstallHovered(false)}
                            onClick={() => {
                                if (!confirmUninstall) { setConfirmUninstall(true); return; }
                                onUninstall();
                            }}
                        >{confirmUninstall ? '¿Confirmar?' : 'Desinstalar'}</button>
                    </div>
                )}

            </div>
        </div>
    );
}

const secondaryRow: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
    flexWrap: 'wrap',
};

const secondaryBtn: React.CSSProperties = {
    padding: '6px 12px',
    backgroundColor: 'transparent',
    color: 'var(--text-faint)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontFamily: 'var(--font-condensed)',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    cursor: 'pointer',
    transition: 'color 0.15s',
};

const secondaryBtnHover: React.CSSProperties = {
    color: 'var(--text-primary)',
};