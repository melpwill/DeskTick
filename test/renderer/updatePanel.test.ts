// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { formatUpdateStatus, initUpdatePanel, renderUpdateStatus } from "@/renderer/updatePanel";
import { asApi, flush, loadBody, type MockApi, mockApi, updateStatus } from "@test/renderer/helpers";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const visibleButtons = (): string[] =>
  ["updateCheck", "updateInstall", "updateRestart", "updateSkip", "updateRelease"].filter((id) => !$(id).hidden);

const CHECKED = new Date(2026, 9, 15, 9, 5, 0).getTime();

let m: MockApi;

beforeEach(() => {
  document.body.innerHTML = loadBody("settings.html");
  m = mockApi();
});

describe("formatUpdateStatus", () => {
  it.each([
    [updateStatus(), "まだ確認していません"],
    [updateStatus({ state: "checking" }), "確認中..."],
    [updateStatus({ state: "latest", lastChecked: CHECKED }), "最新のバージョンです（9:05:00に確認）"],
    [updateStatus({ state: "latest" }), "最新のバージョンです"],
    [updateStatus({ state: "available", latestVersion: "1.3.0" }), "v1.3.0 があります"],
    [
      updateStatus({ state: "available", latestVersion: "1.3.0", error: "EBUSY" }),
      "v1.3.0 があります\n更新に失敗しました: EBUSY",
    ],
    [updateStatus({ state: "downloading", progress: 0.426 }), "ダウンロード中... 43%"],
    [updateStatus({ state: "downloading" }), "ダウンロード中... 0%"],
    [
      updateStatus({ state: "ready", latestVersion: "1.3.0" }),
      "v1.3.0 に更新しました。再起動すると新しいバージョンになります",
    ],
    [
      updateStatus({ state: "error", error: "offline", lastChecked: CHECKED }),
      "確認できませんでした: offline（9:05:00に確認）",
    ],
  ])("%#: 状態を文言にする", (s, text) => {
    expect(formatUpdateStatus(s)).toBe(text);
  });
});

describe("renderUpdateStatus", () => {
  it("状態に合わせてボタンを出し分ける", () => {
    renderUpdateStatus(updateStatus());
    expect($("updateCurrent").textContent).toBe("v1.2.3");
    expect(visibleButtons()).toEqual(["updateCheck", "updateRelease"]);
    expect($<HTMLButtonElement>("updateCheck").disabled).toBe(false);
    expect($("updateBlocked").hidden).toBe(true);

    renderUpdateStatus(updateStatus({ state: "available", latestVersion: "1.3.0" }));
    expect(visibleButtons()).toEqual(["updateCheck", "updateInstall", "updateSkip", "updateRelease"]);

    renderUpdateStatus(updateStatus({ state: "downloading" }));
    expect($<HTMLButtonElement>("updateCheck").disabled).toBe(true);

    renderUpdateStatus(updateStatus({ state: "ready", latestVersion: "1.3.0" }));
    expect(visibleButtons()).toEqual(["updateCheck", "updateRestart", "updateRelease"]);
    expect($<HTMLButtonElement>("updateCheck").disabled).toBe(true);
  });

  it("差し替えられない環境では更新ボタンを出さず、理由を示す", () => {
    renderUpdateStatus(updateStatus({ state: "available", latestVersion: "1.3.0", installBlocked: "書き込めません" }));
    expect(visibleButtons()).toEqual(["updateCheck", "updateSkip", "updateRelease"]);
    expect($("updateBlocked").hidden).toBe(false);
    expect($("updateBlocked").textContent).toBe("書き込めません");
  });
});

describe("initUpdatePanel", () => {
  it("現在の状態を表示し、状態の変化を反映する", async () => {
    await initUpdatePanel(asApi(m));
    expect($("updateState").textContent).toBe("まだ確認していません");
    expect($("updateState").style.whiteSpace).toBe("pre-line");
    m.cb.update!(updateStatus({ state: "checking" }));
    expect($("updateState").textContent).toBe("確認中...");
  });

  it("ボタンで確認・更新・再起動・スキップ・リリースページを呼ぶ", async () => {
    await initUpdatePanel(asApi(m));
    $("updateCheck").click();
    await flush();
    expect(m.api.checkUpdate).toHaveBeenCalled();
    expect($("updateState").textContent).toBe("最新のバージョンです");

    $("updateInstall").click();
    await flush();
    expect(m.api.installUpdate).toHaveBeenCalled();
    expect($("updateRestart").hidden).toBe(false);

    $("updateRestart").click();
    expect(m.api.restartToUpdate).toHaveBeenCalled();

    renderUpdateStatus(updateStatus({ state: "available", latestVersion: "1.3.0" }));
    $("updateSkip").click();
    expect(m.api.skipUpdate).toHaveBeenCalled();
    expect($("updateSkip").hidden).toBe(true);

    $("updateRelease").click();
    expect(m.api.openReleasePage).toHaveBeenCalled();
  });

  it("更新の方法とトーストの設定欄がある", () => {
    const mode = document.querySelector<HTMLSelectElement>('[data-key="update.mode"]')!;
    expect(Array.from(mode.options).map((o) => o.value)).toEqual(["auto", "notify", "off"]);
    expect(document.querySelector('[data-key="update.notify"]')).not.toBeNull();
    expect(document.querySelector('nav button[data-tab="update"]')!.textContent).toBe("更新");
  });
});
