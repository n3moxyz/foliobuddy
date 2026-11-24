/// <reference types="vite/client" />

declare const __BUILD_SHA__: string;
declare const __CLERK_JS_URL__: string;

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
