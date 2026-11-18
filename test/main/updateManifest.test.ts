import { generateKeyPairSync, type KeyObject, sign } from "crypto";
import { describe, expect, it } from "vitest";
import { UPDATE_PUBLIC_KEYS } from "@/main/updateKeys";
import {
  MANIFEST_NAME,
  MAX_EXE_BYTES,
  parseManifest,
  sha256Hex,
  SIGNATURE_NAME,
  verifySignature,
} from "@/main/updateManifest";

const pair = (): { pub: string; priv: KeyObject } => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { pub: publicKey.export({ format: "der", type: "spki" }).toString("base64"), priv: privateKey };
};

const sigFile = (data: Buffer, priv: KeyObject): Buffer =>
  Buffer.from(`${sign(null, data, priv).toString("base64")}\n`);

const manifest = (patch: Record<string, unknown> = {}): Buffer =>
  Buffer.from(
    JSON.stringify({
      product: "DeskTick",
      version: "1.2.0",
      file: "DeskTick.exe",
      size: 100,
      sha256: "a".repeat(64),
      ...patch,
    }),
  );

describe("constants", () => {
  it("署名ファイルの名前はマニフェストの名前に.sigを付けたもの", () => {
    expect(SIGNATURE_NAME).toBe(`${MANIFEST_NAME}.sig`);
  });

  it("Ed25519の公開鍵を1つ以上埋め込んでいる", () => {
    expect(UPDATE_PUBLIC_KEYS.length).toBeGreaterThan(0);
    const data = Buffer.from("x");
    expect(verifySignature(data, Buffer.from(`${"A".repeat(86)}==`), UPDATE_PUBLIC_KEYS)).toBe(false);
  });
});

describe("sha256Hex", () => {
  it("SHA-256を小文字の16進数で返す", () => {
    expect(sha256Hex(Buffer.from("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("verifySignature", () => {
  it("信頼する鍵のいずれかで署名を検証できればtrue", () => {
    const a = pair();
    const b = pair();
    const data = manifest();
    expect(verifySignature(data, sigFile(data, b.priv), [a.pub, b.pub])).toBe(true);
  });

  it("内容の改ざん・別の鍵の署名・壊れた署名はfalse", () => {
    const a = pair();
    const other = pair();
    const data = manifest();
    const sig = sigFile(data, a.priv);
    expect(verifySignature(manifest({ version: "9.9.9" }), sig, [a.pub])).toBe(false);
    expect(verifySignature(data, sigFile(data, other.priv), [a.pub])).toBe(false);
    expect(verifySignature(data, Buffer.from("not base64!"), [a.pub])).toBe(false);
    expect(verifySignature(data, Buffer.from(Buffer.alloc(32).toString("base64")), [a.pub])).toBe(false);
    expect(verifySignature(data, sig, [])).toBe(false);
  });

  it("Ed25519でない鍵や壊れた鍵は使わない", () => {
    const a = pair();
    const data = manifest();
    const rsa = generateKeyPairSync("rsa", { modulusLength: 1024 })
      .publicKey.export({ format: "der", type: "spki" })
      .toString("base64");
    expect(verifySignature(data, sigFile(data, a.priv), [rsa, "broken"])).toBe(false);
  });
});

describe("parseManifest", () => {
  it("正しいマニフェストを読み取る", () => {
    expect(parseManifest(manifest(), "DeskTick")).toEqual({
      product: "DeskTick",
      version: "1.2.0",
      file: "DeskTick.exe",
      size: 100,
      sha256: "a".repeat(64),
    });
  });

  it("不正な項目があれば読まない", () => {
    for (const patch of [
      { product: "Other" },
      { version: "v1.2.0" },
      { version: "1.2" },
      { version: 1 },
      { file: "../DeskTick.exe" },
      { file: "DeskTick.bat" },
      { file: 3 },
      { size: 0 },
      { size: MAX_EXE_BYTES + 1 },
      { size: "100" },
      { sha256: "A".repeat(64) },
      { sha256: "a".repeat(63) },
      { sha256: null },
    ]) {
      expect(parseManifest(manifest(patch), "DeskTick")).toBeNull();
    }
  });

  it("JSONでない・オブジェクトでなければ読まない", () => {
    expect(parseManifest(Buffer.from("{"), "DeskTick")).toBeNull();
    expect(parseManifest(Buffer.from("[]"), "DeskTick")).toBeNull();
  });
});
