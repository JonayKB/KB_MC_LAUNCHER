export type LogStream = 'stdout' | 'stderr' | 'system';

export interface LogLine {
    seq: number;
    stream: LogStream;
    text: string;
}

/** Respuesta de get_game_logs (game_logs.rs) */
export interface LogSnapshot {
    modpackId: string;
    name: string;
    lines: LogLine[];
    running: boolean;
    killed: boolean;
    exitCode: number | null;
    startedAt: number;
}

/** Evento game_log */
export interface LogBatch {
    modpackId: string;
    lines: LogLine[];
}

/** Evento game_log_status */
export interface LogStatus {
    modpackId: string;
    running: boolean;
    killed: boolean;
    exitCode: number | null;
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'system';

const LEVEL_RE = /[[/](FATAL|ERROR|SEVERE|WARN|WARNING|INFO|DEBUG|TRACE)\]/;
/** Continuación de una traza de Java: hereda el nivel de la línea anterior */
const CONTINUATION_RE = /^(\s+at |\s*Caused by:|\s+\.\.\. \d+ more|\s+Suppressed:)/;

/** Nivel de una línea de log de Minecraft (formato log4j: "[12:00:00] [main/INFO]: ...") */
export function detectLevel(line: LogLine, previous: LogLevel | null): LogLevel {
    if (line.stream === 'system') return 'system';
    const m = LEVEL_RE.exec(line.text);
    if (m) {
        switch (m[1]) {
            case 'FATAL': case 'ERROR': case 'SEVERE': return 'error';
            case 'WARN': case 'WARNING': return 'warn';
            case 'DEBUG': case 'TRACE': return 'debug';
            default: return 'info';
        }
    }
    if (previous && previous !== 'system' && CONTINUATION_RE.test(line.text)) return previous;
    if (/^(Exception in thread|[\w.$]+(Exception|Error)(: |$))/.test(line.text)) return 'error';
    return 'info';
}
