import { createHash, createPrivateKey, createPublicKey, type KeyObject, sign, verify } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PRODUCT: string = "DeskTick";
const EXE_NAME: string = "DeskTick.exe";
const MANIFEST_NAME: string = "DeskTick-update.json";
const SIGNATURE_NAME: string = `${MANIFEST_NAME}.sig`;
const KEYS_FILE: string = "src/main/updateKeys.ts";

/**
 * @description - アプリに埋め込んだ公開鍵を読み込む
 * @return {KeyObject[]} - Ed25519の公開鍵
 */
const loadPublicKeys = (): KeyObject[] =>
  Array.from(readFileSync(KEYS_FILE, "utf8").matchAll(/"([A-Za-z0-9+/]+={0,2})"/g), (m: RegExpMatchArray) =>
    createPublicKey({ key: Buffer.from(m[1], "base64"), format: "der", type: "spki" }),
  );

/**
 * @description - 環境変数の秘密鍵を読み込む
 * @return {KeyObject} - Ed25519の秘密鍵
 */
const loadPrivateKey = (): KeyObject => {
  const pem: string | undefined = process.env.UPDATE_SIGNING_KEY;
  if (!pem) throw new Error("UPDATE_SIGNING_KEY が設定されていません");
  const key: KeyObject = createPrivateKey(pem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("UPDATE_SIGNING_KEY がEd25519の秘密鍵ではありません");
  return key;
};

/**
 * @description - exeのマニフェストを作って署名し、アプリに埋め込んだ公開鍵で検証できることを確かめる
 * @param {string} dir - exeがあり、マニフェストと署名を書き出すディレクトリ
 * @return {void} - なし
 */
const main = (dir: string): void => {
  const version: string = JSON.parse(readFileSync("package.json", "utf8")).version;
  const exe: Buffer = readFileSync(join(dir, EXE_NAME));
  const manifest: Buffer = Buffer.from(
    `${JSON.stringify(
      {
        product: PRODUCT,
        version,
        file: EXE_NAME,
        size: exe.length,
        sha256: createHash("sha256").update(exe).digest("hex"),
      },
      null,
      2,
    )}\n`,
  );
  const sig: Buffer = sign(null, manifest, loadPrivateKey());
  if (!loadPublicKeys().some((k: KeyObject) => verify(null, manifest, k, sig))) {
    throw new Error(`${KEYS_FILE} の公開鍵で署名を検証できません（鍵の組み合わせを確認してください）`);
  }
  writeFileSync(join(dir, MANIFEST_NAME), manifest);
  writeFileSync(join(dir, SIGNATURE_NAME), `${sig.toString("base64")}\n`);
  console.log(`Signed: ${join(dir, MANIFEST_NAME)} (v${version})`);
};

main(process.argv[2] ?? "release/DeskTick");
