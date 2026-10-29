import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { logs, levelColor } from '../styles/logWindowStyles';
import { detectLevel, LogBatch, LogLevel, LogLine, LogSnapshot, LogStatus } from '../types/gameLogs';

/** Igual que MAX_LINES en game_logs.rs */
const MAX_LINES = 10_000;
/** Distancia al final (px) por debajo de la cual se sigue el log automáticamente */
const FOLLOW_THRESHOLD = 32;

type FilterLevel = Exclude<LogLevel, 'system'>;
interface Row extends LogLine { level: LogLevel }

const FILTERS: { level: FilterLevel; label: string }[] = [
    { level: 'error', label: 'Errores' },
    { level: 'warn', label: 'Avisos' },
    { level: 'info', label: 'Info' },
    { level: 'debug', label: 'Debug' },
];

function formatDuration(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function Highlight({ text, query }: Readonly<{ text: string; query: string }>) {
    if (!query) return <>{text}</>;
    const lower = text.toLowerCase();
    const parts: React.ReactNode[] = [];
    let from = 0;
    let idx = lower.indexOf(query, from);
    while (idx !== -1) {
        if (idx > from) parts.push(text.slice(from, idx));
        parts.push(<mark key={idx} style={logs.mark}>{text.slice(idx, idx + query.length)}</mark>);
        from = idx + query.length;
        idx = lower.indexOf(query, from);
    }
    parts.push(text.slice(from));
    return <>{parts}</>;
}

async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        // Algunos WebView no exponen la API de portapapeles
        const area = document.createElement('textarea');
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
    }
}

const icon = (d: React.ReactNode, size = 14) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

export default function LogWindow() {
    const [loaded, setLoaded] = useState(false);
    const [session, setSession] = useState<{ modpackId: string; name: string; startedAt: number } | null>(null);
    const [rows, setRows] = useState<Row[]>([]);
    const [running, setRunning] = useState(false);
    const [killed, setKilled] = useState(false);
    const [exitCode, setExitCode] = useState<number | null>(null);
    const [endedAt, setEndedAt] = useState<number | null>(null);

    const [query, setQuery] = useState('');
    const [levels, setLevels] = useState<Record<FilterLevel, boolean>>({ error: true, warn: true, info: true, debug: true });
    const [wrap, setWrap] = useState(true);
    const [follow, setFollow] = useState(true);
    const [unseen, setUnseen] = useState(0);
    const [confirmKill, setConfirmKill] = useState(false);
    const [copied, setCopied] = useState(false);
    const [now, setNow] = useState(Date.now());

    const bodyRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const lastSeq = useRef(-1);
    const lastLevel = useRef<LogLevel | null>(null);
    const modpackIdRef = useRef<string | null>(null);
    const followRef = useRef(true);
    followRef.current = follow;

    const append = useCallback((lines: LogLine[]) => {
        // El snapshot y los eventos pueden solaparse: se descarta lo ya visto
        const fresh = lines.filter(l => l.seq > lastSeq.current);
        if (fresh.length === 0) return;
        const newRows = fresh.map(l => {
            const level = detectLevel(l, lastLevel.current);
            lastLevel.current = level;
            return { ...l, level };
        });
        lastSeq.current = fresh[fresh.length - 1].seq;
        setRows(prev => {
            const next = prev.concat(newRows);
            return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
        });
        if (!followRef.current) setUnseen(n => n + newRows.length);
    }, []);

    const resetSession = useCallback(() => {
        lastSeq.current = -1;
        lastLevel.current = null;
        setRows([]);
        setRunning(true);
        setKilled(false);
        setExitCode(null);
        setEndedAt(null);
        setConfirmKill(false);
        setSession(prev => prev && { ...prev, startedAt: Date.now() });
    }, []);

    // ── Suscripción: primero los eventos, luego el histórico, para no perder líneas ──
    useEffect(() => {
        let disposed = false;
        const early: LogBatch[] = [];
        const subs = [
            listen<LogBatch>('game_log', (e) => {
                if (!modpackIdRef.current) early.push(e.payload);
                else if (e.payload.modpackId === modpackIdRef.current) append(e.payload.lines);
            }),
            listen<LogStatus>('game_log_status', (e) => {
                if (e.payload.modpackId !== modpackIdRef.current) return;
                setRunning(e.payload.running);
                setKilled(e.payload.killed);
                setExitCode(e.payload.exitCode);
                setEndedAt(Date.now());
                setConfirmKill(false);
            }),
            // Al volver a lanzar el mismo modpack, Rust empieza una sesión nueva
            listen<{ modpackId: string }>('game_started', (e) => {
                if (e.payload.modpackId === modpackIdRef.current) resetSession();
            }),
        ];

        Promise.all(subs)
            .then(() => invoke<LogSnapshot | null>('get_game_logs'))
            .then((snap) => {
                if (disposed) return;
                setLoaded(true);
                if (!snap) return;
                modpackIdRef.current = snap.modpackId;
                document.title = `Logs · ${snap.name}`;
                setSession({ modpackId: snap.modpackId, name: snap.name, startedAt: snap.startedAt });
                setRunning(snap.running);
                setKilled(snap.killed);
                setExitCode(snap.exitCode);
                if (!snap.running) setEndedAt(Date.now());
                append(snap.lines);
                early.filter(b => b.modpackId === snap.modpackId).forEach(b => append(b.lines));
            })
            .catch(() => { if (!disposed) setLoaded(true); });

        return () => {
            disposed = true;
            subs.forEach(p => p.then(un => un()));
        };
    }, [append, resetSession]);

    // Cronómetro de la partida
    useEffect(() => {
        if (!running) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [running]);

    // ── Filtro ──
    const q = query.trim().toLowerCase();
    const visible = useMemo(
        () => rows.filter(r => (r.level === 'system' || levels[r.level]) && (!q || r.text.toLowerCase().includes(q))),
        [rows, levels, q],
    );
    const counts = useMemo(() => {
        const c: Record<FilterLevel, number> = { error: 0, warn: 0, info: 0, debug: 0 };
        for (const r of rows) if (r.level !== 'system') c[r.level]++;
        return c;
    }, [rows]);

    // ── Scroll ──
    const scrollToBottom = useCallback(() => {
        const el = bodyRef.current;
        if (el) el.scrollTop = el.scrollHeight;
        setFollow(true);
        setUnseen(0);
    }, []);

    useLayoutEffect(() => {
        if (follow && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }, [visible, follow, wrap]);

    function handleScroll() {
        const el = bodyRef.current;
        if (!el) return;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_THRESHOLD;
        if (atBottom !== followRef.current) setFollow(atBottom);
        if (atBottom) setUnseen(0);
    }

    // ── Atajos de teclado ──
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                searchRef.current?.focus();
                searchRef.current?.select();
            } else if (e.key === 'Escape' && document.activeElement === searchRef.current) {
                setQuery('');
                searchRef.current?.blur();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'End') {
                e.preventDefault();
                scrollToBottom();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [scrollToBottom]);

    // ── Acciones ──
    async function openFolder(sub: 'logs' | 'crash-reports') {
        if (!session) return;
        const base = await invoke<string>('get_base_path');
        const instance = `${base}/instances/${session.modpackId}`;
        // Si la subcarpeta aún no existe (p.ej. sin crash reports), abrir la instancia
        await invoke('open_directory', { path: `${instance}/${sub}` })
            .catch(() => invoke('open_directory', { path: instance }))
            .catch(console.error);
    }

    async function handleCopy() {
        await copyText(visible.map(r => r.text).join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }

    async function handleKill() {
        if (!session) return;
        setConfirmKill(false);
        await invoke('kill_game', { modpackId: session.modpackId }).catch(console.error);
    }

    function toggleLevel(level: FilterLevel) {
        setLevels(prev => ({ ...prev, [level]: !prev[level] }));
    }

    function onlyErrors() {
        setLevels({ error: true, warn: false, info: false, debug: false });
        setQuery('');
    }

    // ── Estado ──
    const crashed = !running && !killed && exitCode !== null && exitCode !== 0;
    let statusTone: 'running' | 'ok' | 'error' | 'muted' = 'ok';
    let statusText = 'Cerrado';
    if (running) { statusTone = 'running'; statusText = 'En ejecución'; }
    else if (killed) { statusTone = 'muted'; statusText = 'Detenido'; }
    else if (crashed) { statusTone = 'error'; statusText = `Error · código ${exitCode}`; }
    const statusColor = { running: 'var(--success)', ok: 'var(--text-muted)', error: 'var(--error-text)', muted: 'var(--text-faint)' }[statusTone];
    const elapsed = session ? (endedAt ?? now) - session.startedAt : 0;

    if (loaded && !session) {
        return (
            <div style={logs.screen}>
                <div style={logs.empty}>
                    {icon(<><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>, 28)}
                    <span>No hay ninguna partida asociada a esta ventana.</span>
                    <span>Lanza el juego desde el launcher para ver sus logs.</span>
                </div>
            </div>
        );
    }

    return (
        <div style={logs.screen}>
            {/* ── Cabecera ── */}
            <header style={logs.header}>
                <div style={logs.titleCol}>
                    <span style={logs.eyebrow}>Consola del juego</span>
                    <span style={logs.title}>{session?.name ?? 'Cargando...'}</span>
                </div>
                <span style={logs.status(statusTone)}>
                    <span style={logs.statusDot(running, statusColor)} />
                    {statusText}
                    {session && <span style={{ color: 'var(--text-faint)' }}>· {formatDuration(elapsed)}</span>}
                </span>
                {running && (confirmKill ? (
                    <>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Se perderá lo no guardado.</span>
                        <button style={logs.toolBtn(false, true)} onClick={handleKill}>Detener ahora</button>
                        <button style={logs.toolBtn()} onClick={() => setConfirmKill(false)}>Cancelar</button>
                    </>
                ) : (
                    <button style={logs.toolBtn(false, true)} onClick={() => setConfirmKill(true)} title="Forzar el cierre de Minecraft">
                        {icon(<rect x="6" y="6" width="12" height="12" rx="1" />)}
                        Detener juego
                    </button>
                ))}
            </header>

            {/* ── Barra de herramientas ── */}
            <div style={logs.toolbar}>
                <div style={logs.searchWrap}>
                    <span style={logs.searchIcon}>{icon(<><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>)}</span>
                    <input
                        ref={searchRef}
                        style={logs.search}
                        placeholder="Buscar en los logs (Ctrl+F)"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        spellCheck={false}
                    />
                    {query && (
                        <button style={logs.searchClear} onClick={() => setQuery('')} aria-label="Limpiar búsqueda">
                            {icon(<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>, 12)}
                        </button>
                    )}
                </div>

                {FILTERS.map(f => (
                    <button
                        key={f.level}
                        style={logs.chip(levels[f.level], levelColor[f.level])}
                        onClick={() => toggleLevel(f.level)}
                        title={levels[f.level] ? `Ocultar ${f.label.toLowerCase()}` : `Mostrar ${f.label.toLowerCase()}`}
                    >
                        {f.label}
                        <span style={logs.chipCount}>{counts[f.level]}</span>
                    </button>
                ))}

                <div style={logs.spacer} />

                <button style={logs.toolBtn(follow)} onClick={() => (follow ? setFollow(false) : scrollToBottom())} title="Bajar automáticamente con las líneas nuevas">
                    {icon(<><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>)}
                    Seguir
                </button>
                <button style={logs.toolBtn(wrap)} onClick={() => setWrap(w => !w)} title="Ajustar las líneas largas al ancho de la ventana">
                    {icon(<><path d="M3 6h18M3 12h15a3 3 0 1 1 0 6h-4" /><polyline points="16 16 14 18 16 20" /><path d="M3 18h7" /></>)}
                    Ajustar
                </button>
                <button style={logs.toolBtn()} onClick={handleCopy} title="Copiar las líneas visibles">
                    {icon(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>)}
                    {copied ? 'Copiado' : 'Copiar'}
                </button>
                <button style={logs.toolBtn()} onClick={() => openFolder('logs')} title="Abrir la carpeta logs de la instancia">
                    {icon(<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />)}
                    Carpeta
                </button>
            </div>

            {/* ── Aviso si el juego se cerró con error ── */}
            {crashed && (
                <div style={logs.banner(true)}>
                    {icon(<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>, 16)}
                    <span style={{ flex: 1, minWidth: '200px' }}>
                        Minecraft se ha cerrado con un error. Revisa las líneas en rojo o el crash report.
                    </span>
                    <button style={logs.toolBtn()} onClick={onlyErrors}>Ver solo errores</button>
                    <button style={logs.toolBtn(false, true)} onClick={() => openFolder('crash-reports')}>Abrir crash reports</button>
                </div>
            )}

            {/* ── Líneas ── */}
            <div style={logs.bodyWrap}>
                <div ref={bodyRef} style={logs.body(wrap)} onScroll={handleScroll}>
                    {visible.map(r => (
                        <div key={r.seq} style={logs.line(r.level, r.stream === 'stderr')}>
                            <span style={logs.gutter}>{r.seq + 1}</span>
                            <span style={logs.text}><Highlight text={r.text} query={q} /></span>
                        </div>
                    ))}
                </div>

                {loaded && visible.length === 0 && (
                    <div style={logs.empty}>
                        {rows.length === 0
                            ? <span>{running ? 'Esperando la salida del juego...' : 'El juego no ha escrito nada.'}</span>
                            : <span>Ninguna línea coincide con el filtro.</span>}
                    </div>
                )}

                {!follow && (
                    <button style={logs.jumpBtn} onClick={scrollToBottom}>
                        {icon(<><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>)}
                        {unseen > 0 ? `${unseen} líneas nuevas` : 'Ir al final'}
                    </button>
                )}
            </div>

            {/* ── Pie ── */}
            <footer style={logs.footer}>
                <span>
                    {visible.length === rows.length
                        ? `${rows.length} líneas`
                        : `Mostrando ${visible.length} de ${rows.length} líneas`}
                </span>
                {rows.length >= MAX_LINES && <span>Solo se guardan las últimas {MAX_LINES.toLocaleString('es-ES')}</span>}
                <span style={logs.spacer} />
                <span>Ctrl+F buscar · Ctrl+Fin ir al final</span>
            </footer>
        </div>
    );
}
