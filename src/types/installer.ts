export type InstallProgress =
  | { type: 'step'; step: string; percent: number }
  | {
      type: 'download';
      step: string;
      percent: number;
      downloaded_bytes: number;
      total_bytes: number | null;
      speed_bps: number;
    }
  | {
      type: 'extract';
      step: string;
      percent: number;
      extracted_files: number;
      total_files: number;
      speed_fps: number;
    };

// helpers
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`;
}