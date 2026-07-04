import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { useTheme } from '../context/ThemeContext';
import { appSettings } from '../styles/appSettingStyles';
import { getVersion } from '@tauri-apps/api/app';
const GITHUB_URL       = 'https://github.com/jonaykb/KB_MC_LAUNCHER/issues';

interface Props {
    onClose: () => void;
}

interface RowProps {
    icon: React.ReactNode;
    label: string;
    desc?: string;
    right?: React.ReactNode;
    onClick?: () => void;
    danger?: boolean;
}

function SettingsRow({ icon, label, desc, right, onClick, danger }: RowProps) {
    const [hovered, setHovered] = useState(false);
    return (
        <div
            style={appSettings.row(hovered)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={onClick}
        >
            <div style={appSettings.rowLeft}>
                <div style={appSettings.rowIcon(danger)}>{icon}</div>
                <div style={appSettings.rowText}>
                    <span style={appSettings.rowLabel(danger)}>{label}</span>
                    {desc && <span style={appSettings.rowDesc}>{desc}</span>}
                </div>
            </div>
            {right}
        </div>
    );
}

export default function AppSettingsModal({ onClose }: Props) {
    const { theme, toggleTheme } = useTheme();
    const [closeBtnHovered, setCloseBtnHovered] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [launcherVersion, setLauncherVersion] = useState<string>('');

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    useEffect(() => {
        const fetchVersion = async () => {
            const version = await getVersion();
            setLauncherVersion(version);
        };
        fetchVersion();
    }, []);

    async function handleClearCache() {
        const confirmed = await ask(
            'Se eliminarán todas las instancias instaladas, ajustes guardados y caché local.\n\n¿Continuar?',
            { title: 'Borrar todo el caché', kind: 'warning' }
        );
        if (!confirmed) return;

        setClearing(true);
        try {
            // 1. Borrar localStorage
            localStorage.clear();

            // 2. Borrar instancias y versiones en Rust
            await invoke('clear_all_cache');

            await message(
                'Caché borrado correctamente. La aplicación se reiniciará.',
                { title: 'Caché borrado', kind: 'info' }
            );

            // Reiniciar la app
            await invoke('restart_app');
        } catch (err) {
            console.error('Error borrando caché:', err);
            await message(`Error al borrar el caché: ${err}`, { title: 'Error', kind: 'error' });
        } finally {
            setClearing(false);
        }
    }

    return (
        <div style={appSettings.backdrop} onClick={onClose}>
            <div style={appSettings.card} onClick={e => e.stopPropagation()}>

                {/* ── Header ── */}
                <div style={appSettings.header}>
                    <div style={appSettings.headerLeft}>
                        <span style={appSettings.eyebrow}>KB MC Launcher</span>
                        <span style={appSettings.title}>Ajustes</span>
                    </div>
                    <button
                        style={appSettings.closeBtn(closeBtnHovered)}
                        onMouseEnter={() => setCloseBtnHovered(true)}
                        onMouseLeave={() => setCloseBtnHovered(false)}
                        onClick={onClose}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* ── Body ── */}
                <div style={appSettings.body}>

                    {/* Tema */}
                    <SettingsRow
                        icon={
                            theme === 'dark'
                                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                        }
                        label={theme === 'dark' ? 'Tema oscuro' : 'Tema claro'}
                        desc="Cambiar entre modo claro y oscuro"
                        onClick={toggleTheme}
                        right={
                            <button style={appSettings.toggle(theme === 'light')} onClick={e => { e.stopPropagation(); toggleTheme(); }}>
                                <div style={appSettings.toggleKnob(theme === 'light')} />
                            </button>
                        }
                    />

                    <div style={appSettings.divider} />

                    {/* GitHub */}
                    <SettingsRow
                        icon={
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                            </svg>
                        }
                        label="Reportar un error"
                        desc={GITHUB_URL}
                        onClick={() => open(GITHUB_URL)}
                        right={
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-faint)', flexShrink: 0 }}>
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                        }
                    />

                    <div style={appSettings.divider} />

                    {/* Borrar caché */}
                    <SettingsRow
                        danger
                        icon={
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                        }
                        label="Borrar todo el caché"
                        desc={clearing ? 'Borrando...' : 'Elimina instancias, ajustes y datos locales'}
                        onClick={clearing ? undefined : handleClearCache}
                    />
                </div>
                
                {/* ── Footer ── */}
                <div style={appSettings.footer}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-faint)' }}>
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span style={appSettings.version}>KB MC Launcher v{launcherVersion}</span>
                </div>

            </div>
        </div>
    );
}