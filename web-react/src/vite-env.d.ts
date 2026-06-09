/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALLOW_PUBLIC_REGISTER: string;
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
