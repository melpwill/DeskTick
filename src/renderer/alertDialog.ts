import type { Api } from "@/preload";
import { getApi } from "@/renderer/api";
import { byId } from "@/renderer/dom";
import { safeColor } from "@/shared/alerts";

const api: Api = getApi();
const params: URLSearchParams = new URLSearchParams(location.search);
const card: HTMLElement = byId("card");

/**
 * @description - ダイアログを閉じる
 * @return {void} - なし
 */
const close = (): void => window.close();

byId("app").textContent = params.get("app") ?? "";
byId("title").textContent = params.get("title") ?? "";
byId("body").textContent = params.get("body") ?? "";
document.documentElement.style.setProperty("--accent", safeColor(params.get("color") ?? ""));
byId("ok").addEventListener("click", close);

/**
 * @description - カードの大きさをメインプロセスへ報告する
 * @return {void} - なし
 */
const report = (): void => {
  const r: DOMRect = card.getBoundingClientRect();
  api.reportAlertDialogSize(r.width, r.height);
};

report();
void document.fonts.ready.then(report);
