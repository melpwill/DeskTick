import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * @description - 更新の署名に使うEd25519の鍵ペアを作り、秘密鍵をファイルに書き出して公開鍵を表示する
 * @param {string | undefined} out - 秘密鍵の書き出し先
 * @return {void} - なし
 */
const main = (out: string | undefined): void => {
  if (!out) {
    console.error("使い方: node scripts/keygen.mts <秘密鍵の書き出し先 (リポジトリの外)>");
    process.exit(1);
  }
  const { publicKey, privateKey }: { publicKey: KeyObject; privateKey: KeyObject } = generateKeyPairSync("ed25519");
  const pem: string = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  writeFileSync(resolve(out), pem, { flag: "wx", mode: 0o600 });
  const spki: string = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  console.log(`秘密鍵: ${resolve(out)}`);
  console.log(
    "  → GitHubのEnvironment「release」のシークレット UPDATE_SIGNING_KEY に、ファイルの中身をそのまま登録する",
  );
  console.log("  → オフラインの安全な場所にバックアップしたら、このファイルは削除する");
  console.log(`公開鍵: ${spki}`);
  console.log("  → src/main/updateKeys.ts の UPDATE_PUBLIC_KEYS に追加する");
};

main(process.argv[2]);
