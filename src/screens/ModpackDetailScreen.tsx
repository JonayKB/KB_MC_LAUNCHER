import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { ModpackVersion, LOADER_LABELS, resolveLoader } from "../types/modpack";
import { fetchModpackVersion } from "../repositories/ModpackRepository";
import { detail, loading } from "../styles/modpackDetailStyles";
import { invoke } from "@tauri-apps/api/core";
import { useUser } from "../context/UserContext";
import { useInstall } from "../context/InstallContext";
import { useGameRunning } from "../hooks/useGameRunning";
import { ensureModpackSettings, launchModpack } from "../repositories/ModpackActions";
import { ask } from '@tauri-apps/plugin-dialog';
import { ModpackSettings } from "../types/modpackSettings";
import ModpackSettingsModal, { loadSettings } from "../components/ModpackSettingsModal";
const IMAGE_ROTATE_MS = 6000;



export default function ModpackDetailScreen() {
    const { id } = useParams<{ id: string }>();
    const [modpack, setModpack] = useState<ModpackVersion | null>(null);
    const [imageIndex, setImageIndex] = useState(0);
    const [isInstalled, setIsInstalled] = useState(false);
    const [installedVersion, setInstalledVersion] = useState<string | null>(null);
    const [launching, setLaunching] = useState(false);
    const [launchError, setLaunchError] = useState<string | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuHoverId, setMenuHoverId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const location = useLocation();
    const name = (location.state as { name?: string } | null)?.name;
    const { basePath, ensureActiveSession } = useUser();
    const { job, isInstalling: anyInstalling, startInstall } = useInstall();
    const [loadError, setLoadError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [modpackSettings, setModpackSettings] = useState<ModpackSettings | null>(null);
    const playing = useGameRunning(modpack?.modpackId);
    // Fetch modpack data
    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        setModpack(null);
        setLoadError(null);
        fetchModpackVersion(id)
            .then((modpackData) => {
                if (cancelled) return;
                setModpack(modpackData);
                setImageIndex(0);
            })
            .catch((err) => {
                if (!cancelled) setLoadError(String(err));
            });
        return () => { cancelled = true; };
    }, [id, reloadKey]);



    // Comprobar instalación cuando tenemos modpack y basePath
    function refreshInstallState() {
        if (!modpack || !basePath) return;
        invoke<boolean>('is_modpack_installed', {
            basePath,
            modpackId: modpack.modpackId,
        }).then(setIsInstalled).catch(() => setIsInstalled(false));
        invoke<string | null>('get_installed_version', {
            basePath,
            modpackId: modpack.modpackId,
        }).then(setInstalledVersion).catch(() => setInstalledVersion(null));
    }
    // Se vuelve a comprobar cuando termina cualquier instalación (p.ej. lanzada
    // desde esta pantalla, se cambió de pantalla y se ha vuelto)
    const jobFinished = job !== null && job.status !== 'running' && job.status !== 'cancelling';
    useEffect(refreshInstallState, [modpack, basePath, jobFinished]);

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
        setModpackSettings(await ensureModpackSettings(modpack.modpackId));

        setLaunchError(null);
        const ok = await startInstall(modpack, {
            name: name || modpack.modpackId,
            basePath,
            isUpdate: isInstalled,
        });
        if (ok) {
            setIsInstalled(true);
            setInstalledVersion(modpack.version);
        } else {
            // Al cancelar/fallar puede haber quedado a medias: recomprobar en disco
            refreshInstallState();
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
            setInstalledVersion(null);
        } catch (err) {
            console.error('Error desinstalando:', err);
            setLaunchError(`Error desinstalando: ${err}`);
        }
    }

    async function handlePlay(modpack: ModpackVersion) {
        if (!basePath) return;
        setLaunching(true);
        setLaunchError(null);
        try {
            const account = await ensureActiveSession();
            await launchModpack(modpack, basePath, account, modpackSettings ?? undefined);
        } catch (err) {
            setLaunchError(`Error al lanzar: ${err}`);
        } finally {
            setLaunching(false);
        }
    }

    if (!modpack && loadError) {
        return (
            <div style={detail.screen(null)}>
                <div style={loading.wrap}>
                    <span style={loading.text}>No se pudo cargar la información del modpack.</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-faint)', maxWidth: '420px', textAlign: 'center' }}>{loadError}</span>
                    <button style={{ ...detail.menuButton, width: 'auto', padding: '0 16px' }} onClick={() => setReloadKey(k => k + 1)}>
                        Reintentar
                    </button>
                </div>
            </div>
        );
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
    const loaderInfo = resolveLoader(modpack);
    const installing = job?.modpackId === modpack.modpackId && anyInstalling;
    // Solo una instalación a la vez, aunque sea de otro modpack
    const isBusy = anyInstalling || launching || playing;
    // Sin versión registrada (instalación antigua) no se fuerza la actualización
    const needsUpdate = isInstalled && installedVersion !== null && installedVersion !== modpack.version;

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
        if (installing) return `${isInstalled ? 'Actualizando' : 'Instalando'}... ${job?.progress.percent ?? 0}%`;
        if (anyInstalling) return 'Otra instalación en curso';
        if (launching) return 'Lanzando...';
        if (playing) return 'En juego';
        if (needsUpdate) return 'Actualizar';
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

                <div style={detail.content}>
                    <div style={detail.infoRow}>
                        <div style={detail.textCol}>
                            <h1 style={detail.title}>{name || modpack.modpackId}</h1>
                            <div style={detail.metaRow}>
                                <span style={detail.metaTag}>MC {modpack.minecraftVersion}</span>
                                <span style={detail.metaTag}>{LOADER_LABELS[loaderInfo.loader]} {loaderInfo.loaderVersion}</span>
                                <span style={detail.metaTag}>v{modpack.version}</span>
                                {needsUpdate && (
                                    <span style={{ ...detail.metaTag, color: 'var(--warning)' }}>
                                        Instalada v{installedVersion}
                                    </span>
                                )}
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
                                onClick={() => isInstalled && !needsUpdate ? handlePlay(modpack) : handleInstall(modpack)}
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