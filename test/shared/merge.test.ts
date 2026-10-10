import { describe, expect, it } from "vitest";
import { isObj, mergeSettings } from "@/shared/merge";

describe("isObj", () => {
  it("プレーンオブジェクトだけを受け付ける", () => {
    expect(isObj({})).toBe(true);
    expect(isObj([])).toBe(false);
    expect(isObj(null)).toBe(false);
    expect(isObj("x")).toBe(false);
  });
});

describe("mergeSettings", () => {
  const base: {
    n: number;
    s: string;
    b: boolean;
    nested: { x: number; y: string };
    list: string[];
    nums: number[];
    empty: unknown[];
  } = { n: 1, s: "a", b: true, nested: { x: 1, y: "y" }, list: ["a"], nums: [1], empty: [] };

  it("パッチがオブジェクトでなければ既定値のコピーを返す", () => {
    const out = mergeSettings(base, "nope");
    expect(out).toEqual(base);
    expect(out).not.toBe(base);
  });

  it("既知のキーは同じ型の値だけで上書きし、それ以外は無視する", () => {
    const out = mergeSettings(base, { n: 2, s: 3, b: "true", unknown: 1, nested: { x: 5, y: 6 } });
    expect(out).toEqual({ ...base, n: 2, nested: { x: 5, y: "y" } });
    expect(out).not.toHaveProperty("unknown");
  });

  it("配列は丸ごと置き換え、既定値と同じ型の要素だけを残す", () => {
    expect(mergeSettings(base, { list: ["b", 1, "c"], nums: [2, "3"] })).toMatchObject({ list: ["b", "c"], nums: [2] });
  });

  it("配列のキーに配列以外の値が来たら無視する", () => {
    expect(mergeSettings(base, { list: "x" }).list).toEqual(["a"]);
  });

  it("既定値が空配列なら何でも受け付ける", () => {
    expect(mergeSettings(base, { empty: [1, "a", { z: 1 }] }).empty).toEqual([1, "a", { z: 1 }]);
  });
});
