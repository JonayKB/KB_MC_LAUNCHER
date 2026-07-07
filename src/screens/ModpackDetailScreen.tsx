import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { ModpackVersion } from "../types";
import { fetchModpackVersion } from "../repositories/ModpackRepository";
import { detail, loading, installOverlay } from "../styles/modpackDetailStyles";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { formatBytes, formatSpeed, InstallProgress } from "../types/installer";
import { useUser } from "../context/UserContext";
import { ask } from '@tauri-apps/plugin-dialog';
import { ModpackSettings, RecommendedSettings } from "../types/modpackSettings";
import ModpackSettingsModal, { loadSettings } from "../components/ModpackSettingsModal";
const IMAGE_ROTATE_MS = 6000;

interface ProgressState {
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


export default function ModpackDetailScreen() {
    const { id } = useParams<{ id: string }>();
    const [modpack, setModpack] = useState<ModpackVersion | null>(null);
    const [imageIndex, setImageIndex] = useState(0);
    const [isInstalled, setIsInstalled] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [launching, setLaunching] = useState(false);
    const [launchError, setLaunchError] = useState<string | null>(null);
    const [progress, setProgress] = useState<ProgressState | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuHoverId, setMenuHoverId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const unlistenRef = useRef<UnlistenFn | null>(null);
    const location = useLocation();
    const name = (location.state as { name?: string } | null)?.name;
    const { basePath, accounts } = useUser();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [modpackSettings, setModpackSettings] = useState<ModpackSettings | null>(null);
    // Fetch modpack data
    useEffect(() => {
        const fetchData = async () => {
            if (id) {
                const modpackData = await fetchModpackVersion(id);
                setModpack(modpackData);
                setImageIndex(0);
            }
        };
        fetchData();
    }, [id]);


    // Comprobar instalación cuando tenemos modpack y basePath
    useEffect(() => {
        if (!modpack || !basePath) return;
        invoke<boolean>('is_modpack_installed', {
            basePath,
            modpackId: modpack.modpackId,
        }).then(setIsInstalled).catch(() => setIsInstalled(false));
    }, [modpack, basePath]);

    // Rotación de imágenes
    useEffect(() => {
        const images = modpack?.images;
        if (!images || images.length < 2) return;
        const interval = setInterval(() => {
            setImageIndex((prev) => (prev + 1) % images.length);
        }, IMAGE_ROTATE_MS);
        return () => clearInterval(interval);
    }, [modpack]);

    // Cerrar menú al click fuera
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Limpieza del listener si desmonta mientras instala
    useEffect(() => {
        return () => { unlistenRef.current?.(); };
    }, []);
    useEffect(() => {
        if (!modpack) return;
        setModpackSettings(loadSettings(modpack.modpackId));

        const images = modpack?.images;
        if (!images || images.length === 0) return;

        images.forEach((url) => {
            const img = new Image();
            img.src = url;
        });
    }, [modpack]);
    function handleOpenSettings() {
        setSettingsOpen(true);
    }
    async function handleInstall(modpack: ModpackVersion) {
        if (!basePath) {
            console.error('basePath no disponible todavía');
            return;
        }
        // Aplicar settings recomendados si el usuario no tiene los suyos
        if (!modpackSettings || !localStorage.getItem(`kb_settings_${modpack.modpackId}`)) {
            try {
                const recommended = await invoke<RecommendedSettings>('get_recommended_settings');
                const autoSettings: ModpackSettings = {
                    minRamMb: recommended.min_ram_mb,
                    maxRamMb: recommended.max_ram_mb,
                    fullscreen: recommended.fullscreen,
                    windowWidth: recommended.window_width,
                    windowHeight: recommended.window_height,
                    extraJvmArgs: recommended.extra_jvm_args,
                };
                // Guardar y aplicar
                localStorage.setItem(
                    `kb_settings_${modpack.modpackId}`,
                    JSON.stringify(autoSettings)
                );
                setModpackSettings(autoSettings);
                console.log('[install] Settings recomendados aplicados automáticamente:', autoSettings);
            } catch (err) {
                console.warn('[install] No se pudieron obtener settings recomendados:', err);
            }
        }

        setInstalling(true);
        setLaunchError(null);
        setProgress({ step: 'Iniciando instalación...', percent: 0, mode: 'step' });

        unlistenRef.current = await listen<InstallProgress>('install_progress', (e) => {
            const p = e.payload;
            if (p.type === 'step') {
                setProgress({ step: p.step, percent: p.percent, mode: 'step' });
            } else if (p.type === 'download') {
                setProgress({
                    step: p.step,
                    percent: p.percent,
                    mode: 'download',
                    downloadedBytes: p.downloaded_bytes,
                    totalBytes: p.total_bytes,
                    speedBps: p.speed_bps,
                });
            } else if (p.type === 'extract') {
                setProgress({
                    step: p.step,
                    percent: p.percent,
                    mode: 'extract',
                    extractedFiles: p.extracted_files,
                    totalFiles: p.total_files,
                    speedFps: p.speed_fps,
                });
            }
        });

        try {
            await invoke('install_modpack', {
                basePath,
                mcVersion: modpack.minecraftVersion,
                loader: 'forge',
                loaderVersion: modpack.forgeVersion,
                overridesUrl: modpack.overridesUrl,
                modsUrl: modpack.modsUrl,
                modpackId: modpack.modpackId,
            });
            setIsInstalled(true);
        } catch (err) {
            console.error('Error durante la instalación:', err);
            setLaunchError(`Error de instalación: ${err}`);
        } finally {
            unlistenRef.current?.();
            setInstalling(false);
            setProgress(null);
        }
    }

    async function handleOpenFiles(modpack: ModpackVersion) {
        if (!basePath) return;
        const instanceDir = `${basePath}/instances/${modpack.modpackId}`;
        try {
            await invoke('open_directory', { path: instanceDir });
        } catch (err) {
            console.error('Error abriendo directorio:', err);
        }
    }
    async function handleUninstall(modpack: ModpackVersion) {
        if (!basePath) return;

        const confirmed = await ask(
            `¿Seguro que quieres desinstalar ${name || modpack.modpackId}?\nSe eliminarán todos los archivos de la instancia.`,
            { title: 'Desinstalar modpack', kind: 'warning' }
        );

        if (!confirmed) return;

        try {
            await invoke('uninstall_modpack', {
                basePath,
                modpackId: modpack.modpackId,
            });
            setIsInstalled(false);
            console.log('Modpack desinstalado:', modpack.modpackId);
        } catch (err) {
            console.error('Error desinstalando:', err);
            setLaunchError(`Error desinstalando: ${err}`);
        }
    }

    async function handlePlay(modpack: ModpackVersion) {
        if (!basePath) return;
        setLaunching(true);
        setLaunchError(null);
        const s = modpackSettings;
        try {
            await invoke('launch_modpack', {
                basePath,
                modpackId: modpack.modpackId,
                mcVersion: modpack.minecraftVersion,
                forgeVersion: modpack.forgeVersion,
                username: accounts.find(a => a.isActual)?.username ?? 'Player',
                minRamMb: s?.minRamMb ?? 512,
                maxRamMb: s?.maxRamMb ?? 4096,
                fullscreen: s?.fullscreen ?? true,
                windowWidth: s?.windowWidth ?? 1920,
                windowHeight: s?.windowHeight ?? 1080,
                extraJvmArgs: s?.extraJvmArgs ?? '',
            });
        } catch (err) {
            setLaunchError(`Error al lanzar: ${err}`);
        } finally {
            setLaunching(false);
        }
    }

    if (!modpack) {
        return (
            <div style={detail.screen(null)}>
                <div style={loading.wrap}>
                    <div style={loading.spinner} />
                    <span style={loading.text}>Cargando información del modpack...</span>
                </div>
            </div>
        );
    }

    const bgUrl = modpack.images?.[imageIndex] ?? null;
    const isBusy = installing || launching;

    const menuItems = [
        {
            id: 'uninstall', label: 'Desinstalar', requiresInstall: true, danger: true,
            onClick: () => handleUninstall(modpack),
            icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>,
        },
        {
            id: 'files', label: 'Ver archivos', requiresInstall: true,
            onClick: () => handleOpenFiles(modpack),
            icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>,
        },
        {
            id: 'settings', label: 'Ajustes del modpack', requiresInstall: false,
            onClick: () => handleOpenSettings(),
            icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
        },
    ];

    const playButtonLabel = () => {
        if (installing) return 'Instalando...';
        if (launching) return 'Lanzando...';
        if (isInstalled) return 'Jugar';
        return 'Instalar';
    };



    return (
        <>{settingsOpen && modpack && (
            <ModpackSettingsModal
                modpackId={modpack.modpackId}
                modpackName={name || modpack.modpackId}
                onClose={() => setSettingsOpen(false)}
                onSave={(s) => setModpackSettings(s)}
            />
        )}
            <div style={detail.screen(bgUrl)}>
                <div style={detail.overlay} />

                {/* ── Overlay de instalación ───────────────────────── */}
                {installing && progress && (
                    <div style={installOverlay.wrap}>
                        <div style={installOverlay.card}>
                            <div style={installOverlay.header}>
                                <span style={installOverlay.title}>Instalando modpack</span>
                                <span style={installOverlay.step}>{progress.step}</span>
                            </div>

                            <div style={installOverlay.trackWrap}>
                                <div style={installOverlay.trackRow}>
                                    <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Progreso</span>
                                    <span style={installOverlay.percent}>{progress.percent}%</span>
                                </div>
                                <div style={installOverlay.track}>
                                    <div style={installOverlay.bar(progress.percent)} />
                                </div>
                            </div>

                            {progress.mode === 'download' && (
                                <>
                                    <div style={installOverlay.divider} />
                                    <div style={installOverlay.statsRow}>
                                        <div style={installOverlay.stat}>
                                            <span style={installOverlay.statLabel}>Descargado</span>
                                            <span style={installOverlay.statValue}>
                                                {formatBytes(progress.downloadedBytes ?? 0)}
                                                {progress.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ''}
                                            </span>
                                        </div>
                                        <div style={installOverlay.stat}>
                                            <span style={installOverlay.statLabel}>Velocidad</span>
                                            <span style={installOverlay.statValue}>
                                                {formatSpeed(progress.speedBps ?? 0)}
                                            </span>
                                        </div>
                                        {progress.totalBytes && (
                                            <div style={installOverlay.stat}>
                                                <span style={installOverlay.statLabel}>Restante</span>
                                                <span style={installOverlay.statValue}>
                                                    {formatBytes(progress.totalBytes - (progress.downloadedBytes ?? 0))}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}

                            {progress.mode === 'extract' && (
                                <>
                                    <div style={installOverlay.divider} />
                                    <div style={installOverlay.statsRow}>
                                        <div style={installOverlay.stat}>
                                            <span style={installOverlay.statLabel}>Archivos</span>
                                            <span style={installOverlay.statValue}>
                                                {progress.extractedFiles ?? 0} / {progress.totalFiles ?? 0}
                                            </span>
                                        </div>
                                        <div style={installOverlay.stat}>
                                            <span style={installOverlay.statLabel}>Velocidad</span>
                                            <span style={installOverlay.statValue}>
                                                {(progress.speedFps ?? 0).toFixed(1)} arch/s
                                            </span>
                                        </div>
                                        <div style={installOverlay.stat}>
                                            <span style={installOverlay.statLabel}>Restantes</span>
                                            <span style={installOverlay.statValue}>
                                                {(progress.totalFiles ?? 0) - (progress.extractedFiles ?? 0)}
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                )
                }

                <div style={detail.content}>
                    <div style={detail.infoRow}>
                        <div style={detail.textCol}>
                            <h1 style={detail.title}>{name || modpack.modpackId}</h1>
                            <div style={detail.metaRow}>
                                <span style={detail.metaTag}>MC {modpack.minecraftVersion}</span>
                                <span style={detail.metaTag}>Forge {modpack.forgeVersion}</span>
                            </div>
                            {launchError && (
                                <span style={{
                                    fontSize: '12px',
                                    color: 'var(--error-text)',
                                    marginTop: '6px',
                                    maxWidth: '480px',
                                    wordBreak: 'break-word',
                                }}>
                                    {launchError}
                                </span>
                            )}
                        </div>

                        <div style={detail.actionsCol}>
                            <button
                                style={{
                                    ...detail.playButton,
                                    opacity: isBusy || !basePath ? 0.5 : 1,
                                    cursor: isBusy || !basePath ? 'not-allowed' : 'pointer',
                                }}
                                disabled={isBusy || !basePath}
                                onClick={() => isInstalled ? handlePlay(modpack) : handleInstall(modpack)}
                            >
                                {playButtonLabel()}
                            </button>

                            <div style={detail.menuWrap} ref={menuRef}>
                                <button
                                    style={{ ...detail.menuButton, ...(menuOpen ? detail.menuButtonHover : {}) }}
                                    onClick={() => setMenuOpen((v) => !v)}
                                    aria-label="Más opciones"
                                    disabled={isBusy}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <circle cx="12" cy="5" r="2" />
                                        <circle cx="12" cy="12" r="2" />
                                        <circle cx="12" cy="19" r="2" />
                                    </svg>
                                </button>

                                {menuOpen && (
                                    <div style={detail.dropdown}>
                                        {menuItems.map((menuItem, idx) => {
                                            const disabled = menuItem.requiresInstall && !isInstalled;
                                            return (
                                                <div key={menuItem.id}>
                                                    <div
                                                        style={detail.dropdownItem(menuHoverId === menuItem.id, menuItem.danger, disabled)}
                                                        onMouseEnter={() => !disabled && setMenuHoverId(menuItem.id)}
                                                        onMouseLeave={() => setMenuHoverId(null)}
                                                        onClick={() => {
                                                            if (disabled) return;
                                                            menuItem.onClick();
                                                            setMenuOpen(false);
                                                        }}
                                                    >
                                                        <span style={detail.dropdownIcon}>{menuItem.icon}</span>
                                                        {menuItem.label}
                                                    </div>
                                                    {idx === 0 && <div style={detail.dropdownDivider} />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}