import { describe, expect, it } from "vitest";
import { compareVersions, isNewerVersion, parseVersion } from "@/shared/version";

describe("parseVersion", () => {
  it("x.y.zとvx.y.zを読み取る", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("v10.0.20")).toEqual([10, 0, 20]);
  });

  it("付加情報・先頭の0・桁の不足は受け付けない", () => {
    for (const s of [
      "1.2",
      "1.2.3-beta.1",
      "1.2.3+build",
      "01.2.3",
      "V1.2.3",
      " 1.2.3",
      "1.2.3.4",
      "",
      "1234567890.0.0",
    ]) {
      expect(parseVersion(s)).toBeNull();
    }
  });
});

describe("compareVersions", () => {
  it("数値として比べる", () => {
    expect(compareVersions([1, 10, 0], [1, 9, 0])).toBeGreaterThan(0);
    expect(compareVersions([1, 0, 0], [2, 0, 0])).toBeLessThan(0);
    expect(compareVersions([1, 2, 3], [1, 2, 4])).toBeLessThan(0);
    expect(compareVersions([1, 2, 3], [1, 2, 3])).toBe(0);
  });
});

describe("isNewerVersion", () => {
  it("候補の方が新しいときだけtrue", () => {
    expect(isNewerVersion("v1.10.0", "1.9.9")).toBe(true);
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("0.9.0", "1.0.0")).toBe(false);
  });

  it("どちらかが不正な形式ならfalse", () => {
    expect(isNewerVersion("2.0.0-rc.1", "1.0.0")).toBe(false);
    expect(isNewerVersion("2.0.0", "dev")).toBe(false);
  });
});
