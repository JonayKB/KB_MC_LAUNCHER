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

// Redondear al múltiplo de 256 más cercano
function snapTo256(value: number): number {
    return Math.round(value / 256) * 256;
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
    const [totalRamMb, setTotalRamMb] = useState<number>(8192); // fallback
    const [closeBtnHovered, setCloseBtnHovered] = useState(false);
    const [saveHovered, setSaveHovered] = useState(false);
    const [cancelHovered, setCancelHovered] = useState(false);
    const [recBtnHovered, setRecBtnHovered] = useState(false);

    useEffect(() => {
        invoke<RecommendedSettings & { total_ram_mb?: number }>('get_recommended_settings')
            .then(rec => {
                setRecommended(rec);
                // total_ram_mb lo añadimos al comando de Rust (ver abajo)
                if (rec.total_ram_mb) setTotalRamMb(rec.total_ram_mb);
            })
            .catch(() => { });
    }, []);

    // Rango del slider: 25% de la RAM total → 100% de la RAM total
    const sliderMin = Math.max(512, snapTo256(totalRamMb * 0.25));
    const sliderMax = snapTo256(totalRamMb);

    function applyRecommended() {
        if (!recommended) return;
        setSettings(prev => ({
            ...prev,
            minRamMb: recommended.min_ram_mb,
            maxRamMb: recommended.max_ram_mb,
            // NO tocamos extraJvmArgs aquí — el usuario los gestiona aparte
        }));
    }

    const resPreset = RESOLUTIONS.find(
        r => r.width === settings.windowWidth && r.height === settings.windowHeight
    ) ?? RESOLUTIONS[RESOLUTIONS.length - 1];
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

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
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

                    {/* ── RAM ── */}
                    <div style={modal.section}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={modal.sectionTitle}>Memoria RAM</span>
                            <button
                                onClick={applyRecommended}
                                disabled={!recommended}
                                style={{
                                    background: 'transparent',
                                    border: `1px solid ${recBtnHovered && recommended ? 'var(--accent)' : 'var(--border)'}`,
                                    borderRadius: 'var(--radius-sm)',
                                    color: recBtnHovered && recommended ? 'var(--accent)' : 'var(--text-faint)',
                                    fontFamily: 'var(--font-condensed)',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    padding: '3px 8px',
                                    cursor: recommended ? 'pointer' : 'default',
                                    opacity: recommended ? 1 : 0.4,
                                    transition: 'border-color 0.15s, color 0.15s',
                                }}
                                onMouseEnter={() => setRecBtnHovered(true)}
                                onMouseLeave={() => setRecBtnHovered(false)}
                            >
                                {recommended ? 'Aplicar recomendados' : 'Calculando...'}
                            </button>
                        </div>

                        {/* Info del sistema */}
                        {recommended && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '11px',
                                color: 'var(--text-faint)',
                            }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                                RAM total del sistema: {formatMb(totalRamMb)} — Recomendado: {formatMb(recommended.min_ram_mb)} – {formatMb(recommended.max_ram_mb)}
                            </div>
                        )}

                        {/* RAM mínima */}
                        <div>
                            <div style={{ ...modal.row, marginBottom: '6px' }}>
                                <span style={modal.label}>RAM mínima</span>
                                <span style={modal.valueTag}>{formatMb(settings.minRamMb)}</span>
                            </div>
                            <input
                                type="range"
                                min={sliderMin}
                                max={sliderMax}
                                step={256}
                                value={settings.minRamMb}
                                onChange={e => {
                                    const val = Number(e.target.value);
                                    set('minRamMb', val);
                                    // Si min supera max, ajustar max
                                    if (val > settings.maxRamMb) {
                                        set('maxRamMb', Math.min(val + 512, sliderMax));
                                    }
                                }}
                                style={modal.slider}
                            />
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '10px',
                                color: 'var(--text-faint)',
                                marginTop: '2px',
                            }}>
                                <span>{formatMb(sliderMin)}</span>
                                <span>{formatMb(sliderMax)}</span>
                            </div>
                        </div>

                        {/* RAM máxima */}
                        <div>
                            <div style={{ ...modal.row, marginBottom: '6px' }}>
                                <span style={modal.label}>RAM máxima</span>
                                <span style={modal.valueTag}>{formatMb(settings.maxRamMb)}</span>
                            </div>
                            <input
                                type="range"
                                min={sliderMin}
                                max={sliderMax}
                                step={256}
                                value={settings.maxRamMb}
                                onChange={e => {
                                    const val = Number(e.target.value);
                                    set('maxRamMb', val);
                                    // Si max cae por debajo de min, ajustar min
                                    if (val < settings.minRamMb) {
                                        set('minRamMb', Math.max(val - 512, sliderMin));
                                    }
                                }}
                                style={modal.slider}
                            />
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '10px',
                                color: 'var(--text-faint)',
                                marginTop: '2px',
                            }}>
                                <span>{formatMb(sliderMin)}</span>
                                <span>{formatMb(sliderMax)}</span>
                            </div>
                        </div>

                        {/* Advertencia si max RAM es muy alta */}
                        {settings.maxRamMb > totalRamMb * 0.8 && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '11px',
                                color: 'var(--warning)',
                                padding: '6px 10px',
                                background: 'rgba(245,158,11,0.08)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid rgba(245,158,11,0.2)',
                            }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                                Asignar más del 80% de la RAM puede ralentizar el sistema operativo.
                            </div>
                        )}
                    </div>

                    <div style={modal.divider} />

                    {/* ── Pantalla ── */}
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
                                    value={
                                        RESOLUTIONS.findIndex(r => r.width === settings.windowWidth && r.height === settings.windowHeight) === -1
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

                    {/* ── JVM args extra ── */}
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
                            Separados por espacio o uno por línea. Se añaden al final de los args JVM de Forge.
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