import type { LoginCompleteResponse } from './setup';

export interface Account {
    isOnline: boolean;
    username?: string;
    uuid?: string;
    accessToken?: string;
    refreshToken?: string;
    /** Momento (epoch ms) en que caduca el accessToken de Minecraft */
    expiresAt?: number;
    /** Cabeza de la skin como data URL */
    skinHead?: string;
    isActual: boolean;
}

export function accountFromLogin(result: LoginCompleteResponse, isActual = true): Account {
    return {
        isOnline: true,
        username: result.username,
        uuid: result.uuid,
        accessToken: result.access_token,
        refreshToken: result.refresh_token ?? undefined,
        expiresAt: Date.now() + result.expires_in * 1000,
        skinHead: result.skin_head_base64 ?? undefined,
        isActual,
    };
}

/** Identificador estable de una cuenta (uuid online o nombre offline) */
export function accountKey(a: Account): string {
    return a.isOnline ? `ms:${a.uuid}` : `offline:${a.username}`;
}

/** Devuelve el mensaje de error, o null si el nombre es válido */
export function validateOfflineUsername(name: string): string | null {
    if (name.length < 3 || name.length > 16) return 'El nombre debe tener entre 3 y 16 caracteres';
    if (!/^[a-zA-Z0-9_]+$/.test(name)) return 'Solo letras, números y guiones bajos';
    return null;
}

/** Añade (o reemplaza si ya existe) una cuenta y la marca como activa */
export function withActiveAccount(accounts: Account[], account: Account): Account[] {
    const key = accountKey(account);
    return [
        ...accounts.filter(a => accountKey(a) !== key).map(a => ({ ...a, isActual: false })),
        { ...account, isActual: true },
    ];
}
