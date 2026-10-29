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
