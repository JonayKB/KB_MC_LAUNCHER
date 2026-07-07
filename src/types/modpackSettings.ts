export interface ModpackSettings {
  minRamMb: number;
  maxRamMb: number;
  fullscreen: boolean;
  windowWidth: number;
  windowHeight: number;
  extraJvmArgs: string;
}

export const DEFAULT_SETTINGS: ModpackSettings = {
  minRamMb: 512,
  maxRamMb: 4096,
  fullscreen: true,
  windowWidth: 1920,
  windowHeight: 1080,
  extraJvmArgs: '',
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
    window_width: number;
    window_height: number;
    fullscreen: boolean;
}