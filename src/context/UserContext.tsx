import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AUTH_VERSION, Account, TokenVault, accountFromLogin, isSessionRejected, mergeTokens, splitTokens } from '../types/account';
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

    // Siempre la última versión, también dentro de tareas ya en marcha
    const accountsRef = useRef(accounts);
    accountsRef.current = accounts;
    /** Sin poder leer el almacén seguro no se sabe qué hay: nada se da por caducado ni se sobrescribe */
    const vaultUnreadable = useRef(false);
    /** Refresco inicial en curso: jugar debe esperarlo para no gastar el mismo token dos veces */
    const startupRefresh = useRef<Promise<void>>(Promise.resolve());
    /** Las escrituras van en orden: la última guardada debe ser la última pedida */
    const saveQueue = useRef<Promise<void>>(Promise.resolve());

    const commitAccounts = useCallback((update: (prev: Account[]) => Account[]) => {
        accountsRef.current = update(accountsRef.current);
        setAccounts(accountsRef.current);
    }, []);

    const refreshStartupSessions = useCallback(async (loaded: Account[]) => {
        // Refrescar tokens caducados o próximos a caducar
        const expired: Account[] = [];
        await Promise.all(loaded.map(async (account) => {
            if (!account.isOnline) return;
            if (!account.refreshToken) {
                if (!vaultUnreadable.current) expired.push(account);
                return;
            }

            const expiresAt = account.tokenExpiresAt ?? 0;
            // Las de la 1.0.x guardaban mal la caducidad: se renuevan siempre una vez
            const needsRefresh = !account.accessToken
                || account.authVersion !== AUTH_VERSION
                || expiresAt - Date.now() < ONE_HOUR_MS;
            if (!needsRefresh) {
                console.log(`[UserContext] Token de ${account.username} válido`);
                return;
            }

            console.log(`[UserContext] Renovando token de ${account.username}...`);
            try {
                const result = await invoke<LoginCompleteResponse>('auth_refresh', {
                    refreshToken: account.refreshToken,
                });
                commitAccounts(prev => prev.map(a => a.isOnline && a.uuid === account.uuid
                    ? {
                        ...accountFromLogin(result, a.isActual),
                        skinHeadBase64: result.skin_head_base64 ?? a.skinHeadBase64,
                    }
                    : a));
                console.log(`[UserContext] ✓ Token de ${account.username} renovado`);
            } catch (err) {
                console.error(`[UserContext] Error renovando token de ${account.username}:`, err);
                // Refresh token caducado/revocado: hay que iniciar sesión otra vez.
                // Si es un fallo de red se conserva y se reintenta al jugar
                if (isSessionRejected(err)) expired.push(account);
            }
        }));

        if (expired.length > 0) {
            console.warn('[UserContext] Sesiones caducadas:', expired.map(a => a.username));
            setExpiredUsernames(expired.map(a => a.username ?? 'tu cuenta'));
            commitAccounts(prev => prev.filter(a => !expired.some(e => e.uuid === a.uuid)));
        }
    }, [commitAccounts]);

    // ── Cargar las cuentas (una sola vez) ─────────────────────
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

                try {
                    loadedAccounts = mergeTokens(loadedAccounts, await invoke<TokenVault>('tokens_load'));
                } catch (err) {
                    console.error('[UserContext] Almacén seguro no disponible:', err);
                    vaultUnreadable.current = true;
                }

                commitAccounts(() => loadedAccounts);
                // El refresco va en segundo plano: con mala conexión no debe dejar la ventana en blanco
                startupRefresh.current = refreshStartupSessions(loadedAccounts).catch((e) => {
                    console.error('[UserContext] Error renovando sesiones:', e);
                });
            } catch (e) {
                console.error('[UserContext] Error en init:', e);
            }

            setIsLoading(false);
        };

        init();
    }, [commitAccounts, refreshStartupSessions]);

    // ── Obtener basePath desde Rust ───────────────────────────
    useEffect(() => {
        invoke<string>('get_base_path')
            .then(setBasePath)
            .catch(() => setBasePath('~/.mc_launcher'));
    }, []);

    // ── Persistir cambios ─────────────────────────────────────
    useEffect(() => {
        if (isLoading) return;
        const { stored, vault } = splitTokens(accounts);

        const writeLocal = (value: Account[]) => {
            if (value.length === 0) localStorage.removeItem(LS_KEY);
            else localStorage.setItem(LS_KEY, JSON.stringify(value));
        };

        // Lo ilegible sigue en el archivo: escribir ahora lo borraría
        if (vaultUnreadable.current) {
            writeLocal(accounts);
            return;
        }

        saveQueue.current = saveQueue.current.then(async () => {
            try {
                // Primero el archivo cifrado: los tokens no salen de localStorage hasta que estén a salvo
                await invoke('tokens_save', { tokens: vault });
                writeLocal(stored);
            } catch (err) {
                console.error('[UserContext] No se pudieron cifrar los tokens:', err);
                writeLocal(accounts);
            }
        });
    }, [accounts, isLoading]);

    function resetSetup() {
        localStorage.removeItem(LS_KEY);
        commitAccounts(() => []);
    }

    const activeAccount = accounts.find(a => a.isActual) ?? accounts[0] ?? null;

    const expireAccount = useCallback((account: Account) => {
        commitAccounts(prev => prev.filter(a => !(a.isOnline && a.uuid === account.uuid)));
        setExpiredUsernames([account.username ?? 'tu cuenta']);
    }, [commitAccounts]);

    const clearExpiredSession = useCallback(() => setExpiredUsernames([]), []);

    /** Si el almacén seguro falló al arrancar (p. ej. seguía bloqueado), vuelve a leerlo */
    const retryVault = useCallback(async () => {
        if (!vaultUnreadable.current) return;
        const vault = await invoke<TokenVault>('tokens_load');
        vaultUnreadable.current = false;
        commitAccounts(prev => mergeTokens(prev, vault));
    }, [commitAccounts]);

    const ensureActiveSession = useCallback(async (): Promise<Account> => {
        await startupRefresh.current;
        await retryVault().catch(() => { });

        const current = accountsRef.current;
        const account = current.find(a => a.isActual) ?? current[0];
        if (!account) throw new Error('No hay ninguna cuenta seleccionada');
        if (!account.isOnline) return account;

        // Al arrancar ya se refrescan los tokens, pero el launcher puede pasar
        // días abierto en la bandeja: se vuelve a comprobar antes de jugar
        const stillValid = account.accessToken
            && account.tokenExpiresAt
            && account.tokenExpiresAt - REFRESH_MARGIN_MS > Date.now();
        if (stillValid) return account;

        if (!account.refreshToken && vaultUnreadable.current) {
            throw new Error('No se pudo acceder al almacén seguro del sistema. Desbloquéalo e inténtalo de nuevo.');
        }

        const expiredError = new Error('La sesión de Microsoft ha caducado. Vuelve a iniciar sesión con tu cuenta.');
        if (!account.refreshToken) {
            expireAccount(account);
            throw expiredError;
        }

        let result: LoginCompleteResponse;
        try {
            result = await invoke<LoginCompleteResponse>('auth_refresh', {
                refreshToken: account.refreshToken,
            });
        } catch (err) {
            if (isSessionRejected(err)) {
                expireAccount(account);
                throw expiredError;
            }
            throw err;
        }
        const refreshed: Account = {
            ...accountFromLogin(result, account.isActual),
            // Si no llega skin nueva, conservar la anterior
            skinHeadBase64: result.skin_head_base64 ?? account.skinHeadBase64,
        };
        commitAccounts(prev => prev.map(a => a.uuid === refreshed.uuid ? { ...refreshed, isActual: a.isActual } : a));
        return refreshed;
    }, [commitAccounts, expireAccount, retryVault]);

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
