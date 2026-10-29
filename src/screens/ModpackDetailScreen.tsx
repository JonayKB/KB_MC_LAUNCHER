import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { ModpackEntry, ModpackVersion, LOADER_LABELS, formatCountdown, formatReleaseDate, releaseTime, resolveLoader } from "../types/modpack";
import { fetchModpackIndex, fetchModpackVersion } from "../repositories/ModpackRepository";
import { useNow } from "../hooks/useNow";
import { detail, loading } from "../styles/modpackDetailStyles";
import { invoke } from "@tauri-apps/api/core";
import { useUser } from "../context/UserContext";
import { useInstall } from "../context/InstallContext";
import { useGameRunning } from "../hooks/useGameRunning";
import { usePlaytime } from "../hooks/usePlaytime";
import { formatDuration, formatTimeAgo } from "../repositories/PlayHistory";
import { ensureModpackSettings, launchModpack } from "../repositories/ModpackActions";
import { ask } from '@tauri-apps/plugin-dialog';
import ModpackSettingsModal from "../components/ModpackSettingsModal";
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
    const { job, isInstalling: anyInstalling, startInstall, startUninstall } = useInstall();
    const [loadError, setLoadError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const playing = useGameRunning(modpack?.modpackId);
    const playtime = usePlaytime(modpack?.modpackId);
    const [historyOpen, setHistoryOpen] = useState(false);
    // La fecha de lanzamiento viene en index.json (latest.json no la trae)
    const [entry, setEntry] = useState<ModpackEntry | null>(null);
    const [indexChecked, setIndexChecked] = useState(false);
    useEffect(() => {
        if (!id) return;
        setIndexChecked(false);
        fetchModpackIndex()
            .then(index => setEntry(index.modpacks.find(m => m.id === id) ?? null))
            .catch(() => setEntry(null))
            .finally(() => setIndexChecked(true));
    }, [id]);
    const releaseAt = entry ? releaseTime(entry) : null;
    const now = useNow(releaseAt, true);
    const upcoming = releaseAt !== null && releaseAt > now;
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
        await ensureModpackSettings(modpack.modpackId);

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
    async function handleOpenLogs(modpack: ModpackVersion) {
        try {
            await invoke('open_game_logs', { modpackId: modpack.modpackId });
        } catch (err) {
            // Sin partida en esta sesión del launcher todavía no hay logs que mostrar
            setLaunchError(String(err));
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

        setLaunchError(null);
        // El estado y los errores se muestran en la notificación global
        const ok = await startUninstall(modpack, { name: name || modpack.modpackId, basePath });
        if (ok) {
            setIsInstalled(false);
            setInstalledVersion(null);
        } else {
            refreshInstallState();
        }
    }

    async function handlePlay(modpack: ModpackVersion) {
        if (!basePath) return;
        setLaunching(true);
        setLaunchError(null);
        try {
            const account = await ensureActiveSession();
            await launchModpack(modpack, basePath, account, name || modpack.modpackId);
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
            id: 'logs', label: 'Consola del juego', requiresInstall: true,
            onClick: () => handleOpenLogs(modpack),
            icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>,
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

    // Antes de la fecha no se puede instalar ni actualizar; jugar sí, si ya estaba instalado
    const blockedByRelease = upcoming && (!isInstalled || needsUpdate);

    // Mientras no se sepa la fecha de lanzamiento no se deja instalar
    const playDisabled = isBusy || !basePath || blockedByRelease || (!indexChecked && !isInstalled);

    const playButtonLabel = () => {
        if (blockedByRelease && releaseAt !== null) return `Disponible en ${formatCountdown(releaseAt - now)}`;
        if (installing && job?.isUninstall) return 'Desinstalando...';
        if (installing) return `${job?.isUpdate ? 'Actualizando' : 'Instalando'}... ${job?.progress.percent ?? 0}%`;
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
                                {upcoming && releaseAt !== null && (
                                    <span style={{ ...detail.metaTag, color: 'var(--accent)' }}>
                                        Lanzamiento: {formatReleaseDate(releaseAt)}
                                    </span>
                                )}
                                {needsUpdate && (
                                    <span style={{ ...detail.metaTag, color: 'var(--warning)' }}>
                                        Instalada v{installedVersion}
                                    </span>
                                )}
                            </div>
                            {playtime && playtime.sessionCount > 0 && (
                                <div style={detail.playtimeBox}>
                                    <button style={detail.playtimeSummary} onClick={() => setHistoryOpen(v => !v)}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                        <strong style={{ color: '#fff' }}>{formatDuration(playtime.totalSecs)}</strong> jugadas
                                        <span style={{ opacity: 0.6 }}>· {playtime.sessionCount} {playtime.sessionCount === 1 ? 'sesión' : 'sesiones'}</span>
                                        <span style={{ opacity: 0.6 }}>{historyOpen ? '▴' : '▾'}</span>
                                    </button>
                                    {historyOpen && (
                                        <ul style={detail.sessionList}>
                                            {playtime.sessions.slice(0, 8).map(s => (
                                                <li key={s.startedAt} style={detail.sessionRow}>
                                                    <span>
                                                        {new Date(s.startedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                                                        {' · '}
                                                        {new Date(s.startedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                                        <span style={{ opacity: 0.5 }}> ({formatTimeAgo(s.startedAt + s.durationSecs * 1000)})</span>
                                                    </span>
                                                    <span style={{ fontWeight: 700 }}>{formatDuration(s.durationSecs)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
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
                                    opacity: playDisabled ? 0.5 : 1,
                                    cursor: playDisabled ? 'not-allowed' : 'pointer',
                                }}
                                disabled={playDisabled}
                                onClick={() => isInstalled && !needsUpdate ? handlePlay(modpack) : handleInstall(modpack)}
                            >
                                {playButtonLabel()}
                            </button>

                            <div style={detail.menuWrap} ref={menuRef}>
                                <button
                                    style={{ ...detail.menuButton, ...(menuOpen ? detail.menuButtonHover : {}) }}
                                    onClick={() => setMenuOpen((v) => !v)}
                                    aria-label="Más opciones"
                                    // Abierto también en partida, para poder ver la consola
                                    disabled={anyInstalling || launching}
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
                                            const disabled = (menuItem.requiresInstall && !isInstalled)
                                                || (menuItem.id === 'uninstall' && playing);
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