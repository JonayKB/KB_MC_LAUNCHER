import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { open } from '@tauri-apps/plugin-shell';
import { home } from "../styles/homeStyles";
import { useUser } from "../context/UserContext";
import { useInstall } from "../context/InstallContext";
import { ModpackOverview, ModpackStatus, useModpackOverview } from "../hooks/useModpackOverview";
import { useGameRunning } from "../hooks/useGameRunning";
import { ensureModpackSettings, launchModpack } from "../repositories/ModpackActions";
import { formatTimeAgo, getLastPlayed, getPlayHistory } from "../repositories/PlayHistory";
import { LOADER_LABELS, resolveLoader } from "../types/modpack";
import type { RecommendedSettings } from "../types/modpackSettings";
import DiscordCard from "../components/DiscordCard";

const GITHUB_ISSUES_URL = 'https://github.com/jonaykb/KB_MC_LAUNCHER/issues';

const STATUS_LABELS: Record<ModpackStatus, string> = {
    'installed': 'Instalado',
    'update-available': 'Actualización',
    'not-installed': 'No instalado',
};

function greeting(): string {
    const h = new Date().getHours();
    if (h < 7 || h >= 21) return 'Buenas noches';
    if (h < 14) return 'Buenos días';
    return 'Buenas tardes';
}

function formatGb(mb: number): string {
    return `${(mb / 1024).toFixed(mb >= 10240 ? 0 : 1)} GB`;
}

function openModpack(navigate: ReturnType<typeof useNavigate>, item: ModpackOverview) {
    navigate(`/modpacks/${item.entry.id}`, { state: { name: item.entry.name } });
}

// ── Hero: modpack destacado (último jugado) con acción directa ─────────────

function HeroCard({ item, lastPlayedAt }: Readonly<{ item: ModpackOverview; lastPlayedAt?: number }>) {
    const navigate = useNavigate();
    const { basePath, ensureActiveSession } = useUser();
    const { job, isInstalling, startInstall } = useInstall();
    const playing = useGameRunning(item.latest?.modpackId);
    const [launching, setLaunching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [primaryHovered, setPrimaryHovered] = useState(false);
    const [ghostHovered, setGhostHovered] = useState(false);

    const { entry, latest, status } = item;
    const installingThis = isInstalling && job?.modpackId === latest?.modpackId;
    const image = latest?.images?.[0] ?? entry.imageUrl;
    const loader = latest ? resolveLoader(latest) : null;

    async function handlePrimary() {
        if (!latest || !basePath) return;
        setError(null);
        if (status === 'installed') {
            setLaunching(true);
            try {
                const account = await ensureActiveSession();
                await launchModpack(latest, basePath, account);
            } catch (err) {
                setError(`Error al lanzar: ${err}`);
            } finally {
                setLaunching(false);
            }
            return;
        }
        await ensureModpackSettings(latest.modpackId);
        // El progreso y los errores se muestran en la notificación global
        await startInstall(latest, { name: entry.name, basePath, isUpdate: status === 'update-available' });
    }

    let primaryLabel = 'Instalar';
    if (installingThis) primaryLabel = `Instalando... ${job?.progress.percent ?? 0}%`;
    else if (playing) primaryLabel = 'En juego';
    else if (launching) primaryLabel = 'Lanzando...';
    else if (status === 'installed') primaryLabel = 'Jugar';
    else if (status === 'update-available') primaryLabel = 'Actualizar';
    const primaryDisabled = !latest || !basePath || isInstalling || playing || launching;

    const eyebrow = lastPlayedAt
        ? `Continuar jugando · ${formatTimeAgo(lastPlayedAt)}`
        : 'Modpack destacado';

    return (
        <section style={home.hero(image)}>
            <div style={home.heroContent}>
                <span style={home.heroEyebrow}>{eyebrow}</span>
                <h2 style={home.heroTitle}>{entry.name}</h2>
                {entry.description && <p style={home.heroDesc}>{entry.description}</p>}
                <div style={home.tagRow}>
                    {latest && <span style={home.tag}>MC {latest.minecraftVersion}</span>}
                    {loader && <span style={home.tag}>{LOADER_LABELS[loader.loader]} {loader.loaderVersion}</span>}
                    {latest && <span style={home.tag}>v{latest.version}</span>}
                    <span style={{ ...home.tag, color: status === 'update-available' ? 'var(--warning)' : home.tag.color }}>
                        {STATUS_LABELS[status]}
                    </span>
                </div>
                <div style={home.heroActions}>
                    {latest && (
                        <button
                            style={home.primaryBtn(primaryHovered, primaryDisabled)}
                            disabled={primaryDisabled}
                            onMouseEnter={() => setPrimaryHovered(true)}
                            onMouseLeave={() => setPrimaryHovered(false)}
                            onClick={handlePrimary}
                        >
                            {primaryLabel}
                        </button>
                    )}
                    <button
                        style={home.ghostBtn(ghostHovered)}
                        onMouseEnter={() => setGhostHovered(true)}
                        onMouseLeave={() => setGhostHovered(false)}
                        onClick={() => openModpack(navigate, item)}
                    >
                        Ver detalles
                    </button>
                </div>
                {error && <span style={home.heroError}>{error}</span>}
            </div>
        </section>
    );
}

// ── Piezas pequeñas ────────────────────────────────────────────────────────

function StatTile({ icon, label, value, hint }: Readonly<{ icon: React.ReactNode; label: string; value: string; hint?: string }>) {
    return (
        <div style={home.stat}>
            <div style={home.statIcon}>{icon}</div>
            <div style={home.statText}>
                <span style={home.statLabel}>{label}</span>
                <span style={home.statValue} title={value}>{value}</span>
                {hint && <span style={home.statHint} title={hint}>{hint}</span>}
            </div>
        </div>
    );
}

function ModpackCard({ item, onOpen }: Readonly<{ item: ModpackOverview; onOpen: () => void }>) {
    const [hovered, setHovered] = useState(false);
    const { entry, latest, status } = item;
    const loader = latest ? resolveLoader(latest) : null;
    return (
        <button
            style={home.card(hovered)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={onOpen}
        >
            <div style={home.cardImage(entry.imageUrl ?? latest?.images?.[0])}>
                <span style={home.statusBadge(status)}>
                    <span style={home.statusDot(status)} />
                    {STATUS_LABELS[status]}
                </span>
            </div>
            <div style={home.cardBody}>
                <span style={home.cardName}>{entry.name}</span>
                {latest && loader && (
                    <span style={home.cardMeta}>
                        MC {latest.minecraftVersion} · {LOADER_LABELS[loader.loader]} · v{latest.version}
                    </span>
                )}
                {entry.description && <span style={home.cardDesc}>{entry.description}</span>}
            </div>
        </button>
    );
}

function QuickLink({ icon, label, onClick }: Readonly<{ icon: React.ReactNode; label: string; onClick: () => void }>) {
    const [hovered, setHovered] = useState(false);
    return (
        <button
            style={home.linkRow(hovered)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={onClick}
        >
            <span style={{ display: 'flex', color: 'var(--text-faint)' }}>{icon}</span>
            {label}
        </button>
    );
}

const icon = (d: React.ReactNode) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

// ── Pantalla ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
    const navigate = useNavigate();
    const { activeAccount, basePath } = useUser();
    const { items, error, reload } = useModpackOverview(basePath);
    const [recommended, setRecommended] = useState<RecommendedSettings | null>(null);
    const [launcherVersion, setLauncherVersion] = useState('');
    // Se lee al montar: al volver a la Home tras jugar ya aparece actualizado
    const [history] = useState(getPlayHistory);

    useEffect(() => {
        invoke<RecommendedSettings>('get_recommended_settings').then(setRecommended).catch(() => { });
        getVersion().then(setLauncherVersion).catch(() => { });
    }, []);

    const lastPlayedId = getLastPlayed(history);
    const featured = useMemo(() => {
        if (!items || items.length === 0) return null;
        return items.find(i => i.entry.id === lastPlayedId || i.latest?.modpackId === lastPlayedId)
            ?? items.find(i => i.status === 'update-available')
            ?? items[0];
    }, [items, lastPlayedId]);
    const featuredLastPlayed = featured
        ? history[featured.latest?.modpackId ?? featured.entry.id] ?? history[featured.entry.id]
        : undefined;

    const installedCount = items?.filter(i => i.status !== 'not-installed').length ?? 0;
    const updatesCount = items?.filter(i => i.status === 'update-available').length ?? 0;
    const lastPlayedAt = lastPlayedId ? history[lastPlayedId] : undefined;

    let modpacksHint = 'Todo al día';
    if (updatesCount > 0) modpacksHint = `${updatesCount} ${updatesCount === 1 ? 'actualización disponible' : 'actualizaciones disponibles'}`;
    else if (installedCount === 0) modpacksHint = 'Instala uno para empezar';

    const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

    return (
        <div style={home.screen}>
            <div style={home.main}>
                <header style={home.headerRow}>
                    <div>
                        <span style={home.eyebrow}>{today}</span>
                        <h1 style={home.title}>
                            {greeting()}{activeAccount?.username ? `, ${activeAccount.username}` : ''}
                        </h1>
                    </div>
                </header>

                {error ? (
                    <div style={home.empty}>
                        <span>No se pudieron cargar los modpacks. Comprueba tu conexión.</span>
                        <button style={home.retryBtn} onClick={reload}>Reintentar</button>
                    </div>
                ) : items === null ? (
                    <div style={home.heroSkeleton} />
                ) : featured ? (
                    <HeroCard item={featured} lastPlayedAt={featuredLastPlayed} />
                ) : (
                    <div style={home.empty}>Todavía no hay modpacks disponibles.</div>
                )}

                <div style={home.stats}>
                    <StatTile
                        icon={icon(<><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></>)}
                        label="Cuenta"
                        value={activeAccount?.username ?? 'Sin cuenta'}
                        hint={activeAccount ? (activeAccount.isOnline ? 'Microsoft' : 'Offline') : undefined}
                    />
                    <StatTile
                        icon={icon(<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>)}
                        label="Modpacks"
                        value={items ? `${installedCount} de ${items.length} instalados` : '—'}
                        hint={items ? modpacksHint : undefined}
                    />
                    <StatTile
                        icon={icon(<><rect x="2" y="7" width="20" height="10" rx="1" /><line x1="6" y1="11" x2="6" y2="13" /><line x1="10" y1="11" x2="10" y2="13" /><line x1="14" y1="11" x2="14" y2="13" /><line x1="18" y1="11" x2="18" y2="13" /></>)}
                        label="Memoria"
                        value={recommended ? `${formatGb(recommended.total_ram_mb)} en total` : '—'}
                        hint={recommended ? `${formatGb(recommended.max_ram_mb)} recomendados para MC` : undefined}
                    />
                    <StatTile
                        icon={icon(<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>)}
                        label="Última partida"
                        value={lastPlayedAt ? formatTimeAgo(lastPlayedAt) : 'Aún no has jugado'}
                        hint={launcherVersion ? `Launcher v${launcherVersion}` : undefined}
                    />
                </div>

                <section>
                    <h2 style={home.sectionTitle}>Todos los modpacks</h2>
                    {items === null && !error ? (
                        <div style={home.grid}>
                            {[0, 1, 2].map(i => <div key={i} style={home.skeletonCard(i)} />)}
                        </div>
                    ) : items && items.length > 0 ? (
                        <div style={home.grid}>
                            {items.map(item => (
                                <ModpackCard key={item.entry.id} item={item} onOpen={() => openModpack(navigate, item)} />
                            ))}
                        </div>
                    ) : null}
                </section>

                {featured?.latest?.changelog && (
                    <section>
                        <h2 style={home.sectionTitle}>Novedades de {featured.entry.name} v{featured.latest.version}</h2>
                        <div style={home.panel}>
                            <pre style={home.changelog}>{featured.latest.changelog}</pre>
                        </div>
                    </section>
                )}
            </div>

            <aside style={home.side}>
                <DiscordCard />
                <div style={{ ...home.panel, marginTop: 0, padding: '10px' }}>
                    <h2 style={{ ...home.sectionTitle, padding: '6px 12px 8px' }}>Accesos rápidos</h2>
                    {basePath && (
                        <QuickLink
                            icon={icon(<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />)}
                            label="Abrir carpeta del launcher"
                            onClick={() => invoke('open_directory', { path: basePath }).catch(console.error)}
                        />
                    )}
                    <QuickLink
                        icon={icon(<><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>)}
                        label="Reportar un error"
                        onClick={() => open(GITHUB_ISSUES_URL)}
                    />
                </div>
            </aside>
        </div>
    );
}
