import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS_TAB, settingsArg } from "@/main/cli";

describe("settingsArg", () => {
  it("フラグがなければnullを返す", () => {
    expect(settingsArg([])).toBeNull();
    expect(settingsArg(["DeskTick.exe", "--other", "--settingsX"])).toBeNull();
  });

  it("値なしの--settingsでは既定のタブを返す", () => {
    expect(DEFAULT_SETTINGS_TAB).toBe("display");
    expect(settingsArg(["DeskTick.exe", "--settings"])).toBe("display");
  });

  it("'='の後のタブを返す", () => {
    expect(settingsArg(["DeskTick.exe", "--settings=about"])).toBe("about");
    expect(settingsArg(["--settings=a=b"])).toBe("a=b");
    expect(settingsArg(["--settings="])).toBe("");
  });

  it("最初に一致した引数を使う", () => {
    expect(settingsArg(["--settings=alerts", "--settings"])).toBe("alerts");
  });
});
