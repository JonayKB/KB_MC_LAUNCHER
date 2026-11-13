import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-shell';
import { server as s } from '../styles/modpackDetailStyles';
import { STAT_KEYS, STAT_LABELS, formatStat, type Period, type PlayerStats, type ServerStatus } from '../repositories/ServerRepository';
import { formatDuration, formatTimeAgo } from '../repositories/PlayHistory';
import type { usePlaytime } from '../hooks/usePlaytime';

/** Por debajo de esto el servidor va con lag (20 es lo normal) */
const LAG_TPS = 15;

const Sep = () => <span style={s.sep}>·</span>;

/**
 * Una línea bajo las etiquetas del modpack: quién está jugando, la IP para copiarla y el mapa.
 * Sin respuesta del bot solo se muestra la IP.
 */
export function ServerStrip({ address, status }: Readonly<{ address: string; status: ServerStatus | null }>) {
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied) return;
        const id = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(id);
    }, [copied]);

    function copy() {
        navigator.clipboard.writeText(address).then(() => setCopied(true)).catch(console.error);
    }

    const lagging = status?.online && status.tps !== null && status.tps < LAG_TPS;
    let who: string | undefined;
    if (status && status.players.length > 0) {
        const more = status.playersOnline - status.players.length;
        who = status.players.join(', ') + (more > 0 ? ` y ${more} más` : '');
    }

    return (
        <div style={s.strip}>
            {status && (
                <>
                    <span style={s.dot(status.online)} aria-hidden />
                    {status.online ? (
                        <span title={who}>
                            {status.playersOnline > 0
                                ? <><strong style={s.strong}>{status.playersOnline}</strong>/{status.maxPlayers} jugando</>
                                : 'Nadie conectado ahora'}
                        </span>
                    ) : (
                        <span>Servidor no disponible</span>
                    )}
                    {lagging && <span style={s.lag} title={`TPS ${status.tps}`}>· va con lag</span>}
                    <Sep />
                </>
            )}
            <button style={s.linkBtn} onClick={copy} title="Copiar la dirección del servidor">
                {copied ? (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>Copiada</>
                ) : (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>{address}</>
                )}
            </button>
            {status?.mapUrl && (
                <>
                    <Sep />
                    <button style={s.linkBtn} onClick={() => open(status.mapUrl!).catch(console.error)}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>
                        Mapa
                    </button>
                </>
            )}
        </div>
    );
}

function PeriodSwitch({ value, onChange }: Readonly<{ value: Period; onChange: (p: Period) => void }>) {
    return (
        <div style={s.switch} role="tablist">
            {(['total', 'weekly'] as const).map(p => (
                <button key={p} role="tab" aria-selected={value === p} style={s.switchBtn(value === p)} onClick={() => onChange(p)}>
                    {p === 'total' ? 'Total' : 'Esta semana'}
                </button>
            ))}
        </div>
    );
}

/**
 * Resumen plegable: tu tiempo y tu puesto en el servidor y, al abrirlo, tus estadísticas
 * y las sesiones de este equipo. Sin estadísticas del servidor, solo las sesiones (como antes).
 */
export function PlayerProgress({ stats, playtime }: Readonly<{ stats: PlayerStats | null; playtime: ReturnType<typeof usePlaytime> }>) {
    const [open, setOpen] = useState(false);
    const [period, setPeriod] = useState<Period>('total');
    const hasSessions = !!playtime && playtime.sessionCount > 0;
    if (!stats && !hasSessions) return null;

    const serverTime = stats?.total.playTimeSeconds;
    const weeklyRank = stats?.rank.weekly.playTimeSeconds ?? null;
    const totalRank = stats?.rank.total.playTimeSeconds ?? null;

    let summary;
    if (stats && serverTime !== undefined) {
        summary = (
            <>
                <strong style={s.strong}>{formatStat('playTimeSeconds', serverTime)}</strong> en el servidor
                {weeklyRank !== null && <span style={s.dim}>· #{weeklyRank} esta semana</span>}
                {weeklyRank === null && totalRank !== null && <span style={s.dim}>· #{totalRank} en total</span>}
            </>
        );
    } else if (playtime) {
        summary = (
            <>
                <strong style={s.strong}>{formatDuration(playtime.totalSecs)}</strong> jugadas
                <span style={s.dim}>· {playtime.sessionCount} {playtime.sessionCount === 1 ? 'sesión' : 'sesiones'}</span>
            </>
        );
    }

    const values = stats ? stats[period] : null;
    const ranked = stats?.rankedPlayers[period] ?? 0;

    return (
        <div style={s.progress}>
            <button style={s.summary} onClick={() => setOpen(v => !v)} aria-expanded={open}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                {summary}
                <span style={s.dim}>{open ? '▴' : '▾'}</span>
            </button>
            {open && (
                <div style={s.panel}>
                    {stats && values && (
                        <section style={s.panelSection}>
                            <div style={s.panelHead}>
                                <span style={s.panelTitle}>En el servidor</span>
                                <PeriodSwitch value={period} onChange={setPeriod} />
                            </div>
                            <div style={s.grid}>
                                {STAT_KEYS.map(key => {
                                    const rank = stats.rank[period][key] ?? null;
                                    return (
                                        <div key={key} style={s.cell}>
                                            <span style={s.cellValue}>{values[key] === undefined ? '—' : formatStat(key, values[key]!)}</span>
                                            <span style={s.cellLabel}>{STAT_LABELS[key]}</span>
                                            <span style={s.rank(rank !== null && rank <= 3)} title={rank !== null && ranked > 0 ? `Puesto ${rank} de ${ranked}` : undefined}>
                                                {rank === null ? ' ' : `#${rank}`}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            {stats.updatedAt && <span style={s.footnote}>Actualizado {formatTimeAgo(stats.updatedAt)}</span>}
                        </section>
                    )}
                    {hasSessions && (
                        <section style={s.panelSection}>
                            {/* Sin estadísticas del servidor, el resumen de arriba ya dice esto */}
                            {stats && (
                                <div style={s.panelHead}>
                                    <span style={s.panelTitle}>En este equipo</span>
                                    <span style={s.dim}>{formatDuration(playtime.totalSecs)} · {playtime.sessionCount} {playtime.sessionCount === 1 ? 'sesión' : 'sesiones'}</span>
                                </div>
                            )}
                            <ul style={s.sessionList}>
                                {playtime.sessions.slice(0, stats ? 4 : 8).map(session => (
                                    <li key={session.startedAt} style={s.sessionRow}>
                                        <span>
                                            {new Date(session.startedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                                            {' · '}
                                            {new Date(session.startedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                            {' '}<span style={s.dim}>({formatTimeAgo(session.startedAt + session.durationSecs * 1000)})</span>
                                        </span>
                                        <span style={{ fontWeight: 700 }}>{formatDuration(session.durationSecs)}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
}
