export interface Account {
    isOnline: boolean;
    username?: string;
    uuid?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: number;
    isActual: boolean;
    skinHeadBase64?: string;
}