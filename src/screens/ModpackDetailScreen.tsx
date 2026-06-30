import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { ModpackVersion } from "../types";
import { fetchModpackVersion } from "../repositories/ModpackRepository";
import { detail, loading } from "../styles/modpackDetailStyles";

const IMAGE_ROTATE_MS = 6000;

// ── Acciones vacías por ahora ────────────────────────────────
function handleInstall(modpack: ModpackVersion) {
    // TODO: lógica de instalación
}

function handlePlay(modpack: ModpackVersion) {
    // TODO: lógica de lanzar el juego
}

function handleRepair(modpack: ModpackVersion) {
    // TODO: reparar instalación
}

function handleUninstall(modpack: ModpackVersion) {
    // TODO: desinstalar modpack
}

function handleOpenFiles(modpack: ModpackVersion) {
    // TODO: abrir carpeta de archivos
}

function handleOpenSettings(modpack: ModpackVersion) {
    // TODO: abrir ajustes del modpack
}

export default function ModpackDetailScreen() {
    const { id } = useParams<{ id: string }>();
    const [modpack, setModpack] = useState<ModpackVersion | null>(null);
    const [imageIndex, setImageIndex] = useState(0);
    const [isInstalled, setIsInstalled] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuHoverId, setMenuHoverId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const location = useLocation();
    const name = (location.state as { name?: string } | null)?.name;

    useEffect(() => {
        const fetchData = async () => {
            if (id) {
                const modpackData: ModpackVersion = await fetchModpackVersion(id);
                setModpack(modpackData);
                setImageIndex(0);
            }
        };
        fetchData();
    }, [id]);

    useEffect(() => {
        const images = modpack?.images;
        if (!images || images.length < 2) return;

        const interval = setInterval(() => {
            setImageIndex((prev) => (prev + 1) % images.length);
        }, IMAGE_ROTATE_MS);

        return () => clearInterval(interval);
    }, [modpack]);

    // Cerrar el menú al hacer click fuera
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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

    const menuItems = [
        {
            id: 'repair',
            label: 'Reparar',
            onClick: () => handleRepair(modpack),
            icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
            ),
        },
        {
            id: 'uninstall',
            label: 'Desinstalar',
            onClick: () => handleUninstall(modpack),
            danger: true,
            icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
            ),
        },
        {
            id: 'files',
            label: 'Ver archivos',
            onClick: () => handleOpenFiles(modpack),
            icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
            ),
        },
        {
            id: 'settings',
            label: 'Ajustes del modpack',
            onClick: () => handleOpenSettings(modpack),
            icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
            ),
        },
    ];

    return (
        <div style={detail.screen(bgUrl)}>
            <div style={detail.overlay} />
            <div style={detail.content}>
                <div style={detail.infoRow}>
                    <div style={detail.textCol}>
                        <h1 style={detail.title}>{name || modpack.modpackId}</h1>
                        <div style={detail.metaRow}>
                            <span style={detail.metaTag}>MC {modpack.minecraftVersion}</span>
                            <span style={detail.metaTag}>Forge {modpack.forgeVersion}</span>
                        </div>
                    </div>

                    <div style={detail.actionsCol}>
                        <button
                            style={detail.playButton}
                            onClick={() => (isInstalled ? handlePlay(modpack) : handleInstall(modpack))}
                        >
                            {isInstalled ? 'Jugar' : 'Instalar'}
                        </button>

                        <div style={detail.menuWrap} ref={menuRef}>
                            <button
                                style={{
                                    ...detail.menuButton,
                                    ...(menuOpen ? detail.menuButtonHover : {}),
                                }}
                                onClick={() => setMenuOpen((v) => !v)}
                                aria-label="Más opciones"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                    <circle cx="12" cy="5" r="2" />
                                    <circle cx="12" cy="12" r="2" />
                                    <circle cx="12" cy="19" r="2" />
                                </svg>
                            </button>

                            {menuOpen && (
                                <div style={detail.dropdown}>
                                    {menuItems.map((menuItem, idx) => (
                                        <div key={menuItem.id}>
                                            <div
                                                style={detail.dropdownItem(menuHoverId === menuItem.id, menuItem.danger)}
                                                onMouseEnter={() => setMenuHoverId(menuItem.id)}
                                                onMouseLeave={() => setMenuHoverId(null)}
                                                onClick={() => {
                                                    menuItem.onClick();
                                                    setMenuOpen(false);
                                                }}
                                            >
                                                <span style={detail.dropdownIcon}>{menuItem.icon}</span>
                                                {menuItem.label}
                                            </div>
                                            {idx === 0 && <div style={detail.dropdownDivider} />}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}