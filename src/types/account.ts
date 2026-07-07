export interface Account {
    isOnline: boolean;
    username?: string;
    uuid?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    isActual: boolean;
}