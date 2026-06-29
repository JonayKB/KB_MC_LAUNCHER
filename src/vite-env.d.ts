/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL: string;
    readonly debug: boolean;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}