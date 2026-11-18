# DeskTickの開発

## 必要なもの

- Windows（exeのビルドと動作確認）
- Node.js 26（.node-versionで固定）
- pnpm 11（package.jsonのpackageManagerで固定。corepackで自動的に使われます）

## セットアップ

Node.js 25以降にはcorepackが同梱されていないため、初回に入れておきます。

```sh
npm install -g corepack   # 初回のみ
corepack enable   # 初回のみ
pnpm install
```

## コマンド

| コマンド                        | 内容                                                              |
| ------------------------------- | ----------------------------------------------------------------- |
| pnpm start                      | ビルドして開発起動（プロジェクト直下のconfig.jsonを使用）         |
| pnpm dist                       | exeをビルドし、release/DeskTick/にDeskTick.exeとconfig.jsonを出力 |
| pnpm check                      | 下の4つをまとめて実行                                             |
| pnpm lint                       | ESLint                                                            |
| pnpm format / pnpm format:check | Prettierで整形/整形済みか確認                                     |
| pnpm typecheck                  | TypeScriptの型チェック                                            |
| pnpm test / pnpm test:coverage  | Vitest/カバレッジ付き（100%未満で失敗）                           |

pnpm startに`-- --settings`を付けると、起動時に設定画面が開きます。  
`--settings=alerts`のようにタブも指定できます。

VS Codeの統合ターミナルでは環境変数ELECTRON_RUN_AS_NODE=1が設定されているため、Electronが起動しません。  
外部のターミナルを使うか、この変数を外して実行してください。

## 構成

```text
src/
  main.ts                 メインプロセスの組み立て（ウィンドウ・トレイ・メニュー・IPC の配線のみ）
  preload.ts              画面側に公開する API（window.api）
  main/                   メインプロセスの部品
    store.ts              config.json の読み書きと変更監視
    ntp.ts                SNTP クライアントと定期同期
    alertScheduler.ts     毎秒の時刻チェックと通知の発火
    notifier.ts           トースト通知（ショートカット・AppUserModelId の登録）
    toastXml.ts           トースト通知の XML 生成
    alertDialogs.ts       ダイアログ通知のウィンドウ管理（右下への積み重ね）
    alertPause.ts         通知の一時停止と自動再開
    fonts.ts              インストール済みフォントの一覧取得
    placement.ts          ウィンドウの配置計算（基準の角・余白・リサイズ・積み重ね）
    displays.ts           ディスプレイ一覧の表示用ラベル
    appInfo.ts            バージョン情報・自動起動の情報
    paths.ts              exe と config.json の場所の解決
    cli.ts                起動オプション（--settings）の解析
    settingsChanges.ts    設定変更の差分判定
    updater.ts            更新の確認・ダウンロード・差し替えの流れと定期確認
    githubRelease.ts      GitHub APIのリリース情報の解析と接続先の許可リスト
    http.ts               許可したホストだけをたどるHTTPS GET（転送・大きさ・時間の制限）
    updateManifest.ts     署名付きマニフェストの検証（Ed25519・SHA-256）
    updateKeys.ts         署名を検証する公開鍵
    updateFiles.ts        exeの書き込み・差し替え・後片付け
  renderer/               画面側
    clock.ts              時計ウィンドウ
    alertDialog.ts        ダイアログ通知の画面
    settings.ts           設定画面の組み立て
    settingsFields.ts     data-key 属性による入力欄と設定の対応付け
    settingsValidation.ts 入力値の検証
    tabs.ts               タブの切り替え
    preview.ts            表示タブのプレビュー
    ntpStatus.ts          時刻同期の状態表示
    updatePanel.ts        「更新」タブ
    about.ts              情報タブ
    autoStart.ts          自動起動の設定
    choices.ts            フォント・ディスプレイの選択肢
    tokens.ts             書式トークンの一覧表
    alertsPanel.ts        「通知」タブの組み立て
    alertList.ts          アラート一覧
    alertEditor.ts        アラートの編集欄
    alertScheduleRows.ts  スケジュール欄（一定間隔・指定時刻・曜日・繰り返し）
    alertDraft.ts         編集中アラートの不変な更新
    alertLogic.ts         「通知」タブの純粋なロジック
    dom.ts                DOM 生成の小さなヘルパー
    timing.ts             次の秒境界までの待ち時間
    api.ts                window.api の型
  shared/                 メイン・画面の両方で使う処理
    settings.ts           設定の型・初期値
    alerts.ts             アラートの型・初期値・通知判定・要約表示
    format.ts             日時の書式処理
    clockView.ts          時計の見た目（時計ウィンドウとプレビューで共用）
    merge.ts              設定のマージ
    configVersion.ts      config.jsonの版と、古い版からの変換
    version.ts            バージョン番号の解析と比較
    types.ts              共通の型定義
static/                   HTML とアイコン
test/                     Vitest のテスト（main / renderer / shared）
scripts/build.mts         esbuild によるバンドル
scripts/package.mts       配布用ディレクトリの作成
scripts/keygen.mts        更新の署名に使う鍵ペアの作成
scripts/sign-release.mts  更新用マニフェストの作成と署名（CIで実行）
```

## config.jsonの形を変えるとき

キーの追加だけなら、何もしなくても既定値で補われます。  
キーの名前・場所・型・意味を変えるときは、src/shared/configVersion.tsのCONFIG_VERSIONを1つ上げ、MIGRATIONSに古い形からの変換を足してください。

## リリース

[RELEASING.md](RELEASING.md)を参照してください。
