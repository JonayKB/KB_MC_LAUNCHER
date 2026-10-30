import type { LoginCompleteResponse } from './setup';

export interface Account {
    isOnline: boolean;
    username?: string;
    uuid?: string;
    accessToken?: string;
    refreshToken?: string;
    /** Momento (epoch ms) en que caduca el accessToken de Minecraft */
    tokenExpiresAt?: number;
    isActual: boolean;
    /** Cabeza de la skin como data URL */
    skinHeadBase64?: string;
    /** Versión del guardado de la sesión; sin ella viene de la 1.0.x (caducidad mal calculada) */
    authVersion?: number;
}

export const AUTH_VERSION = 2;

/** Error de auth_microsoft cuando el propio usuario cancela (ver microsoft.rs) */
export const LOGIN_CANCELLED = 'LOGIN_CANCELLED';

export function isLoginCancelled(err: unknown): boolean {
    return String(err).includes(LOGIN_CANCELLED);
}

/** Tokens de una cuenta en el archivo cifrado (ver secrets.rs) */
export interface AccountTokens {
    accessToken?: string;
    refreshToken?: string;
}

export type TokenVault = Record<string, AccountTokens>;

/** Separa lo que va al archivo cifrado de lo que puede quedarse en localStorage */
export function splitTokens(accounts: Account[]): { stored: Account[]; vault: TokenVault } {
    const vault: TokenVault = {};
    const stored = accounts.map(account => {
        if (!account.isOnline || !account.uuid) return account;
        const { accessToken, refreshToken, ...rest } = account;
        vault[account.uuid] = { accessToken, refreshToken };
        return rest;
    });
    return { stored, vault };
}

/** Lo que aún esté en localStorage (versiones anteriores) tiene prioridad: es lo más reciente */
export function mergeTokens(accounts: Account[], vault: TokenVault): Account[] {
    return accounts.map(account => {
        const saved = account.uuid ? vault[account.uuid] : undefined;
        if (!account.isOnline || !saved) return account;
        return {
            ...account,
            accessToken: account.accessToken ?? saved.accessToken,
            refreshToken: account.refreshToken ?? saved.refreshToken,
        };
    });
}

export function accountFromLogin(result: LoginCompleteResponse, isActual = true): Account {
    return {
        isOnline: true,
        username: result.username,
        uuid: result.uuid,
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        tokenExpiresAt: Date.now() + result.expires_in * 1000,
        skinHeadBase64: result.skin_head_base64 ?? undefined,
        isActual,
        authVersion: AUTH_VERSION,
    };
}

/**
 * Si el error de auth_refresh significa que Microsoft ya no acepta la sesión
 * (hay que volver a iniciar sesión) y no un fallo de red puntual.
 */
export function isSessionRejected(err: unknown): boolean {
    const msg = String(err);
    return msg.includes('Error renovando token MS') || msg.includes('invalid_grant') || msg.includes('interaction_required');
}

/** Añade o sustituye la cuenta (misma uuid, o mismo nombre si es offline) y la deja como activa */
export function upsertAccount(accounts: Account[], account: Account): Account[] {
    const same = (a: Account) => account.isOnline
        ? a.isOnline && a.uuid === account.uuid
        : !a.isOnline && a.username?.toLowerCase() === account.username?.toLowerCase();
    return [...accounts.filter(a => !same(a)).map(a => ({ ...a, isActual: false })), { ...account, isActual: true }];
}

/** Devuelve el mensaje de error, o null si el nombre es válido */
export function validateOfflineUsername(name: string): string | null {
    if (name.length < 3 || name.length > 16) return 'El nombre debe tener entre 3 y 16 caracteres';
    if (!/^[a-zA-Z0-9_]+$/.test(name)) return 'Solo letras, números y guiones bajos';
    return null;
}
