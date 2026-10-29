import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchDiscordInvite, DiscordInviteInfo } from "../repositories/DiscordRepository";
import { fetchModpackIndex } from "../repositories/ModpackRepository";
import { discordCard, discordSkeleton } from "../styles/discordCardStyles";
import { home } from "../styles/homeStyles";
import { open } from '@tauri-apps/plugin-shell';
import { useUser } from "../context/UserContext";
import type { ModpackEntry } from "../types";

function ModpackCard({ modpack, onOpen }: Readonly<{ modpack: ModpackEntry; onOpen: () => void }>) {
    const [hovered, setHovered] = useState(false);
    return (
        <button
            style={home.card(hovered)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={onOpen}
        >
            <div style={home.cardImage(modpack.imageUrl)} />
            <div style={home.cardBody}>
                <span style={home.cardName}>{modpack.name}</span>
                {modpack.description && <span style={home.cardDesc}>{modpack.description}</span>}
                <span style={home.cardCta(hovered)}>Ver modpack →</span>
            </div>
        </button>
    );
}

export default function HomeScreen() {
    const [discord, setDiscord] = useState<DiscordInviteInfo | null>(null);
    const [discordLoading, setDiscordLoading] = useState(true);
    const [discordError, setDiscordError] = useState(false);
    const [btnHovered, setBtnHovered] = useState(false);
    const [modpacks, setModpacks] = useState<ModpackEntry[] | null>(null);
    const [modpacksError, setModpacksError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const { activeAccount } = useUser();
    const navigate = useNavigate();

    useEffect(() => {
        setModpacks(null);
        setModpacksError(false);
        fetchModpackIndex()
            .then((data) => setModpacks(data.modpacks))
            .catch(() => setModpacksError(true));
    }, [reloadKey]);

    useEffect(() => {
        fetchDiscordInvite()
            .then((data) => {
                setDiscord(data);
                setDiscordError(false);
            })
            .catch(() => setDiscordError(true))
            .finally(() => setDiscordLoading(false));
    }, []);

    return (
        <div style={home.screen}>
            <div style={home.main}>
                <header>
                    <span style={home.eyebrow}>KB MC Launcher</span>
                    <h1 style={home.title}>
                        {activeAccount?.username ? `Hola, ${activeAccount.username}` : 'Bienvenido'}
                    </h1>
                    <p style={home.subtitle}>Elige un modpack para empezar a jugar.</p>
                </header>

                <section>
                    <h2 style={home.sectionTitle}>Modpacks</h2>
                    {modpacksError ? (
                        <div style={home.empty}>
                            <span>No se pudieron cargar los modpacks. Comprueba tu conexión.</span>
                            <button style={home.retryBtn} onClick={() => setReloadKey(k => k + 1)}>Reintentar</button>
                        </div>
                    ) : modpacks === null ? (
                        <div style={home.grid}>
                            {[0, 1, 2].map(i => <div key={i} style={home.skeletonCard(i)} />)}
                        </div>
                    ) : modpacks.length === 0 ? (
                        <div style={home.empty}>Todavía no hay modpacks disponibles.</div>
                    ) : (
                        <div style={home.grid}>
                            {modpacks.map(m => (
                                <ModpackCard
                                    key={m.id}
                                    modpack={m}
                                    onOpen={() => navigate(`/modpacks/${m.id}`, { state: { name: m.name } })}
                                />
                            ))}
                        </div>
                    )}
                </section>
            </div>

            <aside style={home.side}>

                {discordLoading && (
                    <div style={discordSkeleton.wrap}>
                        <div style={discordSkeleton.content}>
                            <div style={discordSkeleton.topRow}>
                                <div style={discordSkeleton.pulse('48px', '48px', 'var(--radius-lg)')} />
                                <div style={discordSkeleton.headerCol}>
                                    <div style={discordSkeleton.pulse('90px', '10px')} />
                                    <div style={discordSkeleton.pulse('140px', '14px')} />
                                </div>
                            </div>
                            <div style={discordSkeleton.pulse('100%', '12px')} />
                            <div style={discordSkeleton.pulse('70%', '12px')} />
                            <div style={discordSkeleton.pulse('160px', '12px')} />
                            <div style={discordSkeleton.pulse('100%', '38px', 'var(--radius-md)')} />
                        </div>
                    </div>
                )}

                {!discordLoading && discord && (
                    <div style={discordCard.wrap(discord.guildBannerUrl)}>
                        <div style={discordCard.content}>
                            <div style={discordCard.topRow}>
                                {discord.guildIconUrl && (
                                    <img src={discord.guildIconUrl} alt={discord.guildName} style={discordCard.icon} />
                                )}
                                <div style={discordCard.headerText}>
                                    <span style={discordCard.eyebrow}>Comunidad oficial</span>
                                    <span style={discordCard.name}>{discord.guildName}</span>
                                </div>
                            </div>

                            {discord.description && (
                                <span style={discordCard.desc}>{discord.description}</span>
                            )}

                            <div style={discordCard.membersRow}>
                                <span style={discordCard.memberStat}>
                                    <span style={discordCard.dot('var(--success)')} />
                                    {discord.presenceCount} online
                                </span>
                                <span style={discordCard.memberStat}>
                                    <span style={discordCard.dot('rgba(255,255,255,0.4)')} />
                                    {discord.memberCount} miembros
                                </span>
                            </div>

                            <span style={discordCard.required}>
                                ⚠ Entrada obligatoria para confirmarte en el servidor
                            </span>

                            <button
                                style={{
                                    ...discordCard.button,
                                    backgroundColor: btnHovered ? 'var(--accent-hover)' : 'var(--accent)',
                                }}
                                onMouseEnter={() => setBtnHovered(true)}
                                onMouseLeave={() => setBtnHovered(false)}
                                onClick={() => open(discord.inviteUrl)}
                            >
                                Unirse al Discord
                            </button>
                        </div>
                    </div>
                )}

                {!discordLoading && discordError && (
                    <div style={discordSkeleton.wrap}>
                        <div style={discordSkeleton.content}>
                            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                No se pudo cargar la información del Discord.
                            </span>
                        </div>
                    </div>
                )}
            </aside>
        </div>
    );
}