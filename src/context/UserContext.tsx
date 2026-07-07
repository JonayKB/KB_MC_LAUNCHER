import React, { createContext, useContext, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Account } from '../types/account';

interface UserContextValue {
    isSetupDone: boolean;
    resetSetup: () => void;
    basePath: string | null;
    isLoading: boolean;
    accounts: Account[];
    setAccounts: React.Dispatch<React.SetStateAction<Account[]>>;
}

const UserContext = createContext<UserContextValue>({
    isSetupDone: false,
    resetSetup: () => { },
    basePath: null,
    isLoading: true,
    accounts: [],
    setAccounts: () => { },

});


export function useUser() {
    return useContext(UserContext);
}

const LS_KEY = 'kb_launcher_user';


export function UserProvider({ children }: Readonly<{ children: React.ReactNode }>) {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [basePath, setBasePath] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // ── Cargar desde localStorage (una sola vez) ──────────────
    useEffect(() => {
        try {
            const raw = localStorage.getItem(LS_KEY);
            console.log('[UserContext] localStorage raw:', raw);
            if (raw) {
                const data: Account[] = JSON.parse(raw);
                console.log('[UserContext] datos parseados:', data);
                setAccounts(data);
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
        console.log('[UserContext] intento persistir — accounts:', accounts);
        if (accounts.length === 0) {
            localStorage.removeItem(LS_KEY);
            return;
        }
        localStorage.setItem(LS_KEY, JSON.stringify(accounts));
    }, [accounts]);

    function resetSetup() {
        localStorage.removeItem(LS_KEY);
        setAccounts([]);
    }

    const isSetupDone = accounts.length > 0;

    console.log('[UserContext] render — isSetupDone:', isSetupDone, '| isLoading:', isLoading);

    return (
        <UserContext.Provider value={{
            isSetupDone,
            resetSetup,
            basePath,
            isLoading,
            accounts,
            setAccounts,
        }}>
            {children}
        </UserContext.Provider>
    );
}