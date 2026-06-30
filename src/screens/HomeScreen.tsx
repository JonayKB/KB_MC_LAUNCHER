import { useEffect, useState } from "react";
import { fetchDiscordInvite, DiscordInviteInfo } from "../repositories/DiscordRepository";
import { discordCard, discordSkeleton } from "../styles/discordCardStyles";
import { open } from '@tauri-apps/plugin-shell';

export default function HomeScreen() {
    const [discord, setDiscord] = useState<DiscordInviteInfo | null>(null);
    const [discordLoading, setDiscordLoading] = useState(true);
    const [discordError, setDiscordError] = useState(false);
    const [btnHovered, setBtnHovered] = useState(false);

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
            <div style={{ textAlign: 'center' }}>
                <h1>Bienvenido al Launcher</h1>
                <p>Selecciona un modpack para comenzar a jugar.</p>
            </div>

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
        </div>
    );
}