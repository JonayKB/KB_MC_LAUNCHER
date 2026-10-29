import { invoke } from '@tauri-apps/api/core';
import { loadSettings } from '../components/ModpackSettingsModal';
import { recordPlayed } from './PlayHistory';
import type { Account } from '../types/account';
import { ModpackVersion, resolveLoader } from '../types/modpack';
import type { ModpackSettings, RecommendedSettings } from '../types/modpackSettings';

const settingsKey = (modpackId: string) => `kb_settings_${modpackId}`;

/**
 * Si el usuario no ha guardado ajustes para este modpack, guarda los
 * recomendados para su equipo. Devuelve los ajustes efectivos.
 */
export async function ensureModpackSettings(modpackId: string): Promise<ModpackSettings> {
    if (localStorage.getItem(settingsKey(modpackId))) return loadSettings(modpackId);
    try {
        const recommended = await invoke<RecommendedSettings>('get_recommended_settings');
        const settings: ModpackSettings = {
            minRamMb: recommended.min_ram_mb,
            maxRamMb: recommended.max_ram_mb,
            fullscreen: recommended.fullscreen,
            windowWidth: recommended.window_width,
            windowHeight: recommended.window_height,
            extraJvmArgs: recommended.extra_jvm_args,
        };
        localStorage.setItem(settingsKey(modpackId), JSON.stringify(settings));
        return settings;
    } catch (err) {
        console.warn('[ModpackActions] No se pudieron obtener settings recomendados:', err);
        return loadSettings(modpackId);
    }
}

/** Lanza el modpack con la cuenta indicada (ya con la sesión refrescada) */
export async function launchModpack(
    modpack: ModpackVersion,
    basePath: string,
    account: Account,
    settings: ModpackSettings = loadSettings(modpack.modpackId),
): Promise<void> {
    const { loader, loaderVersion } = resolveLoader(modpack);
    await invoke('launch_modpack', {
        basePath,
        modpackId: modpack.modpackId,
        mcVersion: modpack.minecraftVersion,
        loader,
        loaderVersion,
        username: account.username ?? 'Player',
        uuid: account.isOnline ? account.uuid : null,
        accessToken: account.isOnline ? account.accessToken : null,
        minRamMb: settings.minRamMb,
        maxRamMb: settings.maxRamMb,
        fullscreen: settings.fullscreen,
        windowWidth: settings.windowWidth,
        windowHeight: settings.windowHeight,
        extraJvmArgs: settings.extraJvmArgs,
    });
    recordPlayed(modpack.modpackId);
}
