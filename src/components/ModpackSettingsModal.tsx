import { useState, useEffect } from 'react';
import {
    DEFAULT_SETTINGS,
    ModpackSettings,
    RecommendedSettings,
    RESOLUTIONS,
    minRamFor,
    ramPresets,
} from '../types/modpackSettings';
import { modal, settingsUi as ui, HintTone } from '../styles/modpackSettingStyles';
import { CustomDropdown } from './CustomDropdown';
import { ensureModpackSettings, getRecommendedSettings, saveModpackSettings } from '../repositories/ModpackActions';

/** Si no se puede consultar el equipo, se asume uno de 8GB */
const FALLBACK_REC: Pick<RecommendedSettings, 'max_ram_mb' | 'total_ram_mb' | 'min_ram_mb'> = {
    max_ram_mb: 4096,
    min_ram_mb: 2048,
    total_ram_mb: 8192,
};

function formatGb(mb: number): string {
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
}

interface Props {
    modpackId: string;
    modpackName: string;
    onClose: () => void;
    onSave?: (settings: ModpackSettings) => void;
}

function Toggle({ on, onChange, label }: Readonly<{ on: boolean; onChange: (v: boolean) => void; label: string }>) {
    return (
        <button style={modal.toggle(on)} onClick={() => onChange(!on)} role="switch" aria-checked={on} aria-label={label}>
            <div style={modal.toggleKnob(on)} />
        </button>
    );
}

function HintIcon({ tone }: Readonly<{ tone: HintTone }>) {
    if (tone === 'ok') return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
    );
    if (tone === 'warn') return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
    );
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
    );
}

function PresetButton({ label, value, active, onClick }: Readonly<{ label: string; value: number; active: boolean; onClick: () => void }>) {
    const [hovered, setHovered] = useState(false);
    return (
        <button
            style={ui.presetBtn(active, hovered)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={onClick}
        >
            <span style={ui.presetLabel(active)}>{label}</span>
            <span style={ui.presetValue}>{formatGb(value)}</span>
        </button>
    );
}

export default function ModpackSettingsModal({ modpackId, modpackName, onClose, onSave }: Props) {
    const [settings, setSettings] = useState<ModpackSettings | null>(null);
    const [rec, setRec] = useState<RecommendedSettings | null>(null);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [advancedHovered, setAdvancedHovered] = useState(false);
    const [closeBtnHovered, setCloseBtnHovered] = useState(false);
    const [saveHovered, setSaveHovered] = useState(false);
    const [cancelHovered, setCancelHovered] = useState(false);
    const [restoreHovered, setRestoreHovered] = useState(false);

    useEffect(() => {
        Promise.all([ensureModpackSettings(modpackId), getRecommendedSettings()])
            .then(([s, r]) => { setSettings(s); setRec(r); })
            .catch(() => setSettings({ ...DEFAULT_SETTINGS }));
    }, [modpackId]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const base = rec ?? FALLBACK_REC;
    const presets = ramPresets(base);

    function set<K extends keyof ModpackSettings>(key: K, value: ModpackSettings[K]) {
        setSettings(prev => prev && { ...prev, [key]: value });
    }

    function setMaxRam(maxRamMb: number, source: 'auto' | 'user') {
        setSettings(prev => prev && { ...prev, maxRamMb, minRamMb: minRamFor(maxRamMb), ramSource: source });
    }

    function restoreRecommended() {
        setSettings(prev => prev && {
            ...DEFAULT_SETTINGS,
            minRamMb: base.min_ram_mb,
            maxRamMb: base.max_ram_mb,
            windowWidth: rec?.window_width ?? prev.windowWidth,
            windowHeight: rec?.window_height ?? prev.windowHeight,
            fullscreen: rec?.fullscreen ?? prev.fullscreen,
        });
    }

    function handleSave() {
        if (!settings) return;
        saveModpackSettings(modpackId, settings);
        onSave?.(settings);
        onClose();
    }

    function handleResolutionChange(idx: number) {
        const preset = RESOLUTIONS[idx];
        if (preset.width !== 0) {
            setSettings(prev => prev && { ...prev, windowWidth: preset.width, windowHeight: preset.height });
        }
    }

    // ── Valores derivados de la RAM ──
    const maxRam = settings?.maxRamMb ?? base.max_ram_mb;
    const isAuto = settings?.ramSource === 'auto';
    const freeForSystem = Math.max(0, base.total_ram_mb - maxRam);
    const tooHigh = maxRam > presets.warnAbove;

    let hintTone: HintTone = 'ok';
    let hintText = 'Buena elección para tu equipo.';
    if (tooHigh) {
        hintTone = 'warn';
        hintText = `Solo quedan ${formatGb(freeForSystem)} para el sistema y el resto de programas: el PC puede ir lento o el juego cerrarse de golpe.`;
    } else if (maxRam < 3072) {
        hintTone = 'info';
        hintText = 'Con menos de 3 GB los modpacks grandes pueden ir a tirones o no llegar a arrancar.';
    } else if (maxRam > base.max_ram_mb * 1.5) {
        hintTone = 'info';
        hintText = 'Más RAM no siempre va mejor: por encima de lo que necesita el modpack, las pausas de Java para liberar memoria se hacen más largas.';
    } else if (isAuto) {
        hintText = 'Se ajusta automáticamente a tu equipo. Si cambias la RAM del PC, se recalcula sola.';
    }

    const resIndex = settings
        ? RESOLUTIONS.findIndex(r => r.width === settings.windowWidth && r.height === settings.windowHeight)
        : -1;
    const isCustomRes = resIndex === -1 || RESOLUTIONS[resIndex].width === 0;

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
                        aria-label="Cerrar"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {!settings ? (
                    <div style={{ ...modal.body, alignItems: 'center', color: 'var(--text-faint)', fontSize: '13px' }}>
                        Calculando ajustes para tu equipo...
                    </div>
                ) : (
                    <div style={modal.body}>

                        {/* ── Memoria ── */}
                        <div style={modal.section}>
                            <div style={ui.sectionHeader}>
                                <span style={modal.sectionTitle}>Memoria RAM</span>
                                <span style={ui.systemTag}>Tu equipo tiene {formatGb(base.total_ram_mb)}</span>
                            </div>

                            <div style={ui.presetRow}>
                                <PresetButton label="Ligero" value={presets.low} active={!isAuto && maxRam === presets.low} onClick={() => setMaxRam(presets.low, 'user')} />
                                <PresetButton label="Recomendado" value={presets.recommended} active={isAuto} onClick={() => setMaxRam(presets.recommended, 'auto')} />
                                <PresetButton label="Alto" value={presets.high} active={!isAuto && maxRam === presets.high} onClick={() => setMaxRam(presets.high, 'user')} />
                            </div>

                            <div>
                                <div style={ui.bigValueRow}>
                                    <span style={ui.bigValue}>{formatGb(maxRam)}</span>
                                    <span style={ui.sourceTag(isAuto)}>{isAuto ? 'Automático' : 'Personalizado'}</span>
                                </div>
                                <input
                                    type="range"
                                    min={2048}
                                    max={presets.sliderMax}
                                    step={512}
                                    value={Math.min(maxRam, presets.sliderMax)}
                                    onChange={e => {
                                        const v = Number(e.target.value);
                                        setMaxRam(v, v === presets.recommended ? 'auto' : 'user');
                                    }}
                                    style={{ ...modal.slider, marginTop: '10px' }}
                                    aria-label="RAM máxima para Minecraft"
                                />
                                <div style={ui.sliderScale}>
                                    <span>2 GB</span>
                                    <span>{formatGb(presets.sliderMax)}</span>
                                </div>
                            </div>

                            <div>
                                <div style={ui.memBar}>
                                    <div style={ui.memGame((maxRam / base.total_ram_mb) * 100, tooHigh)} />
                                </div>
                                <div style={ui.memLegend}>
                                    <span><span style={ui.legendDot(tooHigh ? 'var(--warning)' : 'var(--accent)')} />Minecraft · {formatGb(maxRam)}</span>
                                    <span><span style={ui.legendDot('var(--bg-hover)')} />Sistema y otros programas · {formatGb(freeForSystem)}</span>
                                </div>
                            </div>

                            <div style={ui.hint(hintTone)}>
                                <span style={ui.hintIcon(hintTone)}><HintIcon tone={hintTone} /></span>
                                <span>{hintText}</span>
                            </div>
                        </div>

                        <div style={modal.divider} />

                        {/* ── Ventana del juego ── */}
                        <div style={modal.section}>
                            <span style={modal.sectionTitle}>Ventana del juego</span>

                            <div style={ui.toggleRow}>
                                <div style={ui.toggleText}>
                                    <span style={modal.label}>Pantalla completa</span>
                                </div>
                                <Toggle on={settings.fullscreen} onChange={v => set('fullscreen', v)} label="Pantalla completa" />
                            </div>

                            {!settings.fullscreen && (
                                <>
                                    <CustomDropdown
                                        options={RESOLUTIONS.map((r, idx) => ({ label: r.label, value: idx }))}
                                        value={isCustomRes ? RESOLUTIONS.length - 1 : resIndex}
                                        onChange={handleResolutionChange}
                                    />
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

                        {/* ── Al jugar ── */}
                        <div style={modal.section}>
                            <span style={modal.sectionTitle}>Al jugar</span>
                            <div style={ui.toggleRow}>
                                <div style={ui.toggleText}>
                                    <span style={modal.label}>Abrir la consola del juego</span>
                                    <span style={ui.toggleDesc}>
                                        Muestra los logs en una ventana aparte. Útil para ver qué falla si el juego no arranca.
                                    </span>
                                </div>
                                <Toggle on={settings.showLogs} onChange={v => set('showLogs', v)} label="Abrir la consola del juego" />
                            </div>
                        </div>

                        <div style={modal.divider} />

                        {/* ── Avanzado ── */}
                        <div style={modal.section}>
                            <button
                                style={ui.collapseBtn(advancedHovered)}
                                onMouseEnter={() => setAdvancedHovered(true)}
                                onMouseLeave={() => setAdvancedHovered(false)}
                                onClick={() => setAdvancedOpen(o => !o)}
                                aria-expanded={advancedOpen}
                            >
                                <span style={modal.sectionTitle}>Avanzado</span>
                                <span style={ui.chevron(advancedOpen)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                                </span>
                            </button>

                            {advancedOpen && (
                                <>
                                    <div>
                                        <div style={{ ...modal.row, marginBottom: '6px' }}>
                                            <span style={modal.label}>RAM inicial</span>
                                            <span style={modal.valueTag}>{formatGb(Math.min(settings.minRamMb, maxRam))}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={512}
                                            max={maxRam}
                                            step={256}
                                            value={Math.min(settings.minRamMb, maxRam)}
                                            onChange={e => set('minRamMb', Number(e.target.value))}
                                            style={modal.slider}
                                            aria-label="RAM inicial"
                                        />
                                        <span style={ui.toggleDesc}>
                                            Memoria que Java reserva al arrancar. Normalmente no hace falta tocarla.
                                        </span>
                                    </div>

                                    <div style={ui.toggleRow}>
                                        <div style={ui.toggleText}>
                                            <span style={modal.label}>Optimización automática de Java</span>
                                            <span style={ui.toggleDesc}>
                                                Añade flags de rendimiento según tu procesador y tu memoria.
                                            </span>
                                        </div>
                                        <Toggle on={settings.autoJvmArgs} onChange={v => set('autoJvmArgs', v)} label="Optimización automática de Java" />
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <span style={modal.label}>Argumentos de Java adicionales</span>
                                        <textarea
                                            style={modal.textarea}
                                            value={settings.extraJvmArgs}
                                            onChange={e => set('extraJvmArgs', e.target.value)}
                                            placeholder="-Dfml.readTimeout=180"
                                            spellCheck={false}
                                        />
                                        <span style={ui.toggleDesc}>
                                            Separados por espacios. El recolector de basura se elige solo según tu versión de Java y tu RAM; si escribes aquí uno (p. ej. -XX:+UseG1GC), se usará el tuyo.
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Footer ── */}
                <div style={modal.footer}>
                    <button
                        style={ui.restoreBtn(restoreHovered)}
                        onMouseEnter={() => setRestoreHovered(true)}
                        onMouseLeave={() => setRestoreHovered(false)}
                        onClick={restoreRecommended}
                        disabled={!settings}
                    >
                        Restaurar recomendados
                    </button>
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
                            opacity: settings ? 1 : 0.5,
                        }}
                        onMouseEnter={() => setSaveHovered(true)}
                        onMouseLeave={() => setSaveHovered(false)}
                        onClick={handleSave}
                        disabled={!settings}
                    >
                        Guardar
                    </button>
                </div>

            </div>
        </div>
    );
}
