import React, { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { UpdateCheckerProps, UpdaterState } from '../types';


export default function UpdateChecker({ onComplete }: UpdateCheckerProps) {
    const [state, setState] = useState<UpdaterState>('checking');
    const [message, setMessage] = useState('Conectando con el servidor...');
    const [progress, setProgress] = useState(0);
    const [currentVersion, setCurrentVersion] = useState('');
    const [newVersion, setNewVersion] = useState('');
    const [retryHovered, setRetryHovered] = useState(false);
    const [skipHovered, setSkipHovered] = useState(false);

    useEffect(() => {
        getVersion().then(setCurrentVersion);
        runUpdateCheck();
    }, []);

    const runUpdateCheck = async () => {
        try {
            setState('checking');
            setMessage('Conectando con el servidor...');

            const update = await check();

            if (!update) {
                setMessage('La aplicación está actualizada');
                setState('up-to-date');
                setTimeout(onComplete, 1500);
                return;
            }

            setNewVersion(update.version);
            setState('updating');
            setMessage(`Descargando versión ${update.version}...`);

            let downloaded = 0;
            let total = 0;

            await update.download((event) => {
                if (event.event === 'Started') {
                    total = event.data.contentLength ?? 0;
                } else if (event.event === 'Progress') {
                    downloaded += event.data.chunkLength;
                    if (total > 0) {
                        setProgress(Math.round((downloaded / total) * 100));
                    }
                } else if (event.event === 'Finished') {
                    setProgress(100);
                    setMessage('Instalando actualización...');
                }
            });

            setMessage('Reiniciando la aplicación...');
            await update.install();
            await relaunch();

        } catch (err) {
            setState('error');
            setMessage(typeof err === 'string' ? err : 'No se pudo comprobar actualizaciones');
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.card}>

                <div style={styles.headerZone}>
                    <div style={styles.logoMark}>
                        <span style={styles.logoKb}>KB</span>
                        <span style={styles.logoDot}>·</span>
                        <span style={styles.logoText}>ENGINE</span>
                    </div>
                    <div style={styles.iconWrap}>
                        <UpdateIcon state={state} />
                    </div>
                    <h2 style={styles.title}>
                        {state === 'checking' && 'Buscando actualizaciones'}
                        {state === 'updating' && 'Actualizando aplicación'}
                        {state === 'up-to-date' && 'Todo al día'}
                        {state === 'error' && 'Sin conexión al servidor'}
                    </h2>
                    <p style={styles.subtitle}>
                        {state === 'checking' && 'Comprobando si hay una nueva versión disponible'}
                        {state === 'updating' && `Instalando versión ${newVersion}`}
                        {state === 'up-to-date' && 'No hay actualizaciones disponibles'}
                        {state === 'error' && 'Se continuará con la versión actual'}
                    </p>
                </div>

                <div style={styles.versionBadge}>
                    <div style={styles.versionLeft}>
                        <div style={styles.verDot} />
                        <span style={styles.versionLabel}>VERSIÓN ACTUAL</span>
                    </div>
                    <span style={styles.versionValue}>v{currentVersion}</span>
                </div>

                {state === 'updating' && (
                    <div style={styles.progressContainer}>
                        <div style={styles.progressTrack}>
                            <div style={{ ...styles.progressBar, width: `${progress}%` }} />
                        </div>
                        <span style={styles.percentageText}>{progress}%</span>
                    </div>
                )}

                <div style={state === 'error' ? styles.errorBox : styles.statusBox}>
                    {state === 'error' ? (
                        <div style={styles.rowFlex}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                stroke="#E8192C" strokeWidth="2" strokeLinecap="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 8v4M12 16h.01" />
                            </svg>
                            <span style={styles.errorText}>{message}</span>
                        </div>
                    ) : (
                        <div style={styles.rowFlex}>
                            {(state === 'checking' || state === 'updating') && (
                                <div style={styles.spinner} />
                            )}
                            {state === 'up-to-date' && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                    stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round">
                                    <path d="M20 6L9 17l-5-5" />
                                </svg>
                            )}
                            <span style={styles.statusText}>{message}</span>
                        </div>
                    )}
                </div>

                {state === 'error' && (
                    <div style={styles.buttonRow}>
                        <button
                            style={{
                                ...styles.secondaryButton,
                                ...(retryHovered ? styles.secondaryButtonHover : {}),
                            }}
                            onMouseEnter={() => setRetryHovered(true)}
                            onMouseLeave={() => setRetryHovered(false)}
                            onClick={runUpdateCheck}
                        >
                            Reintentar
                        </button>
                        <button
                            style={{
                                ...styles.primaryButton,
                                ...(skipHovered ? styles.primaryButtonHover : {}),
                            }}
                            onMouseEnter={() => setSkipHovered(true)}
                            onMouseLeave={() => setSkipHovered(false)}
                            onClick={onComplete}
                        >
                            Continuar sin actualizar
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
}

function UpdateIcon({ state }: Readonly<{ state: UpdaterState }>) {
    if (state === 'up-to-date') {
        return (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
            </svg>
        );
    }
    if (state === 'error') {
        return (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="#E8192C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
            </svg>
        );
    }
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="#E8192C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#080809',
        color: '#f5f5f7',
        fontFamily: '"Barlow", system-ui, sans-serif',
        padding: '24px',
    },
    card: {
        width: '100%',
        maxWidth: '480px',
        backgroundColor: '#101013',
        borderRadius: '10px',
        padding: '32px',
        border: '1px solid #2a2a32',
        borderTop: '2px solid #E8192C',
        display: 'flex',
        flexDirection: 'column',
        gap: '22px',
    },
    headerZone: {
        textAlign: 'center',
    },
    logoMark: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        marginBottom: '14px',
        fontFamily: '"Barlow Condensed", system-ui, sans-serif',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.15em',
    },
    logoKb: { color: '#E8192C' },
    logoDot: { color: '#52525e' },
    logoText: { color: '#52525e' },
    iconWrap: {
        width: '44px',
        height: '44px',
        borderRadius: '8px',
        background: '#18181c',
        border: '1px solid #2a2a32',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 14px',
    },
    title: {
        fontFamily: '"Barlow Condensed", system-ui, sans-serif',
        fontSize: '24px',
        fontWeight: 800,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.02em',
        color: '#f5f5f7',
        margin: '0 0 6px',
    },
    subtitle: {
        fontSize: '18px',
        color: '#9898a8',
        margin: 0,
    },
    versionBadge: {
        background: '#18181c',
        border: '1px solid #2a2a32',
        borderRadius: '6px',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    versionLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    verDot: {
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: '#E8192C',
        flexShrink: 0,
    },
    versionLabel: {
        fontFamily: '"Barlow Condensed", system-ui, sans-serif',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.12em',
        color: '#52525e',
    },
    versionValue: {
        fontFamily: '"Barlow Condensed", system-ui, sans-serif',
        fontSize: '18px',
        fontWeight: 800,
        color: '#f5f5f7',
        letterSpacing: '0.05em',
    },
    progressContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
    },
    progressTrack: {
        flex: 1,
        height: '6px',
        backgroundColor: '#202026',
        borderRadius: '3px',
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        background: '#E8192C',
        borderRadius: '3px',
        transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
    },
    percentageText: {
        fontFamily: '"Barlow Condensed", system-ui, sans-serif',
        fontSize: '18px',
        fontWeight: 700,
        color: '#E8192C',
        width: '35px',
        textAlign: 'right' as const,
    },
    statusBox: {
        backgroundColor: '#18181c',
        border: '1px solid #2a2a32',
        borderLeft: '3px solid #E8192C',
        borderRadius: '0 8px 8px 0',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        minHeight: '44px',
    },
    errorBox: {
        backgroundColor: '#2a0a0e',
        border: '1px solid #3a1018',
        borderLeft: '3px solid #E8192C',
        borderRadius: '0 8px 8px 0',
        padding: '14px 16px',
    },
    rowFlex: {
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        width: '100%',
    },
    statusText: {
        fontSize: '18px',
        color: '#d0d0da',
        lineHeight: '1.5',
    },
    errorText: {
        fontSize: '18px',
        color: '#fca5a5',
        lineHeight: '1.5',
        fontWeight: 500,
    },
    spinner: {
        width: '14px',
        height: '14px',
        border: '2px solid #E8192C',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        flexShrink: 0,
        animation: 'spin 0.8s linear infinite',
    },
    buttonRow: {
        display: 'flex',
        gap: '10px',
    },
    primaryButton: {
        flex: 1,
        padding: '11px',
        backgroundColor: '#E8192C',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        fontFamily: '"Barlow Condensed", system-ui, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.08em',
        cursor: 'pointer',
        transition: 'background-color 0.15s',
    },
    primaryButtonHover: {
        backgroundColor: '#B01020',
    },
    secondaryButton: {
        flex: 1,
        padding: '11px',
        backgroundColor: 'transparent',
        color: '#9898a8',
        border: '1px solid #2a2a32',
        borderRadius: '6px',
        fontFamily: '"Barlow Condensed", system-ui, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.08em',
        cursor: 'pointer',
        transition: 'background-color 0.15s, color 0.15s',
    },
    secondaryButtonHover: {
        backgroundColor: '#18181c',
        color: '#f5f5f7',
    },
};