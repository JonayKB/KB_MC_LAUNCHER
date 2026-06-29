import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { layout, logo, header, badge, progress as pg, box, text, btn, spinner } from '../styles/components';
import { fetchModpackVersion } from '../repositories/ModpackRepository';
import { InstalledModpack, ModpackEntry, ModpackVersion } from '../types';

interface Props {
    modpack: ModpackEntry;
    onInstalled: (installed: InstalledModpack) => void;
    onBack: () => void;
}

interface Progress {
    phase: string;
    current: number;
    total: number;
    message: string;
}

const phaseLabel: Record<string, string> = {
    forge: 'Instalando Forge',
    mods: 'Copiando mods',
    overrides: 'Aplicando overrides',
    core: 'Descargando assets',
    java: 'Instalando Java',
};

export default function ModpackInstallScreen({ modpack, onInstalled, onBack }: Readonly<Props>) {
    const [progress, setProgress] = useState<Progress | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [modpackVersion, setModpackVersion] = useState<ModpackVersion | null>(null);
    const [backHovered, setBackHovered] = useState(false);
    const [retryHovered, setRetryHovered] = useState(false);
    const started = useRef(false);

    useEffect(() => {
        const unlistenLighty = listen<{ eventType: string; data: any }>('lighty-event', (e) => {
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

        return () => { unlistenLighty.then(fn => fn()); };
    }, []);

    useEffect(() => {
        if (started.current) return;
        started.current = true;

        invoke('plugin:lighty_launcher|init_app_state', {
            qualifier: 'com',
            organization: 'MCKBServers',
            application: 'KBLauncher',
        })
            .then(() => install())
            .catch((err) => {
                console.error("[init] Error:", err);
                setError("Error al inicializar el motor del launcher.");
            });
    }, []);
    async function install() {
        setError(null);
        try {
            // 1. Obtener versión del modpack desde el repo
            setProgress({ phase: 'forge', current: 0, total: 1, message: 'Obteniendo información del modpack...' });
            const version = await fetchModpackVersion(modpack.id);
            setModpackVersion(version);

            setProgress({ phase: 'forge', current: 0, total: 1, message: `Instalando Forge ${version.forgeVersion}...` });
            await invoke('launch', {
                versionConfig: {
                    name: `${modpack.id}-forge`,
                    loader: 'forge',
                    loaderVersion: version.forgeVersion,
                    minecraftVersion: version.minecraftVersion,
                },
                launchConfig: {
                    username: '_install_',
                    uuid: '00000000-0000-0000-0000-000000000000',
                    javaDistribution: 'temurin',
                },
            });

            // 3. Descargar y copiar mods.zip
            setProgress({ phase: 'mods', current: 0, total: 1, message: 'Descargando mods...' });
            await invoke('download_and_extract_zip', {
                url: version.modsUrl,
                instanceName: modpack.id,
                targetFolder: 'mods',
                mode: 'copy',   // copia sin borrar lo que ya hay
            });

            // 4. Descargar y aplicar overrides.zip (reemplaza)
            setProgress({ phase: 'overrides', current: 0, total: 1, message: 'Aplicando overrides...' });
            await invoke('download_and_extract_zip', {
                url: version.overridesUrl,
                instanceName: modpack.id,
                targetFolder: 'overrides',
                mode: 'replace', // borra el contenido previo y pone el nuevo
            });

            // 5. Guardar en localStorage
            const installed: InstalledModpack = {
                modpackId: modpack.id,
                version: version.version,
                instancePath: '',   // el backend devuelve el path real — ver nota abajo
                installedAt: new Date().toISOString(),
            };

            setProgress(null);
            onInstalled(installed);

        } catch (err) {
            console.error('[install] ERROR:', err);
            setError(String(err));
            setProgress(null);
        }
    }

    function retry() {
        started.current = false;
        setError(null);
        setModpackVersion(null);
        install();
        started.current = true;
    }

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
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    </div>
                    <h2 style={header.title}>Instalando modpack</h2>
                    <p style={header.subtitle}>{modpack.name}</p>
                </div>

                {modpackVersion && (
                    <div style={badge.wrap}>
                        <div style={badge.left}>
                            <div style={badge.dot} />
                            <span style={badge.label}>VERSIÓN</span>
                        </div>
                        <span style={badge.valueSmall}>
                            {modpackVersion.version} · MC {modpackVersion.minecraftVersion} · Forge {modpackVersion.forgeVersion}
                        </span>
                    </div>
                )}

                {progress && (
                    <>
                        <div style={pg.container}>
                            <div style={pg.track}>
                                <div style={{
                                    ...pg.bar,
                                    width: progress.total > 0
                                        ? `${Math.round((progress.current / progress.total) * 100)}%`
                                        : '100%',
                                    opacity: progress.total <= 1 ? 0.6 : 1,
                                    animation: progress.total <= 1 ? 'pulse 1.5s ease-in-out infinite' : 'none',
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

                {error && (
                    <>
                        <div style={box.error}>
                            <div style={layout.row}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                    stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
                                    <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                                </svg>
                                <span style={text.error}>{error}</span>
                            </div>
                        </div>

                        <div style={btn.row}>
                            <button
                                style={{ ...btn.secondary, ...(backHovered ? btn.secondaryHover : {}) }}
                                onMouseEnter={() => setBackHovered(true)}
                                onMouseLeave={() => setBackHovered(false)}
                                onClick={onBack}
                            >← Volver</button>
                            <button
                                style={{ ...btn.primary, ...(retryHovered ? btn.primaryHover : {}) }}
                                onMouseEnter={() => setRetryHovered(true)}
                                onMouseLeave={() => setRetryHovered(false)}
                                onClick={retry}
                            >Reintentar</button>
                        </div>
                    </>
                )}

            </div>
        </div>
    );
}