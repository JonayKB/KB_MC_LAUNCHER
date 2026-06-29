import React, { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { UpdateCheckerProps, UpdaterState } from '../types';
import { layout, logo, header, badge, progress as pg, box, text, btn, spinner } from '../styles/components';

export default function UpdateChecker({ onComplete }: UpdateCheckerProps) {
    const [state, setState] = useState<UpdaterState>('checking');
    const [message, setMessage] = useState('Conectando con el servidor...');
    const [progressVal, setProgressVal] = useState(0);
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
            let downloaded = 0, total = 0;
            await update.download((event) => {
                if (event.event === 'Started') total = event.data.contentLength ?? 0;
                else if (event.event === 'Progress') {
                    downloaded += event.data.chunkLength;
                    if (total > 0) setProgressVal(Math.round((downloaded / total) * 100));
                } else if (event.event === 'Finished') {
                    setProgressVal(100);
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
        <div style={layout.fullscreenCenter}>
            <div style={layout.card}>

                <div style={header.zone}>
                    <div style={logo.wrap}>
                        <span style={logo.kb}>KB</span>
                        <span style={logo.dot}>·</span>
                        <span style={logo.text}>LAUNCHER</span>
                    </div>
                    <div style={header.iconWrap}>
                        <UpdateIcon state={state} />
                    </div>
                    <h2 style={header.title}>
                        {state === 'checking' && 'Buscando actualizaciones'}
                        {state === 'updating' && 'Actualizando aplicación'}
                        {state === 'up-to-date' && 'Todo al día'}
                        {state === 'error' && 'Sin conexión al servidor'}
                    </h2>
                    <p style={header.subtitle}>
                        {state === 'checking' && 'Comprobando si hay una nueva versión disponible'}
                        {state === 'updating' && `Instalando versión ${newVersion}`}
                        {state === 'up-to-date' && 'No hay actualizaciones disponibles'}
                        {state === 'error' && 'Se continuará con la versión actual'}
                    </p>
                </div>

                <div style={badge.wrap}>
                    <div style={badge.left}>
                        <div style={badge.dot} />
                        <span style={badge.label}>VERSIÓN ACTUAL</span>
                    </div>
                    <span style={badge.value}>v{currentVersion}</span>
                </div>

                {state === 'updating' && (
                    <div style={pg.container}>
                        <div style={pg.track}>
                            <div style={{ ...pg.bar, width: `${progressVal}%` }} />
                        </div>
                        <span style={pg.percentage}>{progressVal}%</span>
                    </div>
                )}

                <div style={state === 'error' ? box.error : box.status}>
                    {state === 'error' ? (
                        <div style={layout.row}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
                                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                            </svg>
                            <span style={text.error}>{message}</span>
                        </div>
                    ) : (
                        <div style={layout.row}>
                            {(state === 'checking' || state === 'updating') && <div style={spinner} />}
                            {state === 'up-to-date' && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                    stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round">
                                    <path d="M20 6L9 17l-5-5" />
                                </svg>
                            )}
                            <span style={text.status}>{message}</span>
                        </div>
                    )}
                </div>

                {state === 'error' && (
                    <div style={btn.row}>
                        <button
                            style={{ ...btn.secondary, ...(retryHovered ? btn.secondaryHover : {}) }}
                            onMouseEnter={() => setRetryHovered(true)}
                            onMouseLeave={() => setRetryHovered(false)}
                            onClick={runUpdateCheck}
                        >Reintentar</button>
                        <button
                            style={{ ...btn.primary, ...(skipHovered ? btn.primaryHover : {}) }}
                            onMouseEnter={() => setSkipHovered(true)}
                            onMouseLeave={() => setSkipHovered(false)}
                            onClick={onComplete}
                        >Continuar sin actualizar</button>
                    </div>
                )}

            </div>
        </div>
    );
}

function UpdateIcon({ state }: Readonly<{ state: UpdaterState }>) {
    if (state === 'up-to-date') return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
        </svg>
    );
    if (state === 'error') return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
        </svg>
    );
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
    );
}