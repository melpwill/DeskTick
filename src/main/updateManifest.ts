import { createHash, createPublicKey, type KeyObject, verify } from "crypto";
import { isObj } from "@/shared/merge";
import { parseVersion } from "@/shared/version";

export const MANIFEST_NAME: string = "DeskTick-update.json";
export const SIGNATURE_NAME: string = `${MANIFEST_NAME}.sig`;
export const MAX_MANIFEST_BYTES: number = 4 * 1024;
export const MAX_SIGNATURE_BYTES: number = 1024;
export const MAX_EXE_BYTES: number = 512 * 1024 * 1024;

const ED25519_SIGNATURE_BYTES: number = 64;
const SHA256_RE: RegExp = /^[0-9a-f]{64}$/;
const EXE_NAME_RE: RegExp = /^[\w.-]+\.exe$/;

/** 署名の対象になる、リリースの内容の宣言 */
export interface UpdateManifest {
  readonly product: string;
  readonly version: string;
  readonly file: string;
  readonly size: number;
  readonly sha256: string;
}

/**
 * @description - データのSHA-256を16進数で返す
 * @param {Uint8Array} data - データ
 * @return {string} - 小文字の16進数
 */
export const sha256Hex = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

/**
 * @description - base64のSPKI(DER)からEd25519の公開鍵を作る
 * @param {string} spki - base64の公開鍵
 * @return {KeyObject | null} - 公開鍵。Ed25519の鍵でなければnull
 */
const toPublicKey = (spki: string): KeyObject | null => {
  try {
    const key: KeyObject = createPublicKey({ key: Buffer.from(spki, "base64"), format: "der", type: "spki" });
    return key.asymmetricKeyType === "ed25519" ? key : null;
  } catch {
    return null;
  }
};

/**
 * @description - マニフェストのEd25519署名を、埋め込んだ公開鍵のいずれかで検証する
 * @param {Uint8Array} data - マニフェストのバイト列
 * @param {Uint8Array} signatureFile - 署名ファイルの中身（base64）
 * @param {readonly string[]} publicKeys - 信頼する公開鍵（base64のSPKI）
 * @return {boolean} - いずれかの鍵で検証できればtrue
 */
export const verifySignature = (
  data: Uint8Array,
  signatureFile: Uint8Array,
  publicKeys: readonly string[],
): boolean => {
  const text: string = Buffer.from(signatureFile).toString("utf8").trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return false;
  const sig: Buffer = Buffer.from(text, "base64");
  if (sig.length !== ED25519_SIGNATURE_BYTES) return false;
  return publicKeys.some((k: string): boolean => {
    const key: KeyObject | null = toPublicKey(k);
    return key !== null && verify(null, data, key, sig);
  });
};

/**
 * @description - 署名を検証したマニフェストを解釈する
 * @param {Uint8Array} data - マニフェストのバイト列
 * @param {string} product - 製品名
 * @return {UpdateManifest | null} - マニフェスト。形式が不正ならnull
 */
export const parseManifest = (data: Uint8Array, product: string): UpdateManifest | null => {
  let m: unknown;
  try {
    m = JSON.parse(Buffer.from(data).toString("utf8"));
  } catch {
    return null;
  }
  if (!isObj(m) || m.product !== product) return null;
  const { version, file, size, sha256 } = m;
  if (typeof version !== "string" || !parseVersion(version) || version.startsWith("v")) return null;
  if (typeof file !== "string" || !EXE_NAME_RE.test(file)) return null;
  if (!Number.isSafeInteger(size) || (size as number) <= 0 || (size as number) > MAX_EXE_BYTES) return null;
  if (typeof sha256 !== "string" || !SHA256_RE.test(sha256)) return null;
  return { product, version, file, size: size as number, sha256 };
};
