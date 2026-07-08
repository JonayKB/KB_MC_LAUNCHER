import React, { createContext, useContext, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Account } from '../types/account';
import { LoginCompleteResponse } from '../types/setup';

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
const ONE_HOUR_MS = 60 * 60 * 1000;


export function UserProvider({ children }: Readonly<{ children: React.ReactNode }>) {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [basePath, setBasePath] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // ── Cargar desde localStorage (una sola vez) ──────────────
    useEffect(() => {
        const init = async () => {
            try {
                const raw = localStorage.getItem(LS_KEY);
                if (!raw) {
                    setIsLoading(false);
                    return;
                }

                let loadedAccounts: Account[] = JSON.parse(raw);
                console.log('[UserContext] Cuentas cargadas:', loadedAccounts.length);

                // Refrescar tokens caducados o próximos a caducar
                const refreshed = await Promise.all(
                    loadedAccounts.map(async (account) => {
                        if (!account.isOnline || !account.refreshToken) return account;

                        const expiresAt = account.tokenExpiresAt ?? 0;
                        const needsRefresh = expiresAt - Date.now() < ONE_HOUR_MS;

                        if (!needsRefresh) {
                            console.log(`[UserContext] Token de ${account.username} válido`);
                            return account;
                        }

                        console.log(`[UserContext] Renovando token de ${account.username}...`);
                        try {
                            const result = await invoke<LoginCompleteResponse>('auth_refresh', {
                                refreshToken: account.refreshToken,
                            });

                            const updated: Account = {
                                ...account,
                                accessToken: result.access_token,
                                refreshToken: result.refresh_token,
                                uuid: result.uuid,
                                username: result.username,
                                tokenExpiresAt: Date.now() + result.expires_in * 1000,
                            };

                            console.log(`[UserContext] ✓ Token de ${account.username} renovado`);
                            return updated;
                        } catch (err) {
                            console.error(`[UserContext] Error renovando token de ${account.username}:`, err);
                            // Si falla el refresh (token expirado tras 90 días),
                            // marcar como inválido para que el usuario haga login de nuevo
                            return {
                                ...account,
                                accessToken: undefined,
                                isActual: false,
                            } as Account;
                        }
                    })
                );

                setAccounts(refreshed);
            } catch (e) {
                console.error('[UserContext] Error en init:', e);
            }

            setIsLoading(false);
        };

        init();
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