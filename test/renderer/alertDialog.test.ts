// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flush, installApi, installFonts, loadBody, type MockApi, mockApi } from "@test/renderer/helpers";

let m: MockApi;

/**
 * @description - 指定のクエリで通知ダイアログのスクリプトを読み込み直す
 * @param {Record<string, string>} query - クエリ
 * @return {Promise<void>} - 初期化の完了
 */
const load = async (query: Record<string, string>): Promise<void> => {
  window.history.replaceState(null, "", `?${new URLSearchParams(query).toString()}`);
  vi.resetModules();
  await import("@/renderer/alertDialog");
  await flush();
};

const $ = (id: string) => document.getElementById(id)!;

beforeEach(() => {
  document.body.innerHTML = loadBody("alert.html");
  document.documentElement.style.removeProperty("--accent");
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width: 340, height: 120.4 }) as DOMRect,
  );
  installFonts();
  m = mockApi();
  installApi(m);
});

describe("alert dialog", () => {
  it("クエリの内容を表示し、色を適用して大きさを報告する", async () => {
    await load({ app: "DeskTick", title: "<b>定時</b>", body: "おつかれさま", color: "#123abc" });
    expect($("app").textContent).toBe("DeskTick");
    expect($("title").textContent).toBe("<b>定時</b>");
    expect($("title").children.length).toBe(0);
    expect($("body").textContent).toBe("おつかれさま");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#123abc");
    expect(m.api.reportAlertDialogSize).toHaveBeenCalledTimes(2);
    expect(m.api.reportAlertDialogSize).toHaveBeenCalledWith(340, 120.4);
  });

  it("クエリがなければ空欄と既定の色で表示する", async () => {
    await load({});
    expect($("title").textContent).toBe("");
    expect($("app").textContent).toBe("");
    expect($("body").textContent).toBe("");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#2f7de1");
  });

  it("OKで閉じる", async () => {
    const close = vi.spyOn(window, "close").mockImplementation(() => {});
    await load({ title: "t" });
    expect(close).not.toHaveBeenCalled();
    $("ok").click();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
