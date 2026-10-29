import { useEffect, useState } from 'react';

/**
 * Hora actual que se actualiza sola mientras haya alguna fecha pendiente,
 * para que los modpacks se desbloqueen y las cuentas atrás avancen sin recargar.
 * Cada segundo si falta poco (o se muestran segundos), cada 30 s si no.
 */
export function useNow(nextDeadline: number | null, everySecond = false): number {
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        if (nextDeadline === null || nextDeadline <= now) return;
        const remaining = nextDeadline - now;
        const step = everySecond || remaining < 2 * 60 * 1000 ? 1000 : 30 * 1000;
        const id = setTimeout(() => setNow(Date.now()), Math.min(step, remaining + 50));
        return () => clearTimeout(id);
    }, [nextDeadline, now, everySecond]);

    return now;
}
