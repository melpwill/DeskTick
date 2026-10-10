import { beforeEach, describe, expect, it, vi } from "vitest";

type ExecCallback = (err: Error | null, stdout: string) => void;

const mocks = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock("child_process", () => ({ execFile: mocks.execFile }));

const load = async () => (await import("@/main/fonts")).listFonts;

const respond = (err: Error | null, stdout = ""): void => {
  mocks.execFile.mockImplementationOnce((_file: string, _args: string[], _opts: unknown, cb: ExecCallback) =>
    setImmediate(() => cb(err, stdout)),
  );
};

beforeEach(() => {
  vi.resetModules();
  mocks.execFile.mockReset();
});

describe("listFonts", () => {
  it("PowerShellを非表示で実行し、フォント名を解析・トリム・重複除去・並べ替えする", async () => {
    const listFonts = await load();
    respond(null, "Meiryo\r\n  Arial  \r\n\r\nArial\nBIZ UDGothic\n");
    await expect(listFonts()).resolves.toEqual(["Arial", "BIZ UDGothic", "Meiryo"]);

    const [file, args, opts] = mocks.execFile.mock.calls[0];
    expect(file).toBe("powershell.exe");
    expect(args.slice(0, 5)).toEqual(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"]);
    expect(args[5]).toContain("InstalledFontCollection");
    expect(opts).toMatchObject({ windowsHide: true, encoding: "utf8", timeout: 20_000 });
  });

  it("初回呼び出し後は結果をキャッシュする", async () => {
    const listFonts = await load();
    respond(null, "Arial\n");
    const a = listFonts();
    const b = listFonts();
    expect(a).toBe(b);
    await expect(a).resolves.toEqual(["Arial"]);
    await expect(listFonts()).resolves.toEqual(["Arial"]);
    expect(mocks.execFile).toHaveBeenCalledTimes(1);
  });

  it("エラー時は[]を返し、次の呼び出しで再試行する", async () => {
    const listFonts = await load();
    respond(new Error("powershell missing"));
    await expect(listFonts()).resolves.toEqual([]);
    respond(null, "Consolas\n");
    await expect(listFonts()).resolves.toEqual(["Consolas"]);
    expect(mocks.execFile).toHaveBeenCalledTimes(2);
  });
});

describe("parseFontList", () => {
  it("トリムし、空行と重複を除いてロケール順に並べる", async () => {
    const { parseFontList } = await import("@/main/fonts");
    expect(parseFontList("b\r\n a \n\nB\na\n")).toEqual(["a", "b", "B"]);
    expect(parseFontList("")).toEqual([]);
  });
});

describe("createFontLister", () => {
  it("リスターごとに独立したキャッシュを持つ", async () => {
    const { createFontLister } = await import("@/main/fonts");
    respond(null, "Arial\n");
    respond(null, "Meiryo\n");
    await expect(createFontLister()()).resolves.toEqual(["Arial"]);
    await expect(createFontLister()()).resolves.toEqual(["Meiryo"]);
    expect(mocks.execFile).toHaveBeenCalledTimes(2);
  });
});
