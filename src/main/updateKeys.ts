/**
 * 更新ファイルの署名を検証する、信頼するEd25519の公開鍵（base64のSPKI）
 * 鍵を入れ替えるときは、新しい鍵を足したバージョンを出してから古い鍵を外す
 * 鍵ペアは node scripts/keygen.mts <秘密鍵の書き出し先> で作る
 */
export const UPDATE_PUBLIC_KEYS: readonly string[] = ["MCowBQYDK2VwAyEAlF6fH0+4P+Z7Y39/z1sOZUvoXbL3sXTG2Dwq5rLdXkc="];
