import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from '../styles/installToastStyles';
import type { LogStatus } from '../types/gameLogs';

interface Crash {
    modpackId: string;
    name: string;
    exitCode: number | null;
}

/** Pista para los códigos de salida más habituales de Minecraft/Java */
function hintFor(code: number | null): string | null {
    switch (code) {
        case null: return 'El sistema cerró el proceso. Suele ser por falta de memoria: prueba a bajar la RAM asignada.';
        case -805306369: return 'Windows cerró el juego (falta de memoria o se quedó colgado). Prueba a bajar la RAM o cerrar otros programas.';
        case -1073741819: return 'Fallo de acceso a memoria, casi siempre por los drivers de la gráfica. Prueba a actualizarlos.';
        case -1073740791: return 'Error nativo del juego. Revisa la consola: suele indicar el mod que falla.';
        case 1: return 'Error al cargar el juego. Revisa la consola: suele indicar el mod que falla.';
        default: return null;
    }
}

/** Aviso cuando el juego se cierra con error (no si lo detiene el usuario) */
export default function CrashToast() {
    const [crash, setCrash] = useState<Crash | null>(null);

    useEffect(() => {
        const unlisten = listen<LogStatus>('game_log_status', (e) => {
            const { running, killed, exitCode, modpackId, name } = e.payload;
            if (running || killed || exitCode === 0) return;
            setCrash({ modpackId, name, exitCode });
        });
        return () => { unlisten.then(un => un()); };
    }, []);

    if (!crash) return null;
    const hint = hintFor(crash.exitCode);

    return (
        // Abajo, para no tapar el aviso de instalación
        <div style={{ ...toast.wrap('error'), top: 'auto', bottom: '16px' }} role="alert">
            <div style={toast.header}>
                <div style={toast.icon('error')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                </div>
                <div style={toast.titleCol}>
                    <span style={toast.eyebrow('error')}>
                        El juego se cerró inesperadamente{crash.exitCode !== null && ` · código ${crash.exitCode}`}
                    </span>
                    <span style={toast.title}>{crash.name}</span>
                </div>
                <button style={toast.closeBtn} onClick={() => setCrash(null)} aria-label="Cerrar notificación">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>
            {hint && <span style={toast.step}>{hint}</span>}
            <div style={toast.footer}>
                <span />
                <button
                    style={toast.cancelBtn(false)}
                    onClick={() => invoke('open_game_logs', { modpackId: crash.modpackId }).catch(() => { })}
                >
                    Ver consola
                </button>
            </div>
        </div>
    );
}
