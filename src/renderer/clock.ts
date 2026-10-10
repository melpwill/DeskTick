import { isEqual } from "lodash-es";
import type { Api } from "@/preload";
import { getApi } from "@/renderer/api";
import { byId } from "@/renderer/dom";
import { msToNextSecond } from "@/renderer/timing";
import { applyClockStyle, type ClockElements, renderClockText } from "@/shared/clockView";
import { type ClockSettings } from "@/shared/settings";

interface Size {
  width: number;
  height: number;
}

const MIN_DELAY_MS: number = 10;

const api: Api = getApi();
const el: ClockElements = { box: byId("box"), line1: byId("line1"), line2: byId("line2") };

let settings: ClockSettings;
let offsetMs: number = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastSize: Size = { width: 0, height: 0 };

/**
 * @description - NTP補正済みの現在時刻を返す
 * @return {number} - 現在時刻
 */
const now = (): number => Date.now() + offsetMs;

/**
 * @description - 要素の表示サイズを切り上げた整数で測る
 * @param {HTMLElement} box - 測定する要素
 * @return {Size} - 表示サイズ
 */
const measure = (box: HTMLElement): Size => {
  const r: DOMRect = box.getBoundingClientRect();
  return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
};

/**
 * @description - 時刻を描画し、サイズが変わったときだけメインプロセスへ通知する
 * @return {void} - なし
 */
const render = (): void => {
  renderClockText(el, settings, new Date(now()));
  const size: Size = measure(el.box);
  if (isEqual(size, lastSize)) return;
  lastSize = size;
  api.reportSize(size.width, size.height);
};

/**
 * @description - 描画して、次の秒の境界の直後に再実行を予約する
 * @return {void} - なし
 */
const tick = (): void => {
  render();
  clearTimeout(timer);
  timer = setTimeout(tick, Math.max(msToNextSecond(now()), MIN_DELAY_MS));
};

/**
 * @description - 設定を反映して描画し、フォント読み込み後にもう一度描画する
 * @param {ClockSettings} s - 新しい設定
 * @return {void} - なし
 */
const applySettings = (s: ClockSettings): void => {
  settings = s;
  applyClockStyle(el, s);
  render();
  void document.fonts.ready.then(render);
};

/**
 * @description - NTPのずれが変わったときだけ補正して描画し直す
 * @param {number} nextOffsetMs - 新しいオフセット
 * @return {void} - なし
 */
const applyOffset = (nextOffsetMs: number): void => {
  if (nextOffsetMs === offsetMs) return;
  offsetMs = nextOffsetMs;
  tick();
};

/**
 * @description - 時計ウィンドウを初期化する
 * @return {Promise<void>} - 初期化の完了
 */
const init = async (): Promise<void> => {
  settings = await api.getSettings();
  offsetMs = (await api.getNtpStatus()).offsetMs;
  applyClockStyle(el, settings);

  api.onSettings(applySettings);
  api.onNtpStatus((s) => applyOffset(s.offsetMs));

  await document.fonts.ready;
  tick();
};

void init();
