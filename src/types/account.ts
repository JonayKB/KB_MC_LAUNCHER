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
