/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILD_TIME__: string;

declare const __XYZEN_BUILD_MODE__: string;
declare const __XYZEN_IFRAME_BUILD__: boolean;

interface ImportMetaEnv {
  readonly VITE_XYZEN_BACKEND_URL?: string;
  readonly VITE_XYZEN_LAYOUT_STYLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
