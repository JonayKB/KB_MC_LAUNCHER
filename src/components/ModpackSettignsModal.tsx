import { useState, useEffect } from 'react';
import { ModpackSettings, DEFAULT_SETTINGS, RESOLUTIONS } from '../types/modpackSettings';
import { modal } from '../types/modackSettingStyles';
import { invoke } from '@tauri-apps/api/core';

const SETTINGS_KEY = (modpackId: string) => `kb_settings_${modpackId}`;

interface RecommendedSettings {
    min_ram_mb: number;
    max_ram_mb: number;
    extra_jvm_args: string;
}
export function loadSettings(modpackId: string): ModpackSettings {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY(modpackId));
        if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch { }
    return { ...DEFAULT_SETTINGS };
}

function saveSettings(modpackId: string, s: ModpackSettings) {
    localStorage.setItem(SETTINGS_KEY(modpackId), JSON.stringify(s));
}

function formatMb(mb: number): string {
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

interface Props {
    modpackId: string;
    modpackName: string;
    onClose: () => void;
    onSave: (settings: ModpackSettings) => void;
}

export default function ModpackSettingsModal({ modpackId, modpackName, onClose, onSave }: Props) {
    const [settings, setSettings] = useState<ModpackSettings>(() => loadSettings(modpackId));
    const [recommended, setRecommended] = useState<RecommendedSettings | null>(null);
    const [closeBtnHovered, setCloseBtnHovered] = useState(false);
    const [saveHovered, setSaveHovered] = useState(false);
    const [cancelHovered, setCancelHovered] = useState(false);
    useEffect(() => {
        invoke<RecommendedSettings>('get_recommended_settings')
            .then(setRecommended)
            .catch(() => { });
    }, []);

    // Botón para aplicar recomendados
    function applyRecommended() {
        if (!recommended) return;
        setSettings(prev => ({
            ...prev,
            minRamMb: recommended.min_ram_mb,
            maxRamMb: recommended.max_ram_mb,
            extraJvmArgs: recommended.extra_jvm_args,
        }));
    }

    // Detectar preset de resolución seleccionado
    const resPreset = RESOLUTIONS.find(
        r => r.width === settings.windowWidth && r.height === settings.windowHeight
    ) ?? RESOLUTIONS[RESOLUTIONS.length - 1]; // Personalizado

    const isCustomRes = resPreset.width === 0;

    function set<K extends keyof ModpackSettings>(key: K, value: ModpackSettings[K]) {
        setSettings(prev => ({ ...prev, [key]: value }));
    }

    function handleResolutionChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const idx = Number(e.target.value);
        const preset = RESOLUTIONS[idx];
        if (preset.width !== 0) {
            set('windowWidth', preset.width);
            set('windowHeight', preset.height);
        }
    }

    function handleSave() {
        saveSettings(modpackId, settings);
        onSave(settings);
        onClose();
    }

    // Cerrar con Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div style={modal.backdrop} onClick={onClose}>
            <div style={modal.card} onClick={e => e.stopPropagation()}>

                {/* ── Header ── */}
                <div style={modal.header}>
                    <div style={modal.headerLeft}>
                        <span style={modal.eyebrow}>Ajustes del modpack</span>
                        <span style={modal.title}>{modpackName}</span>
                    </div>
                    <button
                        style={{
                            ...modal.closeBtn,
                            backgroundColor: closeBtnHovered ? 'var(--bg-hover)' : 'transparent',
                            color: closeBtnHovered ? 'var(--text-primary)' : 'var(--text-faint)',
                        }}
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
                <div style={modal.body}>

                    {/* RAM */}
                    <div style={{ ...modal.row, marginBottom: '4px' }}>
                        <span style={modal.sectionTitle}>Memoria RAM</span>
                        {recommended && (
                            <button
                                onClick={applyRecommended}
                                style={{
                                    background: 'transparent',
                                    border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius-sm)',
                                    color: 'var(--text-faint)',
                                    fontFamily: 'var(--font-condensed)',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    padding: '3px 8px',
                                    cursor: 'pointer',
                                }}
                            >
                                Aplicar recomendados
                            </button>
                        )}
                    </div>

                    {/* Mostrar qué recomienda el sistema */}
                    {recommended && (
                        <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                            Tu sistema: recomendado {formatMb(recommended.min_ram_mb)} – {formatMb(recommended.max_ram_mb)}
                        </span>
                    )}


                    <div style={modal.divider} />

                    {/* Pantalla */}
                    <div style={modal.section}>
                        <span style={modal.sectionTitle}>Pantalla</span>

                        <div style={modal.row}>
                            <span style={modal.label}>Pantalla completa</span>
                            <button
                                style={modal.toggle(settings.fullscreen)}
                                onClick={() => set('fullscreen', !settings.fullscreen)}
                            >
                                <div style={modal.toggleKnob(settings.fullscreen)} />
                            </button>
                        </div>

                        {!settings.fullscreen && (
                            <>
                                <select
                                    style={modal.select}
                                    value={RESOLUTIONS.findIndex(
                                        r => r.width === settings.windowWidth && r.height === settings.windowHeight
                                    ) === -1
                                        ? RESOLUTIONS.length - 1
                                        : RESOLUTIONS.findIndex(r => r.width === settings.windowWidth && r.height === settings.windowHeight)
                                    }
                                    onChange={handleResolutionChange}
                                >
                                    {RESOLUTIONS.map((r, idx) => (
                                        <option key={idx} value={idx}>{r.label}</option>
                                    ))}
                                </select>

                                {isCustomRes && (
                                    <div style={modal.customResRow}>
                                        <input
                                            type="number"
                                            style={modal.customInput}
                                            value={settings.windowWidth}
                                            min={640} max={7680}
                                            onChange={e => set('windowWidth', Number(e.target.value))}
                                            placeholder="1280"
                                        />
                                        <span style={modal.customSep}>×</span>
                                        <input
                                            type="number"
                                            style={modal.customInput}
                                            value={settings.windowHeight}
                                            min={360} max={4320}
                                            onChange={e => set('windowHeight', Number(e.target.value))}
                                            placeholder="720"
                                        />
                                        <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>px</span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <div style={modal.divider} />

                    {/* JVM args extra */}
                    <div style={modal.section}>
                        <span style={modal.sectionTitle}>Argumentos JVM adicionales</span>
                        <textarea
                            style={modal.textarea}
                            value={settings.extraJvmArgs}
                            onChange={e => set('extraJvmArgs', e.target.value)}
                            placeholder="-XX:+UseZGC -Dfml.readTimeout=120"
                            spellCheck={false}
                        />
                        <span style={{ fontSize: '11px', color: 'var(--text-faint)', lineHeight: 1.4 }}>
                            Uno por línea o separados por espacio. Se añaden al final de los args JVM.
                        </span>
                    </div>

                </div>

                {/* ── Footer ── */}
                <div style={modal.footer}>
                    <button
                        style={{
                            ...modal.btnSecondary,
                            backgroundColor: cancelHovered ? 'var(--bg-elevated)' : 'transparent',
                            color: cancelHovered ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                        onMouseEnter={() => setCancelHovered(true)}
                        onMouseLeave={() => setCancelHovered(false)}
                        onClick={onClose}
                    >
                        Cancelar
                    </button>
                    <button
                        style={{
                            ...modal.btnPrimary,
                            backgroundColor: saveHovered ? 'var(--accent-hover)' : 'var(--accent)',
                        }}
                        onMouseEnter={() => setSaveHovered(true)}
                        onMouseLeave={() => setSaveHovered(false)}
                        onClick={handleSave}
                    >
                        Guardar
                    </button>
                </div>

            </div>
        </div>
    );
}