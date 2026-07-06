export interface LoginStartResponse {
    user_code: string;
    verification_uri: string;
    device_code: string;
    interval: number;
    expires_in: number;
}

export interface LoginCompleteResponse {
    uuid: string;
    username: string;
    access_token: string;
    skin_head_base64?: string;
}