import { afterEach, describe, expect, it, vi } from "vitest";
import { formatClock, isValidLocale, isValidTimeZone, padNumber } from "@/shared/format";

const d: Date = new Date(2026, 9, 10, 21, 5, 7); // ローカル時刻 2026-10-10 (土) 21:05:07
const morning: Date = new Date(2026, 0, 2, 0, 3, 4); // ローカル時刻 2026-01-02 (金) 00:03:04

afterEach(() => vi.restoreAllMocks());

describe("validation", () => {
  it("空と正しいロケールは受け付け、不正なものは拒否する", () => {
    expect(isValidLocale("")).toBe(true);
    expect(isValidLocale("ja-JP")).toBe(true);
    expect(isValidLocale("xx-!!")).toBe(false);
  });

  it("空と正しいタイムゾーンは受け付け、不正なものは拒否する", () => {
    expect(isValidTimeZone("")).toBe(true);
    expect(isValidTimeZone("Asia/Tokyo")).toBe(true);
    expect(isValidTimeZone("Foo/Bar")).toBe(false);
  });
});

describe("padNumber", () => {
  it("既定では2桁、指定があればその桁数でゼロ埋めする", () => {
    expect(padNumber(5)).toBe("05");
    expect(padNumber(123)).toBe("123");
    expect(padNumber(26, 4)).toBe("0026");
  });
});

describe("formatClock", () => {
  it("数値のトークンを書式どおりにする", () => {
    expect(formatClock(d, "YYYY YY MM M DD D HH H hh h mm m ss s", "en-US", "")).toBe(
      "2026 26 10 10 10 10 21 21 09 9 05 5 07 7",
    );
    expect(formatClock(morning, "HH H hh h", "en-US", "")).toBe("00 0 12 12");
  });

  it("名前をロケールの言語で表示する", () => {
    expect(formatClock(d, "MMMM MMM dddd ddd week A", "en-US", "")).toBe("October Oct Saturday Sat Sat PM");
    expect(formatClock(d, "dddd (week) A", "ja-JP", "")).toBe("土曜日 (土) 午後");
  });

  it("[ ]で囲んだ文字はそのまま表示する", () => {
    expect(formatClock(d, "[Today is] dddd []", "en-US", "")).toBe("Today is Saturday ");
  });

  it("不正ならシステムのロケールとタイムゾーンを使う", () => {
    expect(formatClock(d, "YYYY-MM-DD HH:mm", "xx-!!", "Foo/Bar")).toBe("2026-10-10 21:05");
    expect(formatClock(d, "HH:mm", "", "")).toBe("21:05");
    expect(formatClock(d, "MMMM", "", "")).toBe(new Intl.DateTimeFormat(undefined, { month: "long" }).format(d));
  });

  it("指定したタイムゾーンに変換する", () => {
    const utc = new Date(Date.UTC(2026, 9, 10, 23, 30, 15));
    expect(formatClock(utc, "YYYY-MM-DD HH:mm:ss week", "en-US", "Asia/Tokyo")).toBe("2026-10-11 08:30:15 Sun");
    expect(formatClock(utc, "HH:mm", "en-US", "UTC")).toBe("23:30");
  });

  it("ロケールに午前/午後がなければAM/PMを使う", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockReturnValue([]);
    expect(formatClock(morning, "A", "ja-JP", "")).toBe("AM");
    expect(formatClock(d, "A", "ja-JP", "")).toBe("PM");
  });
});
