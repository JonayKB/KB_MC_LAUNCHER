export interface ModpackSettings {
  minRamMb: number;
  maxRamMb: number;
  /**
   * "auto": la RAM sigue la recomendación para el equipo (se recalcula al jugar).
   * "user": el usuario eligió un valor y se respeta.
   * Ausente en ajustes guardados por versiones anteriores.
   */
  ramSource?: 'auto' | 'user';
  fullscreen: boolean;
  windowWidth: number;
  windowHeight: number;
  /** Añadir al lanzar los flags de Java recomendados para el equipo */
  autoJvmArgs: boolean;
  /** Solo los argumentos que añade el usuario */
  extraJvmArgs: string;
  /** Abrir la ventana de logs al lanzar el juego */
  showLogs: boolean;
}

export const DEFAULT_SETTINGS: ModpackSettings = {
  minRamMb: 2048,
  maxRamMb: 4096,
  ramSource: 'auto',
  fullscreen: true,
  windowWidth: 1920,
  windowHeight: 1080,
  autoJvmArgs: true,
  extraJvmArgs: '',
  showLogs: true,
};

export const RESOLUTIONS = [
  { label: '854 × 480  (480p)', width: 854,  height: 480  },
  { label: '1280 × 720  (720p)', width: 1280, height: 720  },
  { label: '1920 × 1080 (1080p)', width: 1920, height: 1080 },
  { label: '2560 × 1440 (1440p)', width: 2560, height: 1440 },
  { label: 'Personalizado', width: 0, height: 0 },
];

export interface RecommendedSettings {
    min_ram_mb: number;
    max_ram_mb: number;
    extra_jvm_args: string;
    total_ram_mb: number;
    window_width: number;
    window_height: number;
    fullscreen: boolean;
}
/** Opciones de RAM para el selector, calculadas a partir de la recomendación */
export interface RamPresets {
  low: number;
  recommended: number;
  high: number;
  /** Límite del selector: deja al menos 1GB al sistema */
  sliderMax: number;
  /** A partir de aquí el sistema operativo puede quedarse sin memoria */
  warnAbove: number;
}

const snap512 = (mb: number) => Math.round(mb / 512) * 512;

export function ramPresets(rec: Pick<RecommendedSettings, 'max_ram_mb' | 'total_ram_mb'>): RamPresets {
  const total = rec.total_ram_mb;
  const recommended = rec.max_ram_mb;
  const sliderMax = Math.max(2048, snap512(total - 1024));
  const warnAbove = Math.max(recommended, snap512(total - 3072));
  return {
    low: Math.max(2048, Math.min(recommended, snap512(recommended * 0.75))),
    recommended,
    high: Math.min(sliderMax, Math.max(recommended, snap512(Math.min(recommended * 1.5, total - 3072)))),
    sliderMax,
    warnAbove,
  };
}

/** RAM inicial (Xms) adecuada para un máximo dado; igual criterio que sysinfo.rs */
export function minRamFor(maxRamMb: number): number {
  return Math.min(4096, Math.max(1024, Math.round(maxRamMb / 2 / 256) * 256));
}
