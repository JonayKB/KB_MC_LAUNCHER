import React, { createContext, useContext, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface UserContextValue {
    hasMinecraftOwned: boolean | null;
    setHasMinecraftOwned: (owned: boolean) => void;
    username: string | undefined;
    setUsername: (name: string) => void;
    isSetupDone: boolean;
    resetSetup: () => void;
    basePath: string | null;
    isLoading: boolean;
}

const UserContext = createContext<UserContextValue>({
    hasMinecraftOwned: null,
    setHasMinecraftOwned: () => {},
    username: undefined,
    setUsername: () => {},
    isSetupDone: false,
    resetSetup: () => {},
    basePath: null,
    isLoading: true,
});

export function useUser() {
    return useContext(UserContext);
}

const LS_KEY = 'kb_launcher_user';

interface PersistedUser {
    hasMinecraftOwned: boolean | null;
    username?: string;
}

export function UserProvider({ children }: Readonly<{ children: React.ReactNode }>) {
    const [hasMinecraftOwned, setHasMinecraftOwnedState] = useState<boolean | null>(null);
    const [username, setUsernameState] = useState<string | undefined>(undefined);
    const [basePath, setBasePath] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // ── Cargar desde localStorage (una sola vez) ──────────────
    useEffect(() => {
        try {
            const raw = localStorage.getItem(LS_KEY);
            console.log('[UserContext] localStorage raw:', raw);
            if (raw) {
                const data: PersistedUser = JSON.parse(raw);
                console.log('[UserContext] datos parseados:', data);
                setHasMinecraftOwnedState(data.hasMinecraftOwned);
                setUsernameState(data.username);
            } else {
                console.log('[UserContext] localStorage vacío');
            }
        } catch (e) {
            console.error('[UserContext] error leyendo localStorage:', e);
        }
        setIsLoading(false);
    }, []);

    // ── Obtener basePath desde Rust ───────────────────────────
    useEffect(() => {
        invoke<string>('get_base_path')
            .then(setBasePath)
            .catch(() => setBasePath('~/.mc_launcher'));
    }, []);

    // ── Persistir cambios ─────────────────────────────────────
    useEffect(() => {
        console.log('[UserContext] intento persistir — hasMinecraftOwned:', hasMinecraftOwned, '| username:', username);
        if (hasMinecraftOwned === null) {
            console.log('[UserContext] → skip (hasMinecraftOwned null)');
            return;
        }
        const toSave = { hasMinecraftOwned, username };
        console.log('[UserContext] → guardando:', toSave);
        localStorage.setItem(LS_KEY, JSON.stringify(toSave));
    }, [hasMinecraftOwned, username]);

    function setHasMinecraftOwned(owned: boolean) {
        setHasMinecraftOwnedState(owned);
    }

    function setUsername(name: string) {
        setUsernameState(name);
    }

    function resetSetup() {
        localStorage.removeItem(LS_KEY);
        setHasMinecraftOwnedState(null);
        setUsernameState(undefined);
    }

    const isSetupDone =
        (hasMinecraftOwned === false && !!username) ||
        hasMinecraftOwned === true;

    console.log('[UserContext] render — isSetupDone:', isSetupDone, '| isLoading:', isLoading);

    return (
        <UserContext.Provider value={{
            hasMinecraftOwned,
            setHasMinecraftOwned,
            username,
            setUsername,
            isSetupDone,
            resetSetup,
            basePath,
            isLoading,
        }}>
            {children}
        </UserContext.Provider>
    );
}