import { describe, expect, it } from "vitest";
import { CONFIG_VERSION, configVersionOf, MIGRATIONS, migrateConfig } from "@/shared/configVersion";

describe("configVersionOf", () => {
  it("正の整数の版を読み取る", () => {
    expect(configVersionOf({ configVersion: 3 })).toBe(3);
  });

  it("版がない・不正なら1とみなす", () => {
    for (const raw of [null, [], {}, { configVersion: "2" }, { configVersion: 0 }, { configVersion: 1.5 }]) {
      expect(configVersionOf(raw)).toBe(1);
    }
  });
});

describe("migrateConfig", () => {
  it("現在の版は1で、変換は登録されていない", () => {
    expect(CONFIG_VERSION).toBe(1);
    expect(MIGRATIONS).toEqual({});
    const raw = { padding: 1 };
    expect(migrateConfig(raw)).toEqual({ raw, from: 1, migrated: false, tooNew: false });
  });

  it("古い版は順に変換し、版を現在の版にする", () => {
    const migrations = {
      1: (r: Record<string, unknown>) => ({ ...r, b: r.a, a: undefined }),
      2: (r: Record<string, unknown>) => ({ ...r, c: `${r.b}!` }),
    };
    expect(migrateConfig({ a: "x" }, 3, migrations)).toEqual({
      raw: { a: undefined, b: "x", c: "x!", configVersion: 3 },
      from: 1,
      migrated: true,
      tooNew: false,
    });
  });

  it("変換が登録されていない版はそのまま次の版にする", () => {
    expect(migrateConfig({ configVersion: 1, a: 1 }, 2, {})).toEqual({
      raw: { a: 1, configVersion: 2 },
      from: 1,
      migrated: true,
      tooNew: false,
    });
  });

  it("新しい版のファイルは変換せず、tooNewを立てる", () => {
    const raw = { configVersion: 5 };
    expect(migrateConfig(raw, 2, {})).toEqual({ raw, from: 5, migrated: false, tooNew: true });
  });

  it("オブジェクトでなければ変換しない", () => {
    expect(migrateConfig(null, 2, {})).toEqual({ raw: null, from: 1, migrated: false, tooNew: false });
  });
});
