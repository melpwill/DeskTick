# DeskTickのリリース

## 手順

1. package.jsonのバージョンを上げてコミットする
2. 同じバージョンのタグ（例：v1.1.0）を作ってpushする

タグをpushすると、CI（`.github/workflows/ci.yml`）が次の順に実行します。

| ジョブ        | 内容                                                                                    |
| ------------- | --------------------------------------------------------------------------------------- |
| check / test  | lint・整形・型チェック・テスト                                                          |
| build-windows | タグとpackage.jsonのバージョンが一致するか確かめ、exeをビルドする                       |
| sign          | 更新用のマニフェスト（DeskTick-update.json）を作って署名する                            |
| release       | GitHubのリリースを作り、DeskTick.exe・config.json・DeskTick-update.json・.sigを添付する |

アプリの更新機能は、DeskTick-update.jsonの署名を確かめてからDeskTick.exeをダウンロードします。  
署名がないリリースは、アプリからは更新できません。

## 署名の鍵

署名の秘密鍵は、GitHubのEnvironment「release」のシークレットUPDATE_SIGNING_KEYに置きます。  
秘密鍵を扱うジョブ（sign）では、依存パッケージを入れずにNode.jsの標準機能だけで署名します（scripts/sign-release.mts）。
アプリに埋め込んだ公開鍵（src/main/updateKeys.ts）で検証できない場合、リリースは作られません。

Environment「release」には、デプロイできるタグをv*に限定する、承認者を付けるなどの保護を設定する。

## 鍵を作り直すとき

古い鍵で署名を確かめるバージョンを使っている人も更新できるように、公開鍵は1つずつ入れ替えます。

1. node scripts/keygen.mts <リポジトリの外のパス> で鍵ペアを作る
2. 新しい公開鍵をUPDATE_PUBLIC_KEYSに追加したバージョンを、古い秘密鍵で署名してリリースする
3. シークレットを新しい秘密鍵に替え、次のリリースで古い公開鍵を外す
