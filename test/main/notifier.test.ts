import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  type Handler = () => void;
  class FakeNotification {
    static isSupported = vi.fn(() => true);
    static instances: FakeNotification[] = [];
    handlers = new Map<string, Handler>();
    show = vi.fn();
    constructor(public opts: { title: string; body: string; silent: boolean; toastXml: string }) {
      FakeNotification.instances.push(this);
    }
    on(ev: string, fn: Handler) {
      this.handlers.set(ev, fn);
      return this;
    }
    emit(ev: string) {
      this.handlers.get(ev)!();
    }
  }
  return {
    FakeNotification,
    app: { getPath: vi.fn((name: string) => `C:\\Users\\me\\${name}`) },
    dialog: { showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })) },
    shell: { readShortcutLink: vi.fn(), writeShortcutLink: vi.fn(() => true) },
    execFile: vi.fn(),
    fs: { mkdirSync: vi.fn(), writeFileSync: vi.fn(), readFileSync: vi.fn(), existsSync: vi.fn(() => false) },
  };
});

vi.mock("electron", () => ({ app: m.app, dialog: m.dialog, shell: m.shell, Notification: m.FakeNotification }));
vi.mock("child_process", () => ({ execFile: m.execFile }));
vi.mock("fs", () => m.fs);

import { createNotifier } from "@/main/notifier";

const opts = {
  productName: "DeskTick",
  appUserModelId: "jp.melpwill.desktick",
  exePath: "C:\\apps\\DeskTick.exe",
  iconPath: "C:\\apps\\resources\\app.asar\\static\\icon.png",
};
const lnk = path.join("C:\\Users\\me\\appData", "Microsoft", "Windows", "Start Menu", "Programs", "DeskTick.lnk");
const regKey = "HKCU\\Software\\Classes\\AppUserModelId\\jp.melpwill.desktick";

const realPlatform = process.platform;
const setPlatform = (p: string): void => {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
};

beforeEach(() => {
  vi.clearAllMocks();
  m.FakeNotification.instances.length = 0;
  m.FakeNotification.isSupported.mockReturnValue(true);
  m.fs.existsSync.mockReturnValue(false);
  m.shell.readShortcutLink.mockImplementation(() => {
    throw new Error("missing");
  });
  m.execFile.mockReset();
  m.fs.writeFileSync.mockReset();
  setPlatform("win32");
});

afterEach(() => {
  setPlatform(realPlatform);
});

describe("registerAppId", () => {
  it("アイコンを書き出し、DisplayNameとIconUriを登録する", () => {
    const png = Buffer.from("png");
    m.fs.readFileSync.mockReturnValue(png);
    createNotifier(opts).registerAppId();

    const icon = path.join("C:\\Users\\me\\userData", "toast-icon.png");
    expect(m.app.getPath).toHaveBeenCalledWith("userData");
    expect(m.fs.mkdirSync).toHaveBeenCalledWith(path.dirname(icon), { recursive: true });
    expect(m.fs.readFileSync).toHaveBeenCalledWith(opts.iconPath);
    expect(m.fs.writeFileSync).toHaveBeenCalledWith(icon, png);

    expect(m.execFile).toHaveBeenCalledTimes(2);
    expect(m.execFile).toHaveBeenNthCalledWith(
      1,
      "reg.exe",
      ["add", regKey, "/v", "DisplayName", "/t", "REG_SZ", "/d", "DeskTick", "/f"],
      { windowsHide: true },
      expect.any(Function),
    );
    expect(m.execFile).toHaveBeenNthCalledWith(
      2,
      "reg.exe",
      ["add", regKey, "/v", "IconUri", "/t", "REG_SZ", "/d", icon, "/f"],
      { windowsHide: true },
      expect.any(Function),
    );
  });

  it("reg.exeの失敗はログに出し、成功時は何もしない", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    createNotifier(opts).registerAppId();
    const [first, second] = m.execFile.mock.calls;
    first[3](null);
    expect(err).not.toHaveBeenCalled();
    const e = new Error("access denied");
    second[3](e);
    expect(err).toHaveBeenCalledWith("Failed to register IconUri:", e);
  });

  it("アイコンの書き込み失敗はログに出し、登録は続ける", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const e = new Error("EACCES");
    m.fs.writeFileSync.mockImplementationOnce(() => {
      throw e;
    });
    createNotifier(opts).registerAppId();
    expect(err).toHaveBeenCalledWith("Failed to write toast icon:", e);
    expect(m.execFile).toHaveBeenCalledTimes(2);
  });

  it("Windows以外では何もしない", () => {
    setPlatform("linux");
    createNotifier(opts).registerAppId();
    expect(m.fs.writeFileSync).not.toHaveBeenCalled();
    expect(m.execFile).not.toHaveBeenCalled();
  });
});

describe("show", () => {
  it("通知に非対応ならメッセージボックスで代替する", () => {
    m.FakeNotification.isSupported.mockReturnValue(false);
    createNotifier(opts).show("Title", "Body");
    expect(m.dialog.showMessageBox).toHaveBeenCalledWith({
      type: "info",
      title: "DeskTick",
      message: "Title",
      detail: "Body",
    });
    expect(m.FakeNotification.instances).toHaveLength(0);
    expect(m.shell.writeShortcutLink).not.toHaveBeenCalled();
  });

  it("XMLをエスケープした音なしのトーストを表示する", () => {
    createNotifier(opts).show(`<a & 'b'>`, `"c"`);
    const [n] = m.FakeNotification.instances;
    expect(n.opts.title).toBe(`<a & 'b'>`);
    expect(n.opts.body).toBe(`"c"`);
    expect(n.opts.silent).toBe(true);
    expect(n.opts.toastXml).toContain("<text>&lt;a &amp; &apos;b&apos;&gt;</text><text>&quot;c&quot;</text>");
    expect(n.opts.toastXml).toContain('<audio silent="true"/>');
    expect(n.opts.toastXml).toContain('<action content="OK" arguments="dismiss" activationType="background"/>');
    expect(n.show).toHaveBeenCalledTimes(1);
    expect(m.dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it("トーストが閉じるまで参照を保持する", () => {
    const notifier = createNotifier(opts);
    notifier.show("a", "b");
    const [n] = m.FakeNotification.instances;
    expect(notifier.activeCount).toBe(1);
    n.emit("close");
    expect(notifier.activeCount).toBe(0);
    expect(m.dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it("トーストが失敗したら参照を解放し、メッセージボックスで代替する", () => {
    const notifier = createNotifier(opts);
    notifier.show("a", "b");
    const [n] = m.FakeNotification.instances;
    n.emit("failed");
    expect(notifier.activeCount).toBe(0);
    expect(m.dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ message: "a", detail: "b" }));
  });

  it("スタートメニューのショートカットがなければ作成する", () => {
    createNotifier(opts).show("a", "b");
    expect(m.shell.readShortcutLink).toHaveBeenCalledWith(lnk);
    expect(m.fs.existsSync).toHaveBeenCalledWith(lnk);
    expect(m.shell.writeShortcutLink).toHaveBeenCalledWith(lnk, "create", {
      target: opts.exePath,
      appUserModelId: opts.appUserModelId,
      description: "DeskTick",
    });
  });

  it("一致するショートカットはそのままにする", () => {
    m.shell.readShortcutLink.mockReturnValue({ target: opts.exePath, appUserModelId: opts.appUserModelId });
    createNotifier(opts).show("a", "b");
    expect(m.shell.writeShortcutLink).not.toHaveBeenCalled();
  });

  it.each([
    ["target", { target: "C:\\old\\DeskTick.exe", appUserModelId: opts.appUserModelId }],
    ["app id", { target: opts.exePath, appUserModelId: "other" }],
  ])("%sが一致しないショートカットは置き換える", (_what, cur) => {
    m.shell.readShortcutLink.mockReturnValue(cur);
    m.fs.existsSync.mockReturnValue(true);
    createNotifier(opts).show("a", "b");
    expect(m.shell.writeShortcutLink).toHaveBeenCalledWith(lnk, "replace", expect.any(Object));
  });

  it("Windows以外ではショートカットを作らない", () => {
    setPlatform("darwin");
    createNotifier(opts).show("a", "b");
    expect(m.shell.readShortcutLink).not.toHaveBeenCalled();
    expect(m.shell.writeShortcutLink).not.toHaveBeenCalled();
    expect(m.FakeNotification.instances[0].show).toHaveBeenCalled();
  });
});
