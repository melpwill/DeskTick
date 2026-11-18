import { execFileSync } from "child_process";
import { generateKeyPairSync } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MANIFEST_NAME, parseManifest, sha256Hex, SIGNATURE_NAME, verifySignature } from "@/main/updateManifest";

const SCRIPT = path.join(__dirname, "../../scripts/sign-release.mts");
const EXE = Buffer.from("fake DeskTick.exe");

let dir: string;
let out: string;

const keyPair = (): { pub: string; pem: string } => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    pub: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    pem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
};

const run = (env: Record<string, string>): string =>
  execFileSync(process.execPath, [SCRIPT, out], {
    cwd: dir,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: "pipe",
  });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "desktick-sign-"));
  out = path.join(dir, "release");
  fs.mkdirSync(out);
  fs.mkdirSync(path.join(dir, "src/main"), { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ version: "2.0.0" }));
  fs.writeFileSync(path.join(out, "DeskTick.exe"), EXE);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * @description - アプリに埋め込む公開鍵のファイルを置く
 * @param {string[]} keys - 公開鍵
 * @return {void} - なし
 */
const writeKeys = (keys: string[]): void => {
  fs.writeFileSync(
    path.join(dir, "src/main/updateKeys.ts"),
    `export const UPDATE_PUBLIC_KEYS: readonly string[] = [${keys.map((k) => `"${k}"`).join(", ")}];\n`,
  );
};

describe("scripts/sign-release.mts", () => {
  it("アプリの検証コードが受け入れるマニフェストと署名を書き出す", () => {
    const old = keyPair();
    const cur = keyPair();
    writeKeys([old.pub, cur.pub]);
    run({ UPDATE_SIGNING_KEY: cur.pem });
    const manifest = fs.readFileSync(path.join(out, MANIFEST_NAME));
    const sig = fs.readFileSync(path.join(out, SIGNATURE_NAME));
    expect(verifySignature(manifest, sig, [cur.pub])).toBe(true);
    expect(parseManifest(manifest, "DeskTick")).toEqual({
      product: "DeskTick",
      version: "2.0.0",
      file: "DeskTick.exe",
      size: EXE.length,
      sha256: sha256Hex(EXE),
    });
  });

  it("埋め込んだ公開鍵と組にならない秘密鍵では書き出さない", () => {
    writeKeys([keyPair().pub]);
    expect(() => run({ UPDATE_SIGNING_KEY: keyPair().pem })).toThrow();
    expect(fs.existsSync(path.join(out, MANIFEST_NAME))).toBe(false);
  });

  it("秘密鍵がなければ失敗する", () => {
    writeKeys([keyPair().pub]);
    expect(() => run({ UPDATE_SIGNING_KEY: "" })).toThrow();
  });
});
