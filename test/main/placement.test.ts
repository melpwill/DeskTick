import { describe, expect, it } from "vitest";
import {
  anchoredBounds,
  contentSize,
  defaultPosition,
  isBottomCorner,
  isRightCorner,
  pickDisplay,
  type PositionSettings,
  type Rect,
} from "@/main/placement";
import { type Corner } from "@/shared/settings";

const workArea: Rect = { x: 100, y: 50, width: 1920, height: 1040 };
const pos = (corner: Corner): PositionSettings => ({ display: -1, corner, marginX: 12, marginY: 8 });

describe("isRightCorner / isBottomCorner", () => {
  it.each<[Corner, boolean, boolean]>([
    ["top-left", false, false],
    ["top-right", true, false],
    ["bottom-left", false, true],
    ["bottom-right", true, true],
  ])("%s", (corner, right, bottom) => {
    expect(isRightCorner(corner)).toBe(right);
    expect(isBottomCorner(corner)).toBe(bottom);
  });
});

describe("pickDisplay", () => {
  const displays = ["a", "b"];
  it("指定番号のディスプレイを返す", () => {
    expect(pickDisplay(displays, 1, "primary")).toBe("b");
    expect(pickDisplay(displays, 0, "primary")).toBe("a");
  });

  it("-1や存在しない番号ならメインディスプレイを使う", () => {
    expect(pickDisplay(displays, -1, "primary")).toBe("primary");
    expect(pickDisplay(displays, 5, "primary")).toBe("primary");
  });
});

describe("defaultPosition", () => {
  const size = { width: 200, height: 80 };
  it.each<[Corner, number, number]>([
    ["top-left", 112, 58],
    ["top-right", 100 + 1920 - 200 - 12, 58],
    ["bottom-left", 112, 50 + 1040 - 80 - 8],
    ["bottom-right", 100 + 1920 - 200 - 12, 50 + 1040 - 80 - 8],
  ])("places the window at the %s corner", (corner, x, y) => {
    expect(defaultPosition(workArea, pos(corner), size)).toEqual({ x, y });
  });
});

describe("anchoredBounds", () => {
  const current: Rect = { x: 500, y: 300, width: 200, height: 80 };

  it("サイズが変わらなければnullを返す", () => {
    expect(anchoredBounds(current, { width: 200, height: 80 }, "top-left")).toBeNull();
  });

  it.each<[Corner, number, number]>([
    ["top-left", 500, 300],
    ["top-right", 450, 300],
    ["bottom-left", 500, 280],
    ["bottom-right", 450, 280],
  ])("keeps the %s corner fixed", (corner, x, y) => {
    expect(anchoredBounds(current, { width: 250, height: 100 }, corner)).toEqual({ x, y, width: 250, height: 100 });
  });

  it("高さだけが変わってもリサイズする", () => {
    expect(anchoredBounds(current, { width: 200, height: 90 }, "bottom-right")).toEqual({
      x: 500,
      y: 290,
      width: 200,
      height: 90,
    });
  });
});

describe("contentSize", () => {
  it("小数のサイズは切り上げる", () => {
    expect(contentSize(199.2, 79.01)).toEqual({ width: 200, height: 80 });
  });

  it("最小でも1pxにする", () => {
    expect(contentSize(0, -5)).toEqual({ width: 1, height: 1 });
  });
});
