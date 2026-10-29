import { invoke } from '@tauri-apps/api/core';
import { recordPlayed } from './PlayHistory';
import type { Account } from '../types/account';
import { ModpackVersion, resolveLoader } from '../types/modpack';
import { DEFAULT_SETTINGS, ModpackSettings, RecommendedSettings } from '../types/modpackSettings';

const settingsKey = (modpackId: string) => `kb_settings_${modpackId}`;
/** Firma de los flags que antes se guardaban automáticamente en extraJvmArgs */
const LEGACY_AUTO_FLAG = '-XX:AllocatePrefetchStyle=1';

let recommendedPromise: Promise<RecommendedSettings | null> | null = null;

/** Recomendación para el equipo (no cambia mientras la app está abierta) */
export function getRecommendedSettings(): Promise<RecommendedSettings | null> {
    recommendedPromise ??= invoke<RecommendedSettings>('get_recommended_settings').catch((err) => {
        console.warn('[ModpackActions] No se pudieron obtener settings recomendados:', err);
        recommendedPromise = null;
        return null;
    });
    return recommendedPromise;
}

export function saveModpackSettings(modpackId: string, settings: ModpackSettings) {
    localStorage.setItem(settingsKey(modpackId), JSON.stringify(settings));
}

function readSaved(modpackId: string): Partial<ModpackSettings> | null {
    try {
        const raw = localStorage.getItem(settingsKey(modpackId));
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/**
 * Ajustes efectivos del modpack. Si no hay guardados, crea los recomendados.
 * Migra los guardados por versiones anteriores: antes se asignaba la mitad de
 * la RAM y los flags automáticos se mezclaban con los del usuario.
 */
export async function ensureModpackSettings(modpackId: string): Promise<ModpackSettings> {
    const rec = await getRecommendedSettings();
    const saved = readSaved(modpackId);

    if (!saved) {
        const settings: ModpackSettings = rec
            ? {
                ...DEFAULT_SETTINGS,
                minRamMb: rec.min_ram_mb,
                maxRamMb: rec.max_ram_mb,
                windowWidth: rec.window_width,
                windowHeight: rec.window_height,
                fullscreen: rec.fullscreen,
            }
            : { ...DEFAULT_SETTINGS };
        saveModpackSettings(modpackId, settings);
        return settings;
    }

    const settings: ModpackSettings = { ...DEFAULT_SETTINGS, ...saved };

    if (saved.ramSource === undefined) {
        // La fórmula antigua era el 50% de la RAM, entre 2GB y 16GB
        const oldAuto = rec ? Math.min(16384, Math.max(2048, Math.floor(rec.total_ram_mb / 2))) : null;
        settings.ramSource = oldAuto !== null && saved.maxRamMb === oldAuto ? 'auto' : 'user';
        if (settings.extraJvmArgs.includes(LEGACY_AUTO_FLAG)) {
            settings.extraJvmArgs = '';
            settings.autoJvmArgs = true;
        }
    }

    if (settings.ramSource === 'auto' && rec) {
        settings.maxRamMb = rec.max_ram_mb;
        settings.minRamMb = rec.min_ram_mb;
    }

    saveModpackSettings(modpackId, settings);
    return settings;
}

/** Lanza el modpack con la cuenta indicada (ya con la sesión refrescada) */
export async function launchModpack(
    modpack: ModpackVersion,
    basePath: string,
    account: Account,
    modpackName: string,
): Promise<void> {
    const settings = await ensureModpackSettings(modpack.modpackId);
    const rec = settings.autoJvmArgs ? await getRecommendedSettings() : null;
    const jvmArgs = [rec?.extra_jvm_args, settings.extraJvmArgs]
        .filter(Boolean)
        .join(' ');

    const { loader, loaderVersion } = resolveLoader(modpack);
    await invoke('launch_modpack', {
        basePath,
        modpackId: modpack.modpackId,
        modpackName,
        showLogs: settings.showLogs,
        mcVersion: modpack.minecraftVersion,
        loader,
        loaderVersion,
        username: account.username ?? 'Player',
        uuid: account.isOnline ? account.uuid : null,
        accessToken: account.isOnline ? account.accessToken : null,
        minRamMb: Math.min(settings.minRamMb, settings.maxRamMb),
        maxRamMb: settings.maxRamMb,
        fullscreen: settings.fullscreen,
        windowWidth: settings.windowWidth,
        windowHeight: settings.windowHeight,
        extraJvmArgs: jvmArgs,
    });
    recordPlayed(modpack.modpackId);
}
