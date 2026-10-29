import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { ModpackPlaytime, PLAYTIME_CHANGED_EVENT, getPlaytime, recordSession } from '../repositories/PlayHistory';

/** Payload de game_exited (launcher.rs) */
interface GameExitedEvent {
    modpackId: string;
    durationSecs?: number;
}

/**
 * Guarda cada partida terminada en el historial. Montar una sola vez en la
 * ventana principal (la de logs también recibe el evento y duplicaría sesiones).
 */
export function usePlaySessionRecorder() {
    useEffect(() => {
        const unlisten = listen<GameExitedEvent>('game_exited', (e) => {
            if (e.payload.durationSecs != null) recordSession(e.payload.modpackId, e.payload.durationSecs);
        });
        return () => { unlisten.then(un => un()); };
    }, []);
}

/** Tiempo jugado de un modpack; se actualiza al terminar una partida */
export function usePlaytime(modpackId: string | null | undefined): ModpackPlaytime | null {
    const [playtime, setPlaytime] = useState<ModpackPlaytime | null>(null);

    useEffect(() => {
        if (!modpackId) {
            setPlaytime(null);
            return;
        }
        setPlaytime(getPlaytime(modpackId));
        const onChange = (e: Event) => {
            if ((e as CustomEvent<string>).detail === modpackId) setPlaytime(getPlaytime(modpackId));
        };
        window.addEventListener(PLAYTIME_CHANGED_EVENT, onChange);
        return () => window.removeEventListener(PLAYTIME_CHANGED_EVENT, onChange);
    }, [modpackId]);

    return playtime;
}
