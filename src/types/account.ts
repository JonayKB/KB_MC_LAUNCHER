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
    };
}

/** Devuelve el mensaje de error, o null si el nombre es válido */
export function validateOfflineUsername(name: string): string | null {
    if (name.length < 3 || name.length > 16) return 'El nombre debe tener entre 3 y 16 caracteres';
    if (!/^[a-zA-Z0-9_]+$/.test(name)) return 'Solo letras, números y guiones bajos';
    return null;
}
