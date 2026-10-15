import { isObjectLike, sample } from "lodash-es";
import { padNumber } from "@/shared/format";
import { mergeSettings, type Obj } from "@/shared/merge";

export interface AlertSchedule {
  interval: { enabled: boolean; minutes: number; from: string; to: string };
  times: { enabled: boolean; list: string[] };
  days: number[];
  once: string;
}

export type AlertMode = "toast" | "dialog";

export interface AlertDef {
  id: string;
  name: string;
  enabled: boolean;
  mode: AlertMode;
  color: string;
  title: string;
  messages: string[];
  emojis: string[];
  schedule: AlertSchedule;
}

type FixedAlertIds = readonly ["teiji", "stand", "water", "breakfast", "lunch", "dinner"];
export const FIXED_ALERT_IDS: FixedAlertIds = ["teiji", "stand", "water", "breakfast", "lunch", "dinner"] as const;
export type FixedAlertId = FixedAlertIds[number];
export type AlertsSettings = Record<FixedAlertId, AlertDef> & { custom: AlertDef[] };

export const DEFAULT_ALERT_COLOR: string = "#2f7de1";
const MEAL_COLOR: string = "#e0912f";

const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];
const EVERY_DAY: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

/**
 * @description - 既定値に部分指定を重ねてスケジュールを作る
 * @param {Partial<AlertSchedule>} s - 上書きする項目
 * @return {AlertSchedule} - スケジュール
 */
const schedule = (s: Partial<AlertSchedule>): AlertSchedule => ({
  interval: { enabled: false, minutes: 60, from: "09:00", to: "18:00" },
  times: { enabled: false, list: [] },
  days: [...WEEKDAYS],
  once: "",
  ...s,
});

/**
 * @description - 食事アラートを作る
 * @param {FixedAlertId} id - アラート ID
 * @param {string} name - 表示名
 * @param {string} time - 発火時刻
 * @param {boolean} enabled - 初期状態で有効か
 * @param {string[]} emojis - 絵文字の候補
 * @return {AlertDef} - アラート定義
 */
const meal = (id: FixedAlertId, name: string, time: string, enabled: boolean, emojis: string[]): AlertDef => ({
  id,
  name,
  enabled,
  mode: "toast",
  color: MEAL_COLOR,
  title: `${name}の時間です {emoji}`,
  messages: ["手を止めて、しっかり食べましょう。", "休憩も仕事のうち。ゆっくり味わって。"],
  emojis,
  schedule: schedule({ times: { enabled: true, list: [time] }, days: [...EVERY_DAY] }),
});

export const DEFAULT_ALERTS: AlertsSettings = {
  teiji: {
    id: "teiji",
    name: "定時",
    enabled: true,
    mode: "toast",
    color: "#7a5cd6",
    title: "定時になりました {emoji}",
    messages: [
      "定時です。お疲れ様！",
      "区切りをつけて、ゆっくりしよう。",
      "明日の自分へひとこと残そう！",
      "深呼吸してクールダウン。おつかれさま！",
    ],
    emojis: ["🌇", "🛀", "✨", "🍵", "😌"],
    schedule: schedule({ times: { enabled: true, list: ["18:00"] } }),
  },
  stand: {
    id: "stand",
    name: "起立",
    enabled: true,
    mode: "toast",
    color: "#2e9e5b",
    title: "立ち上がりましょう {emoji}",
    messages: [
      "座りっぱなしは30分まで。少し立って体を動かしましょう。",
      "1〜2分歩いたり、軽くストレッチしましょう。",
      "立ち上がって肩と腰を伸ばしましょう。",
    ],
    emojis: ["🧍", "🚶", "🤸"],
    schedule: schedule({ interval: { enabled: true, minutes: 30, from: "09:45", to: "17:00" } }),
  },
  water: {
    id: "water",
    name: "水分補給",
    enabled: true,
    mode: "toast",
    color: "#1f9bd1",
    title: "水分補給の時間です {emoji}",
    messages: ["コップ1杯 (約200ml) の水を飲みましょう。", "のどが渇く前に、ひと口どうぞ。"],
    emojis: ["💧", "🥤", "🍵"],
    schedule: schedule({ interval: { enabled: true, minutes: 60, from: "09:30", to: "18:00" } }),
  },
  breakfast: meal("breakfast", "朝食", "07:30", false, ["🍞", "🍙", "☕"]),
  lunch: meal("lunch", "昼食", "12:00", true, ["🍱", "🍜", "🍛"]),
  dinner: meal("dinner", "夕食", "19:00", false, ["🍽️", "🍲", "🍣"]),
  custom: [],
};

/**
 * @description - 新しいカスタムアラートを既定値で作る
 * @param {string} id - アラートID
 * @return {AlertDef} - アラート定義
 */
export const newCustomAlert = (id: string): AlertDef => ({
  id,
  name: "カスタム",
  enabled: true,
  mode: "toast",
  color: DEFAULT_ALERT_COLOR,
  title: "お知らせ {emoji}",
  messages: ["時間になりました。"],
  emojis: ["🔔"],
  schedule: schedule({ times: { enabled: true, list: ["09:00"] } }),
});

/**
 * @description - null以外のオブジェクトかを判定する
 * @param {unknown} v - 判定する値
 * @return {boolean} - null以外のオブジェクトならtrue
 */
const isObjectEntry = (v: unknown): v is Obj => isObjectLike(v);

/**
 * @description - 使用済みのIDと重ならないよう、末尾に"_"を足していく
 * @param {string} id - 候補のID
 * @param {ReadonlySet<string>} taken - 使用済みのID
 * @return {string} - 重複しないID
 */
const uniqueId = (id: string, taken: ReadonlySet<string>): string => (taken.has(id) ? uniqueId(`${id}_`, taken) : id);

/**
 * @description - カスタムアラートのID候補を決める
 * @param {Readonly<Obj>} c - 設定ファイル由来のカスタムアラート
 * @param {number} index - 有効な要素の中での位置
 * @return {string} - IDの候補
 */
const candidateId = (c: Readonly<Obj>, index: number): string =>
  typeof c.id === "string" && c.id ? c.id : `custom-${index}`;

/**
 * @description - 設定ファイルから読んだカスタムアラートを正規化する
 * @param {AlertsSettings} a - アラート設定
 * @return {AlertsSettings} - 正規化した新しいアラート設定
 */
export const normalizeAlerts = (a: AlertsSettings): AlertsSettings => {
  const entries: readonly Obj[] = (Array.isArray(a.custom) ? (a.custom as unknown[]) : []).filter(isObjectEntry);
  const custom: AlertDef[] = entries.reduce<AlertDef[]>((acc: AlertDef[], c: Readonly<Obj>, i: number): AlertDef[] => {
    const id: string = uniqueId(candidateId(c, i), new Set(acc.map((x: AlertDef): string => x.id)));
    return [...acc, mergeSettings(newCustomAlert(id), { ...c, id })];
  }, []);
  return { ...a, custom };
};

/**
 * @description - 固定アラート・カスタムアラートを1つの配列にまとめる
 * @param {AlertsSettings} a - アラート設定
 * @return {AlertDef[]} - 全アラート
 */
export const allAlerts = (a: AlertsSettings): AlertDef[] => [
  ...FIXED_ALERT_IDS.map((id: FixedAlertId): AlertDef => a[id]),
  ...a.custom,
];

/**
 * @description - "HH:mm"を0時からの経過分に変換する
 * @param {string} s - 時刻文字列
 * @return {number | null} - 経過分。不正な形式・範囲外ならnull
 */
export const parseHHMM = (s: string): number | null => {
  const m: RegExpExecArray | null = /^(\d{1,2}):(\d{2})$/.exec(s);
  const h: number = Number(m?.[1]);
  const min: number = Number(m?.[2]);
  return m && h < 24 && min < 60 ? h * 60 + min : null;
};

/**
 * @description - 日付をローカル時刻の"YYYY-MM-DD"にする
 * @param {Date} d - 日時
 * @return {string} - "YYYY-MM-DD"
 */
export const localDate = (d: Date): string =>
  `${d.getFullYear()}-${padNumber(d.getMonth() + 1)}-${padNumber(d.getDate())}`;

/**
 * @description - 指定日がスケジュールの対象日か
 * @param {Readonly<AlertSchedule>} s - スケジュール
 * @param {Date} now - 判定する日時
 * @return {boolean} - 対象日ならtrue
 */
const isScheduledDay = (s: Readonly<AlertSchedule>, now: Date): boolean =>
  s.once ? s.once === localDate(now) : s.days.includes(now.getDay());

/**
 * @description - 絶対モードの時刻のいずれかに一致するか
 * @param {Readonly<AlertSchedule["times"]>} times - 絶対モードの設定
 * @param {number} minute - 0時からの経過分
 * @return {boolean} - 一致すればtrue
 */
const matchesTimes = (times: Readonly<AlertSchedule["times"]>, minute: number): boolean =>
  times.enabled && times.list.some((t: string): boolean => parseHHMM(t) === minute);

/**
 * @description - 相対モードの発火タイミングか
 * @param {Readonly<AlertSchedule["interval"]>} iv - 相対モードの設定
 * @param {number} minute - 0時からの経過分
 * @return {boolean} - 発火タイミングならtrue
 */
const matchesInterval = (iv: Readonly<AlertSchedule["interval"]>, minute: number): boolean => {
  const from: number | null = parseHHMM(iv.from);
  const to: number | null = parseHHMM(iv.to);
  return (
    iv.enabled &&
    iv.minutes >= 1 &&
    from !== null &&
    to !== null &&
    minute > from &&
    minute <= to &&
    (minute - from) % Math.round(iv.minutes) === 0
  );
};

/**
 * @description - nowを含む1分間にアラートを発火すべきか
 * @param {AlertDef} a - アラート定義
 * @param {Date} now - 現在日時
 * @return {boolean} - 発火すべきならtrue
 */
export const isDue = (a: AlertDef, now: Date): boolean => {
  const minute: number = now.getHours() * 60 + now.getMinutes();
  return (
    a.enabled &&
    isScheduledDay(a.schedule, now) &&
    (matchesTimes(a.schedule.times, minute) || matchesInterval(a.schedule.interval, minute))
  );
};

/**
 * @description - 空白のみ・文字列以外の要素を除く
 * @param {readonly unknown[]} xs - 候補
 * @return {string[]} - 空でない文字列だけの配列
 */
const nonBlankStrings = (xs: readonly unknown[]): string[] =>
  xs.filter((x: unknown): x is string => typeof x === "string" && x.trim() !== "");

/**
 * @description - タイトルとランダムに選んだ本文を返す
 * @param {AlertDef} a - アラート定義
 * @param {string} fallbackTitle - タイトルも表示名も空のときに使うタイトル
 * @return {{ title: string; body: string }} - 通知のタイトルと本文
 */
export const alertText = (a: AlertDef, fallbackTitle: string): { title: string; body: string } => {
  const emoji: string = sample(nonBlankStrings(a.emojis)) ?? "";

  /**
   * @description - {emoji}を置換し、前後の空白を除く
   * @param {string} s - 元の文字列
   * @return {string} - 置換後の文字列
   */
  const fill = (s: string): string => s.replaceAll("{emoji}", emoji).trim();

  return { title: fill(a.title) || a.name || fallbackTitle, body: fill(sample(nonBlankStrings(a.messages)) ?? "") };
};

/**
 * @description - ダイアログで通知するアラートか
 * @param {AlertDef} a - アラート定義
 * @return {boolean} - ダイアログで通知するならtrue
 */
export const isDialogAlert = (a: AlertDef): boolean => a.mode === "dialog";

/**
 * @description - "#rrggbb"形式の色ならそのまま、そうでなければ既定の色を返す
 * @param {string} color - 色文字列
 * @return {string} - "#rrggbb"形式の色
 */
export const safeColor = (color: string): string => (/^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_ALERT_COLOR);

/**
 * @description - 分数を"1時間30分"のような表記にする
 * @param {number} min - 分数
 * @return {string} - 表記
 */
export const formatDuration = (min: number): string => {
  const h: number = Math.floor(min / 60);
  const m: number = min % 60;
  return [h ? `${h}時間` : "", m ? `${m}分` : ""].join("") || "0分";
};

const DAY_NAMES: readonly string[] = ["日", "月", "火", "水", "木", "金", "土"];
const DISPLAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

/**
 * @description - 曜日の集合が毎日か
 * @param {ReadonlySet<number>} set - 曜日の集合
 * @return {boolean} - 毎日ならtrue
 */
const isEveryDay = (set: ReadonlySet<number>): boolean => set.size === EVERY_DAY.length;

/**
 * @description - 曜日の集合が空か
 * @param {ReadonlySet<number>} set - 曜日の集合
 * @return {boolean} - 空ならtrue
 */
const isNoDay = (set: ReadonlySet<number>): boolean => set.size === 0;

/**
 * @description - 曜日の集合がちょうど平日か
 * @param {ReadonlySet<number>} set - 曜日の集合
 * @return {boolean} - 平日ならtrue
 */
const isWeekdays = (set: ReadonlySet<number>): boolean =>
  set.size === WEEKDAYS.length && WEEKDAYS.every((d: number): boolean => set.has(d));

/**
 * @description - 曜日の集合がちょうど土日か
 * @param {ReadonlySet<number>} set - 曜日の集合
 * @return {boolean} - 土日ならtrue
 */
const isWeekend = (set: ReadonlySet<number>): boolean => set.size === 2 && set.has(0) && set.has(6);

type NamedDaySet = readonly [label: string, test: (set: ReadonlySet<number>) => boolean];

const NAMED_DAY_SETS: readonly NamedDaySet[] = [
  ["毎日", isEveryDay],
  ["曜日なし", isNoDay],
  ["平日", isWeekdays],
  ["土日", isWeekend],
];

/**
 * @description - 曜日の組み合わせを"平日"や"月・水・金"のような表記にする
 * @param {number[]} days - 曜日番号の配列
 * @return {string} - 表記
 */
export const describeDays = (days: number[]): string => {
  const set: ReadonlySet<number> = new Set(days);
  return (
    NAMED_DAY_SETS.find(([, test]: NamedDaySet): boolean => test(set))?.[0] ??
    DISPLAY_ORDER.filter((d: number): boolean => set.has(d))
      .map((d: number): string => DAY_NAMES[d])
      .join("・")
  );
};

/**
 * @description - スケジュールの発火条件を表記の配列にする
 * @param {Readonly<AlertSchedule>} s - スケジュール
 * @return {string[]} - 有効なモードごとの表記
 */
const describeTriggers = (s: Readonly<AlertSchedule>): string[] => [
  ...(s.interval.enabled ? [`${formatDuration(s.interval.minutes)}ごと (${s.interval.from}〜${s.interval.to})`] : []),
  ...(s.times.enabled && s.times.list.length > 0 ? [s.times.list.join(", ")] : []),
];

/**
 * @description - アラートのスケジュールを1行の要約にする
 * @param {AlertDef} a - アラート定義
 * @return {string} - 要約
 */
export const describeSchedule = (a: AlertDef): string => {
  const s: AlertSchedule = a.schedule;
  const triggers: string[] = describeTriggers(s);
  return triggers.length === 0
    ? "スケジュールなし"
    : `${triggers.join(" + ")} / ${s.once ? `${s.once} のみ` : describeDays(s.days)}`;
};
