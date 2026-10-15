// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClockSettings } from "@/shared/settings";
import { defaultSettings, flush, installApi, loadBody, type MockApi, mockApi, ntpStatus } from "@test/renderer/helpers";

let m: MockApi;

/**
 * @description - 設定画面のスクリプトを読み込み直す
 * @return {Promise<void>} - 初期化の完了
 */
const load = async (): Promise<void> => {
  vi.resetModules();
  await import("@/renderer/settings");
  await flush();
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const q = <T extends HTMLElement = HTMLInputElement>(key: string) => document.querySelector(`[data-key="${key}"]`) as T;
const navButton = (tab: string) => document.querySelector<HTMLButtonElement>(`nav button[data-tab="${tab}"]`)!;
const msg = (key: string) => document.querySelector(`[data-msg="${key}"]`)!.textContent;

/**
 * @description - 値を入力してイベントを発火する
 * @param {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} el - 入力欄
 * @param {string} value - 値
 * @param {string} ev - 発火するイベント名
 * @return {void} - なし
 */
const setValue = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string, ev: string): void => {
  el.value = value;
  el.dispatchEvent(new Event(ev));
};

/**
 * @description - 表示中のパネル名を返す
 * @return {string[]} - パネル名
 */
const activeTab = (): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-panel]"))
    .filter((p) => !p.hidden)
    .map((p) => p.dataset.panel!);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 10, 9, 8, 7, 0));
  history.replaceState(null, "", "/");
  document.body.innerHTML = loadBody("settings.html");
  m = mockApi();
  m.api.getSettings.mockResolvedValue({
    ...defaultSettings(),
    format: { line1: "YYYY-MM-DD", line2: "HH:mm:ss" },
  });
  installApi(m);
});

afterEach(() => {
  vi.useRealTimers();
  history.replaceState(null, "", "/");
});

describe("static content", () => {
  it("書式トークン表・タイムゾーン・ディスプレイ・情報・フォントを表示する", async () => {
    await load();
    const rows = document.querySelectorAll("table.tokens tr");
    expect(rows.length).toBe(13);
    expect(rows[0].querySelector("th code")!.textContent).toBe("YYYY");
    expect(rows[0].querySelector("td")!.textContent).toBe("年 (2026)");

    const tz = Array.from($("tzList").querySelectorAll("option")).map((o) => o.value);
    expect(tz).toContain("Asia/Tokyo");

    const opts = Array.from($<HTMLSelectElement>("display").options).map((o) => [o.value, o.textContent]);
    expect(opts).toEqual([
      ["-1", "メインディスプレイ"],
      ["0", "Display 1"],
      ["1", "Display 2"],
    ]);
    expect($<HTMLSelectElement>("display").value).toBe("-1");

    expect($("aboutName").textContent).toBe("DeskTick");
    expect($("aboutVersion").textContent).toBe("1.2.3");
    expect($("aboutElectron").textContent).toBe("44.0.0");
    expect($("aboutChrome").textContent).toBe("140.0");
    expect($("aboutNode").textContent).toBe("24.0.0");
    expect($("aboutExe").textContent).toBe("C:/DeskTick.exe");
    expect($("aboutSettings").textContent).toBe("C:/config.json");
    expect(Array.from($("licenses").querySelectorAll("th")).map((th) => th.textContent)).toEqual([
      "Electron",
      "lodash-es",
      "Chromium / Node.js",
    ]);

    expect(Array.from($("fontList").querySelectorAll("option")).map((o) => o.value)).toEqual(["Arial", "Meiryo"]);
    expect($<HTMLInputElement>("fontFamily").placeholder).toBe("");
    expect($("autoStartNote").style.whiteSpace).toBe("pre-line");
  });

  it("フォントが見つからなければ案内文を表示する", async () => {
    m.api.listFonts.mockResolvedValue([]);
    await load();
    expect($("fontList").children.length).toBe(0);
    expect($<HTMLInputElement>("fontFamily").placeholder).toBe("フォント一覧を取得できませんでした");
  });

  it("通知タブを描画し、設定の更新を渡す", async () => {
    await load();
    expect($("alertList").querySelectorAll(".alert-item").length).toBe(6);
    expect($("alertEditor").querySelector("h3")!.textContent).toBe("定時");

    const s = defaultSettings();
    s.alerts.teiji.name = "Quitting time";
    m.cb.settings!(s);
    expect($("alertEditor").querySelector("h3")!.textContent).toBe("Quitting time");
  });
});

describe("tabs", () => {
  it("既定ではプレビュー付きの表示タブを開く", async () => {
    await load();
    expect(activeTab()).toEqual(["display"]);
    expect(navButton("display").classList.contains("active")).toBe(true);
    expect(navButton("ntp").classList.contains("active")).toBe(false);
    expect($("previewWrap").hidden).toBe(false);
  });

  it("左のボタンでタブを切り替え、見た目以外のタブではプレビューを隠す", async () => {
    await load();
    navButton("ntp").click();
    expect(activeTab()).toEqual(["ntp"]);
    expect(navButton("ntp").classList.contains("active")).toBe(true);
    expect(navButton("display").classList.contains("active")).toBe(false);
    expect($("previewWrap").hidden).toBe(true);

    navButton("format").click();
    expect(activeTab()).toEqual(["format"]);
    expect($("previewWrap").hidden).toBe(false);
  });

  it("URLで指定されたタブを開く", async () => {
    history.replaceState(null, "", "/?tab=alerts");
    await load();
    expect(activeTab()).toEqual(["alerts"]);
    expect($("previewWrap").hidden).toBe(true);
  });

  it("不明なタブなら表示タブを開く", async () => {
    history.replaceState(null, "", "/?tab=nope");
    await load();
    expect(activeTab()).toEqual(["display"]);
  });

  it("onShowTabの要求に従ってタブを切り替える", async () => {
    await load();
    m.cb.tab!("about");
    expect(activeTab()).toEqual(["about"]);
    m.cb.tab!("bogus");
    expect(activeTab()).toEqual(["display"]);
  });
});

describe("fill", () => {
  it("すべての種類の入力欄に設定値を入れる", async () => {
    await load();
    expect(q("font.family").value).toBe("UDEV Gothic");
    expect(q<HTMLSelectElement>("font.weight").value).toBe("600");
    expect(q("font.line1Size").value).toBe("16");
    expect(q("foreground.color").value).toBe("#ffffff");
    expect(q("background.alpha").value).toBe("0.2");
    expect(q("shadow").checked).toBe(true);
    expect(q("locale").value).toBe("en-US");
    expect(q("timeZone").value).toBe("");
    expect(q<HTMLSelectElement>("position.corner").value).toBe("top-right");
    expect(q("ntp.server").value).toBe("ntp.nict.jp");
    expect(document.querySelector('[data-percent="foreground.alpha"]')!.textContent).toBe("100%");
    expect(document.querySelector('[data-percent="background.alpha"]')!.textContent).toBe("20%");
  });

  it("設定の更新で入力欄を埋め直し、入力中の欄はそのままにする", async () => {
    await load();
    const family = q("font.family");
    family.focus();
    family.value = "typing...";
    const s: ClockSettings = { ...defaultSettings(), padding: 7, font: { ...defaultSettings().font, family: "Other" } };
    m.cb.settings!(s);
    expect(family.value).toBe("typing...");
    expect(q("padding").value).toBe("7");

    // フォーカス中の数値欄も上書きしない
    const pad = q("padding");
    pad.focus();
    pad.value = "9";
    m.cb.settings!({ ...s, padding: 3 });
    expect(pad.value).toBe("9");

    // テキスト以外の部品はフォーカス中でも反映する
    const corner = q<HTMLSelectElement>("position.corner");
    corner.focus();
    m.cb.settings!({ ...s, position: { ...s.position, corner: "bottom-left" } });
    expect(corner.value).toBe("bottom-left");
    const shadow = q("shadow");
    shadow.focus();
    m.cb.settings!({ ...s, shadow: false });
    expect(shadow.checked).toBe(false);
  });

  it("検証エラーの表示を消し、存在しないキーも扱える", async () => {
    await load();
    const locale = q("locale");
    setValue(locale, "!!bad!!", "change");
    expect(locale.classList.contains("invalid")).toBe(true);

    const s = { ...defaultSettings(), ntp: undefined } as unknown as ClockSettings;
    m.cb.settings!(s);
    expect(locale.classList.contains("invalid")).toBe(false);
    expect(msg("locale")).toBe("");
    expect(q("ntp.server").value).toBe("");
    expect(q("ntp.enabled").checked).toBe(false);
  });

  it("設定の更新でプレビューを更新する", async () => {
    await load();
    expect($("pv2").textContent).toBe("09:08:07");
    m.cb.settings!({ ...defaultSettings(), format: { line1: "", line2: "HH:mm" } });
    expect($("pv1").hidden).toBe(true);
    expect($("pv2").textContent).toBe("09:08");
  });
});

describe("field binding", () => {
  it("チェックボックスの変更を送る", async () => {
    await load();
    const el = q("shadow");
    el.checked = false;
    el.dispatchEvent(new Event("change"));
    expect(m.api.updateSettings).toHaveBeenCalledWith({ shadow: false });
  });

  it("数値の選択欄は数値で、それ以外は文字列で送る", async () => {
    await load();
    setValue(q<HTMLSelectElement>("font.weight"), "700", "change");
    expect(m.api.updateSettings).toHaveBeenLastCalledWith({ font: { weight: 700 } });
    setValue(q<HTMLSelectElement>("position.display"), "1", "change");
    expect(m.api.updateSettings).toHaveBeenLastCalledWith({ position: { display: 1 } });
    setValue(q<HTMLSelectElement>("position.corner"), "bottom-left", "change");
    expect(m.api.updateSettings).toHaveBeenLastCalledWith({ position: { corner: "bottom-left" } });
  });

  it("数値入力を範囲内に収め、空の値は無視する", async () => {
    await load();
    const el = q("font.line1Size");
    setValue(el, "20", "input");
    expect(m.api.updateSettings).toHaveBeenLastCalledWith({ font: { line1Size: 20 } });
    setValue(el, "500", "input");
    expect(m.api.updateSettings).toHaveBeenLastCalledWith({ font: { line1Size: 200 } });
    setValue(el, "1", "input");
    expect(m.api.updateSettings).toHaveBeenLastCalledWith({ font: { line1Size: 6 } });
    m.api.updateSettings.mockClear();
    setValue(el, "", "input");
    expect(m.api.updateSettings).not.toHaveBeenCalled();
  });

  it("data-commit付きの数値入力は確定時に送る", async () => {
    await load();
    const el = q("ntp.intervalMin");
    setValue(el, "30", "input");
    expect(m.api.updateSettings).not.toHaveBeenCalled();
    el.dispatchEvent(new Event("change"));
    expect(m.api.updateSettings).toHaveBeenCalledWith({ ntp: { intervalMin: 30 } });
  });

  it("スライダーと色の値を送る", async () => {
    await load();
    setValue(q("foreground.alpha"), "0.5", "input");
    expect(m.api.updateSettings).toHaveBeenLastCalledWith({ foreground: { alpha: 0.5 } });
    setValue(q("background.color"), "#112233", "input");
    expect(m.api.updateSettings).toHaveBeenLastCalledWith({ background: { color: "#112233" } });
  });

  it("通常のテキストはそのまま、data-commit付きはトリムして送る", async () => {
    await load();
    setValue(q("format.line2"), " HH:mm ", "input");
    expect(m.api.updateSettings).toHaveBeenLastCalledWith({ format: { line2: " HH:mm " } });
    setValue(q("locale"), "  ja-JP  ", "change");
    expect(m.api.updateSettings).toHaveBeenLastCalledWith({ locale: "ja-JP" });
    expect(msg("locale")).toBe("");
    expect(q("locale").classList.contains("invalid")).toBe(false);
  });

  it.each([
    ["locale", "!!bad!!", "無効なロケールです (例: ja-JP, en-US)", "ja-JP"],
    ["timeZone", "Mars/Olympus", "無効なタイムゾーンです (例: Asia/Tokyo)", "Asia/Tokyo"],
    ["ntp.server", "   ", "サーバ名を入力してください", "pool.ntp.org"],
  ])("不正な%sは送らない", async (key, bad, error, good) => {
    await load();
    const el = q(key);
    setValue(el, bad, "change");
    expect(msg(key)).toBe(error);
    expect(el.classList.contains("invalid")).toBe(true);
    expect(m.api.updateSettings).not.toHaveBeenCalled();

    // 正しい値に直すとエラーが消える
    setValue(el, good, "change");
    expect(msg(key)).toBe("");
    expect(el.classList.contains("invalid")).toBe(false);
    expect(m.api.updateSettings).toHaveBeenCalledTimes(1);
  });
});

describe("NTP status", () => {
  it.each([
    ["disabled", { enabled: false }, "無効 (PCの時刻を表示)", true],
    ["syncing", { syncing: true }, "同期中...", true],
    ["error without previous sync", { error: "timeout" }, "同期失敗: timeout (PCの時刻を表示)", false],
    [
      "error with previous sync",
      { error: "timeout", lastSync: 1, offsetMs: 12.4 },
      "同期失敗: timeout (前回のずれ +12 ms を使用中)",
      false,
    ],
    [
      "success",
      { lastSync: new Date(2026, 9, 10, 9, 0, 0).getTime(), offsetMs: -250.6, rttMs: 8.2 },
      "9:00:00 に同期 / ずれ -251 ms / 往復 8 ms",
      false,
    ],
    ["never synced", {}, "-", false],
  ])("%sを表示する", async (_name, patch, text, disabled) => {
    await load();
    m.cb.ntp!(ntpStatus(patch));
    expect($("ntpStatus").textContent).toBe(text);
    expect($<HTMLButtonElement>("ntpSync").disabled).toBe(disabled);
  });

  it("往復時間がなければ表示しない", async () => {
    await load();
    m.cb.ntp!(ntpStatus({ lastSync: new Date(2026, 9, 10, 9, 0, 0).getTime(), rttMs: null }));
    expect($("ntpStatus").textContent).toBe("9:00:00 に同期 / ずれ +0 ms");
  });

  it("最初の状態を表示し、そのずれをプレビューに使う", async () => {
    m.api.getNtpStatus.mockResolvedValue(ntpStatus({ enabled: false, offsetMs: 3000 }));
    await load();
    expect($("ntpStatus").textContent).toBe("無効 (PCの時刻を表示)");
    await vi.advanceTimersByTimeAsync(1005);
    expect($("pv2").textContent).toBe("09:08:11");
  });

  it("ボタンのクリックで同期する", async () => {
    await load();
    $("ntpSync").click();
    expect(m.api.syncNtp).toHaveBeenCalledTimes(1);
  });
});

describe("buttons", () => {
  it("時計の移動・ディレクトリやライセンスを開く・ウィンドウを閉じる操作をする", async () => {
    const close = vi.spyOn(window, "close").mockImplementation(() => {});
    await load();
    $("moveToDefault").click();
    expect(m.api.moveToDefault).toHaveBeenCalledTimes(1);
    $("openFolder").click();
    expect(m.api.openSettingsFolder).toHaveBeenCalledTimes(1);
    $("openLicenses").click();
    expect(m.api.openLicenses).toHaveBeenCalledTimes(1);
    $("close").click();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("初期化をキャンセルしたら何もしない", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await load();
    $("reset").click();
    await flush();
    expect(confirm).toHaveBeenCalledWith("すべての設定を初期値に戻しますか?");
    expect(m.api.resetSettings).not.toHaveBeenCalled();
  });

  it("設定を初期化して入力欄を埋め直す", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await load();
    q("font.family").value = "changed";
    m.api.resetSettings.mockResolvedValue({ ...defaultSettings(), padding: 5 });
    $("reset").click();
    await flush();
    expect(m.api.resetSettings).toHaveBeenCalledTimes(1);
    expect(q("font.family").value).toBe("UDEV Gothic");
    expect(q("padding").value).toBe("5");
    expect($("preview").style.padding).toBe("5px");
  });
});

describe("auto start", () => {
  it("登録先のパスを表示し、オン/オフを切り替える", async () => {
    await load();
    const chk = $<HTMLInputElement>("autoStart");
    expect(chk.checked).toBe(false);
    expect(chk.disabled).toBe(false);
    expect($("autoStartNote").textContent).toContain("登録される実行ファイル: C:/DeskTick.exe");

    chk.checked = true;
    chk.dispatchEvent(new Event("change"));
    await flush();
    expect(m.api.setAutoStart).toHaveBeenCalledWith(true);
    expect(chk.checked).toBe(true);
  });

  it("非対応なら無効にする", async () => {
    m.api.getAutoStart.mockResolvedValue({ supported: false, enabled: false, path: "" });
    await load();
    expect($<HTMLInputElement>("autoStart").disabled).toBe(true);
    expect($("autoStartNote").textContent).toBe(
      "開発モード (npm start) では使えません。ビルドした exe から設定してください。",
    );
  });
});

describe("preview", () => {
  it("毎秒更新する", async () => {
    await load();
    expect($("preview").style.fontWeight).toBe("600");
    expect($("pv1").textContent).toBe("2026-10-10");
    expect($("pv2").textContent).toBe("09:08:07");
    await vi.advanceTimersByTimeAsync(1005);
    expect($("pv2").textContent).toBe("09:08:08");
    await vi.advanceTimersByTimeAsync(1000);
    expect($("pv2").textContent).toBe("09:08:09");
  });
});
