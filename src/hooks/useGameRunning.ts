import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** Payload de game_started / game_exited (launcher.rs) */
interface GameEvent {
    modpackId: string;
    exitCode?: number | null;
}

/** Si hay una instancia de Minecraft abierta para el modpack (sobrevive a cambiar de pantalla) */
export function useGameRunning(modpackId: string | null | undefined): boolean {
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        if (!modpackId) {
            setPlaying(false);
            return;
        }
        invoke<boolean>('is_modpack_running', { modpackId }).then(setPlaying).catch(() => { });
        const unlisteners = [
            listen<GameEvent>('game_started', (e) => { if (e.payload.modpackId === modpackId) setPlaying(true); }),
            listen<GameEvent>('game_exited', (e) => { if (e.payload.modpackId === modpackId) setPlaying(false); }),
        ];
        return () => { unlisteners.forEach(p => p.then(un => un())); };
    }, [modpackId]);

    return playing;
}
