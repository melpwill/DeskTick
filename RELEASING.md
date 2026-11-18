# DeskTickのリリース

## 手順

1. package.jsonのバージョンを上げてコミットする
2. 同じバージョンのタグ（例：v1.1.0）を作ってpushする
3. CIが作ったプレリリースのexeをダウンロードし、起動して動作を確かめる
4. 正式なリリースにする（`gh release edit v1.1.0 --prerelease=false --latest`）

タグをpushすると、CI（`.github/workflows/ci.yml`）が次の順に実行します。

| ジョブ        | 内容                                                                                    |
| ------------- | --------------------------------------------------------------------------------------- |
| check / test  | lint・整形・型チェック・テスト                                                          |
| build-windows | タグとpackage.jsonのバージョンが一致するか確かめ、exeをビルドする                       |
| sign          | 更新用のマニフェスト（DeskTick-update.json）を作って署名する                            |
| release       | GitHubのリリースを作り、DeskTick.exe・config.json・DeskTick-update.json・.sigを添付する |

アプリの更新機能は、DeskTick-update.jsonの署名を確かめてからDeskTick.exeをダウンロードします。  
署名がないリリースは、アプリからは更新できません。

CIはプレリリースとして作ります。  
アプリは最新の正式なリリース（GitHub APIの`releases/latest`）だけを見るので、正式にするまでは利用者に更新が届きません。

## 更新の処理を変えたとき

更新の処理（src/main/updater.ts、src/main/updateFiles.tsなど）を変えたときは、変えたバージョンから次のバージョンへ実際に更新できるかを確かめてから出します。  
プレリリースはアプリから見えないため、中身が同じでバージョンだけ違うものを2つ作って確かめます（例：v1.2.1とv1.2.2）。

1. v1.2.1とv1.2.2を、上の手順1・2でプレリリースとして作る
2. 普段使いのDeskTickを終了し、別のフォルダーにv1.2.1のDeskTick.exeとconfig.jsonを置いて起動する
3. v1.2.2を正式なリリースにする（この時点から、利用者にもv1.2.2が届く）
4. 「再起動して更新」で、新しいバージョンが起動し、DeskTick.exe.oldが1分後に消えることを確かめる
5. exeをv1.2.1に戻し、「更新する」→「あとで」→ トレイの「終了」で、終了後にexeが差し替わることを確かめる
6. うまくいけば、v1.2.1を削除する（`gh release delete v1.2.1 --cleanup-tag`）

失敗したら、すぐにv1.2.2をプレリリースに戻します（`gh release edit v1.2.2 --prerelease`）。  
`gh release view --json tagName`で、それより前のバージョンが最新に戻ったことを確かめてください（戻っていなければ`gh release edit <前のタグ> --latest`）。

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
