import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AUTH_VERSION, Account, accountFromLogin, isSessionRejected } from '../types/account';
import { LoginCompleteResponse } from '../types/setup';

interface UserContextValue {
    isSetupDone: boolean;
    resetSetup: () => void;
    basePath: string | null;
    isLoading: boolean;
    accounts: Account[];
    setAccounts: React.Dispatch<React.SetStateAction<Account[]>>;
    activeAccount: Account | null;
    /** Devuelve la cuenta activa con un token válido, refrescándolo si hace falta */
    ensureActiveSession: () => Promise<Account>;
    /** Cuentas de Microsoft quitadas por sesión caducada: hay que volver a iniciar sesión */
    expiredUsernames: string[];
    clearExpiredSession: () => void;
}

const UserContext = createContext<UserContextValue>({
    isSetupDone: false,
    resetSetup: () => { },
    basePath: null,
    isLoading: true,
    accounts: [],
    setAccounts: () => { },
    activeAccount: null,
    ensureActiveSession: () => Promise.reject(new Error('UserProvider no montado')),
    expiredUsernames: [],
    clearExpiredSession: () => { },
});


export function useUser() {
    return useContext(UserContext);
}

const LS_KEY = 'kb_launcher_user';
/** Margen antes de la caducidad a partir del cual se refresca el token */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;


export function UserProvider({ children }: Readonly<{ children: React.ReactNode }>) {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [basePath, setBasePath] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [expiredUsernames, setExpiredUsernames] = useState<string[]>([]);

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

                // Refrescar tokens caducados o próximos a caducar. null = sesión
                // rechazada: se quita la cuenta y se pide volver a iniciar sesión
                const refreshed = await Promise.all(
                    loadedAccounts.map(async (account): Promise<Account | null> => {
                        if (!account.isOnline) return account;
                        if (!account.refreshToken) return null;

                        const expiresAt = account.tokenExpiresAt ?? 0;
                        // Las de la 1.0.x guardaban mal la caducidad: se renuevan siempre una vez
                        const needsRefresh = !account.accessToken
                            || account.authVersion !== AUTH_VERSION
                            || expiresAt - Date.now() < ONE_HOUR_MS;

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
                                ...accountFromLogin(result, account.isActual),
                                skinHeadBase64: result.skin_head_base64 ?? account.skinHeadBase64,
                            };

                            console.log(`[UserContext] ✓ Token de ${account.username} renovado`);
                            return updated;
                        } catch (err) {
                            console.error(`[UserContext] Error renovando token de ${account.username}:`, err);
                            // Refresh token caducado/revocado: hay que iniciar sesión otra vez.
                            // Si es un fallo de red se conserva y se reintenta al jugar
                            return isSessionRejected(err) ? null : account;
                        }
                    })
                );

                const expired = loadedAccounts.filter((_, i) => refreshed[i] === null);
                if (expired.length > 0) {
                    console.warn('[UserContext] Sesiones caducadas:', expired.map(a => a.username));
                    setExpiredUsernames(expired.map(a => a.username ?? 'tu cuenta'));
                }
                setAccounts(refreshed.filter((a): a is Account => a !== null));
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
        if (isLoading) return;
        if (accounts.length === 0) {
            localStorage.removeItem(LS_KEY);
            return;
        }
        localStorage.setItem(LS_KEY, JSON.stringify(accounts));
    }, [accounts, isLoading]);

    function resetSetup() {
        localStorage.removeItem(LS_KEY);
        setAccounts([]);
    }

    const activeAccount = accounts.find(a => a.isActual) ?? accounts[0] ?? null;

    const expireAccount = useCallback((account: Account) => {
        setAccounts(prev => prev.filter(a => !(a.isOnline && a.uuid === account.uuid)));
        setExpiredUsernames([account.username ?? 'tu cuenta']);
    }, []);

    const clearExpiredSession = useCallback(() => setExpiredUsernames([]), []);

    const ensureActiveSession = useCallback(async (): Promise<Account> => {
        if (!activeAccount) throw new Error('No hay ninguna cuenta seleccionada');
        if (!activeAccount.isOnline) return activeAccount;

        // Al arrancar ya se refrescan los tokens, pero el launcher puede pasar
        // días abierto en la bandeja: se vuelve a comprobar antes de jugar
        const stillValid = activeAccount.accessToken
            && activeAccount.tokenExpiresAt
            && activeAccount.tokenExpiresAt - REFRESH_MARGIN_MS > Date.now();
        if (stillValid) return activeAccount;

        const expiredError = new Error('La sesión de Microsoft ha caducado. Vuelve a iniciar sesión con tu cuenta.');
        if (!activeAccount.refreshToken) {
            expireAccount(activeAccount);
            throw expiredError;
        }

        let result: LoginCompleteResponse;
        try {
            result = await invoke<LoginCompleteResponse>('auth_refresh', {
                refreshToken: activeAccount.refreshToken,
            });
        } catch (err) {
            if (isSessionRejected(err)) {
                expireAccount(activeAccount);
                throw expiredError;
            }
            throw err;
        }
        const refreshed: Account = {
            ...accountFromLogin(result),
            // Si no llega skin nueva, conservar la anterior
            skinHeadBase64: result.skin_head_base64 ?? activeAccount.skinHeadBase64,
        };
        setAccounts(prev => prev.map(a => a.uuid === refreshed.uuid ? { ...refreshed, isActual: a.isActual } : a));
        return refreshed;
    }, [activeAccount, expireAccount]);

    const isSetupDone = accounts.length > 0;

    return (
        <UserContext.Provider value={{
            isSetupDone,
            resetSetup,
            basePath,
            isLoading,
            accounts,
            setAccounts,
            activeAccount,
            ensureActiveSession,
            expiredUsernames,
            clearExpiredSession,
        }}>
            {children}
        </UserContext.Provider>
    );
}
