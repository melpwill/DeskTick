import { memoize, orderBy, padStart } from "lodash-es";

type DateTimeFormatFactory = (locale: string | undefined, opts: Intl.DateTimeFormatOptions) => Intl.DateTimeFormat;

/**
 * @description - Intl.DateTimeFormatを生成する
 * @param {string | undefined} locale - ロケール
 * @param {Intl.DateTimeFormatOptions} opts - 書式オプション
 * @return {Intl.DateTimeFormat} - フォーマッタ
 */
const dtf: DateTimeFormatFactory = memoize(
  (locale: string | undefined, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
    new Intl.DateTimeFormat(locale, opts),
  (locale: string | undefined, opts: Intl.DateTimeFormatOptions): string => `${locale ?? ""}|${JSON.stringify(opts)}`,
);

/**
 * @description - 指定の引数でIntl.DateTimeFormatを生成できるか判定する
 * @param {string} locale - ロケール
 * @param {Intl.DateTimeFormatOptions} opts - 書式オプション
 * @return {boolean} - 生成できればtrue
 */
const canCreateFormat = (locale: string, opts: Intl.DateTimeFormatOptions): boolean => {
  try {
    new Intl.DateTimeFormat(locale, opts);
    return true;
  } catch {
    return false;
  }
};

/**
 * @description - ロケール文字列が有効かを判定する
 * @param {string} locale - ロケール
 * @return {boolean} - 有効ならtrue
 */
export const isValidLocale = (locale: string): boolean => !locale || canCreateFormat(locale, {});

/**
 * @description - タイムゾーン文字列が有効かを判定する
 * @param {string} tz - IANAタイムゾーン名
 * @return {boolean} - 有効ならtrue
 */
export const isValidTimeZone = (tz: string): boolean => !tz || canCreateFormat("en-US", { timeZone: tz });

/**
 * @description - 数値を指定桁数までゼロ埋めした文字列にする
 * @param {number} n - 数値
 * @param {number} length - 桁数
 * @return {string} - ゼロ埋めした文字列
 */
export const padNumber = (n: number, length: number = 2): string => padStart(String(n), length, "0");

type Parts = Readonly<{
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}>;
const ZONED_PARTS_OPTIONS: Readonly<Intl.DateTimeFormatOptions> = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
};

/**
 * @description - システムのタイムゾーンで日時の各要素を取り出す
 * @param {Date} d - 日時
 * @return {Parts} - 日時の各要素
 */
const localParts = (d: Date): Parts => ({
  year: d.getFullYear(),
  month: d.getMonth() + 1,
  day: d.getDate(),
  hour: d.getHours(),
  minute: d.getMinutes(),
  second: d.getSeconds(),
});

/**
 * @description - 指定タイムゾーンで日時の各要素を取り出す
 * @param {Date} d - 日時
 * @param {string} timeZone - IANAタイムゾーン名
 * @return {Parts} - 日時の各要素
 */
const zonedParts = (d: Date, timeZone: string): Parts => {
  const raw: Readonly<Record<string, string>> = Object.fromEntries(
    dtf("en-US", { ...ZONED_PARTS_OPTIONS, timeZone })
      .formatToParts(d)
      .map((x: Intl.DateTimeFormatPart): [string, string] => [x.type, x.value]),
  );
  return {
    year: Number(raw.year),
    month: Number(raw.month),
    day: Number(raw.day),
    hour: Number(raw.hour) % 24,
    minute: Number(raw.minute),
    second: Number(raw.second),
  };
};

/**
 * @description - タイムゾーン指定の有無に応じて日時の各要素を取り出す
 * @param {Date} d - 日時
 * @param {string | undefined} tz - タイムゾーン
 * @return {Parts} - 日時の各要素
 */
const getParts = (d: Date, tz: string | undefined): Parts => (tz ? zonedParts(d, tz) : localParts(d));

type TokenCtx = Readonly<{
  p: Parts;
  name: (opts: Intl.DateTimeFormatOptions) => string;
  dayPeriod: () => string;
}>;
type TokenFormatter = (c: TokenCtx) => string;
/**
 * @description - 24時間制の時を12時間制に変換する
 * @param {number} hour - 時(0〜23)
 * @return {number} - 12時間制の時
 */
const to12Hour = (hour: number): number => hour % 12 || 12;

/**
 * @description - 短い曜日名を得る
 * @param {TokenCtx} ctx - トークン展開用の情報
 * @return {string} - 短い曜日名
 */
const shortWeekday = ({ name }: TokenCtx): string => name({ weekday: "short" });

const TOKENS: Readonly<Record<string, TokenFormatter>> = {
  YYYY: ({ p }: TokenCtx): string => padNumber(p.year, 4),
  YY: ({ p }: TokenCtx): string => padNumber(p.year % 100),
  MMMM: ({ name }: TokenCtx): string => name({ month: "long" }),
  MMM: ({ name }: TokenCtx): string => name({ month: "short" }),
  MM: ({ p }: TokenCtx): string => padNumber(p.month),
  M: ({ p }: TokenCtx): string => String(p.month),
  DD: ({ p }: TokenCtx): string => padNumber(p.day),
  D: ({ p }: TokenCtx): string => String(p.day),
  dddd: ({ name }: TokenCtx): string => name({ weekday: "long" }),
  ddd: shortWeekday,
  week: shortWeekday,
  HH: ({ p }: TokenCtx): string => padNumber(p.hour),
  H: ({ p }: TokenCtx): string => String(p.hour),
  hh: ({ p }: TokenCtx): string => padNumber(to12Hour(p.hour)),
  h: ({ p }: TokenCtx): string => String(to12Hour(p.hour)),
  mm: ({ p }: TokenCtx): string => padNumber(p.minute),
  m: ({ p }: TokenCtx): string => String(p.minute),
  ss: ({ p }: TokenCtx): string => padNumber(p.second),
  s: ({ p }: TokenCtx): string => String(p.second),
  A: ({ dayPeriod }: TokenCtx): string => dayPeriod(),
};

const TOKEN_RE: RegExp = new RegExp(
  `${String.raw`\[([^\]]*)\]`}|${orderBy(Object.keys(TOKENS), [(k: string): number => k.length], ["desc"]).join("|")}`,
  "g",
);

/**
 * @description - 書式パターンに従って日時を文字列にする
 * @param {Date} d - 日時
 * @param {string} pattern - 書式パターン
 * @param {string} locale - ロケール
 * @param {string} timeZone - タイムゾーン
 * @return {string} - 整形済みの文字列
 */
export const formatClock = (d: Date, pattern: string, locale: string, timeZone: string): string => {
  const loc: string | undefined = locale && isValidLocale(locale) ? locale : undefined;
  const tz: string | undefined = timeZone && isValidTimeZone(timeZone) ? timeZone : undefined;
  const p: Parts = getParts(d, tz);

  /**
   * @description - ロケールに応じた名称を得る
   * @param {Intl.DateTimeFormatOptions} opts - 書式オプション
   * @return {string} - 名称
   */
  const name = (opts: Intl.DateTimeFormatOptions): string => dtf(loc, { ...opts, timeZone: tz }).format(d);

  /**
   * @description - ロケールに応じた午前/午後の表記を得る
   * @return {string} - 午前/午後の表記
   */
  const dayPeriod = (): string =>
    dtf(loc, { hour: "numeric", hour12: true, timeZone: tz })
      .formatToParts(d)
      .find((x: Intl.DateTimeFormatPart): boolean => x.type === "dayPeriod")?.value ?? (p.hour < 12 ? "AM" : "PM");

  return pattern.replace(TOKEN_RE, (tok: string, literal?: string): string =>
    literal !== undefined ? literal : TOKENS[tok]({ p, name, dayPeriod }),
  );
};
