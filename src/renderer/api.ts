import type { Api } from "@/preload";

declare global {
  interface Window {
    api: Api;
  }
}

/**
 * @description - preloadが公開したAPIを取得する
 * @return {Api} - メインプロセスとの通信API
 */
export const getApi = (): Api => window.api;
