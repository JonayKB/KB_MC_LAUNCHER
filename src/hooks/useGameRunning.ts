import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** Si hay una instancia de Minecraft abierta para el modpack (sobrevive a cambiar de pantalla) */
export function useGameRunning(modpackId: string | null | undefined): boolean {
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        if (!modpackId) {
            setPlaying(false);
            return;
        }
        invoke<boolean>('is_game_running', { modpackId }).then(setPlaying).catch(() => { });
        const unlisteners = [
            listen<string>('game_started', (e) => { if (e.payload === modpackId) setPlaying(true); }),
            listen<string>('game_exited', (e) => { if (e.payload === modpackId) setPlaying(false); }),
        ];
        return () => { unlisteners.forEach(p => p.then(un => un())); };
    }, [modpackId]);

    return playing;
}
