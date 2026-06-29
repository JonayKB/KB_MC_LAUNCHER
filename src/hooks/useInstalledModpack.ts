import { useState, useEffect } from 'react';
import type { InstalledModpack } from '../types/modpack';

const LS_KEY = 'kb_installed_modpack';

export function useInstalledModpack() {
    const [installed, setInstalledState] = useState<InstalledModpack | null>(null);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) setInstalledState(JSON.parse(raw));
        } catch { /* ignorar */ }
    }, []);

    function setInstalled(data: InstalledModpack | null) {
        setInstalledState(data);
        if (data) localStorage.setItem(LS_KEY, JSON.stringify(data));
        else localStorage.removeItem(LS_KEY);
    }

    return { installed, setInstalled };
}