import { describe, expect, it } from "vitest";
import { displayLabel, type DisplayLike, toDisplayInfos } from "@/main/displays";

const main: DisplayLike = { id: 10, label: "DELL U2720Q", size: { width: 2560, height: 1440 } };
const sub: DisplayLike = { id: 20, label: "", size: { width: 1920, height: 1080 } };

describe("displayLabel", () => {
  it("メインディスプレイに印を付ける", () => {
    expect(displayLabel(main, 0, 10)).toBe("1: DELL U2720Q (2560x1440) [メイン]");
  });

  it("ラベルが空なら汎用の名前を使う", () => {
    expect(displayLabel(sub, 1, 10)).toBe("2: ディスプレイ (1920x1080)");
  });
});

describe("toDisplayInfos", () => {
  it("ディスプレイに順番に番号を付ける", () => {
    expect(toDisplayInfos([sub, main], 10)).toEqual([
      { index: 0, label: "1: ディスプレイ (1920x1080)" },
      { index: 1, label: "2: DELL U2720Q (2560x1440) [メイン]" },
    ]);
  });

  it("ディスプレイがなければ[]を返す", () => {
    expect(toDisplayInfos([], 10)).toEqual([]);
  });
});
