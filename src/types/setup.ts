export interface LoginCompleteResponse {
    uuid: string;
    username: string;
    access_token: string;
    skin_head_base64: string | null;
    refresh_token: string | null;
    /** Segundos de validez del access_token */
    expires_in: number;
}
