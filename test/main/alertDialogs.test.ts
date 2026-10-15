import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  type Handler = () => void;
  class FakeWindow {
    static instances: FakeWindow[] = [];
    handlers = new Map<string, Handler>();
    webContents = {};
    setAlwaysOnTop = vi.fn();
    setMenu = vi.fn();
    setBounds = vi.fn();
    showInactive = vi.fn();
    loadFile = vi.fn(() => Promise.resolve());
    constructor(public opts: Record<string, unknown>) {
      FakeWindow.instances.push(this);
    }
    on(ev: string, fn: Handler) {
      this.handlers.set(ev, fn);
      return this;
    }
    emit(ev: string) {
      this.handlers.get(ev)!();
    }
  }
  return { FakeWindow };
});

vi.mock("electron", () => ({ BrowserWindow: m.FakeWindow }));

import { createAlertDialogs } from "@/main/alertDialogs";

const workArea = { x: 0, y: 0, width: 1000, height: 800 };
const opts = {
  productName: "DeskTick",
  htmlPath: "C:/app/static/alert.html",
  preloadPath: "C:/app/dist/preload.js",
  workArea: () => workArea,
};
const content = { title: "Title", body: "Body", color: "#123456" };
const sender = (i: number) => m.FakeWindow.instances[i].webContents as Electron.WebContents;

beforeEach(() => {
  m.FakeWindow.instances.length = 0;
});

describe("show", () => {
  it("最前面の枠なしウィンドウを作り、内容をクエリで渡す", () => {
    const d = createAlertDialogs(opts);
    d.show(content);

    const w = m.FakeWindow.instances[0];
    expect(w.opts).toMatchObject({ show: false, frame: false, skipTaskbar: true, alwaysOnTop: true });
    expect(w.opts.webPreferences).toEqual({ preload: opts.preloadPath, contextIsolation: true, sandbox: true });
    expect(w.setAlwaysOnTop).toHaveBeenCalledWith(true, "screen-saver");
    expect(w.setMenu).toHaveBeenCalledWith(null);
    expect(w.loadFile).toHaveBeenCalledWith(opts.htmlPath, { query: { ...content, app: "DeskTick" } });
    expect(w.showInactive).not.toHaveBeenCalled();
    expect(d.openCount).toBe(1);
  });
});

describe("resize", () => {
  it("初回の報告で配置してフォーカスを奪わずに表示し、以降は配置だけ直す", () => {
    const d = createAlertDialogs(opts);
    d.show(content);
    const w = m.FakeWindow.instances[0];

    d.resize(sender(0), 339.5, 99.2);
    expect(w.setBounds).toHaveBeenLastCalledWith({ x: 1000 - 340 - 12, y: 800 - 100 - 12, width: 340, height: 100 });
    expect(w.showInactive).toHaveBeenCalledTimes(1);

    d.resize(sender(0), 340, 120);
    expect(w.setBounds).toHaveBeenLastCalledWith({ x: 648, y: 668, width: 340, height: 120 });
    expect(w.showInactive).toHaveBeenCalledTimes(1);
  });

  it("開いた順に下から積み、大きさが未報告のものは飛ばす", () => {
    const d = createAlertDialogs(opts);
    d.show(content);
    d.show(content);
    d.show(content);
    const [a, b, c] = m.FakeWindow.instances;

    d.resize(sender(0), 340, 100);
    d.resize(sender(2), 340, 50);
    expect(a.setBounds).toHaveBeenLastCalledWith({ x: 648, y: 688, width: 340, height: 100 });
    expect(c.setBounds).toHaveBeenLastCalledWith({ x: 648, y: 626, width: 340, height: 50 });
    expect(b.setBounds).not.toHaveBeenCalled();
  });

  it("閉じたら残りを詰め、閉じたウィンドウからの報告は無視する", () => {
    const d = createAlertDialogs(opts);
    d.show(content);
    d.show(content);
    const [a, b] = m.FakeWindow.instances;
    d.resize(sender(0), 340, 100);
    d.resize(sender(1), 340, 50);

    a.emit("closed");
    expect(d.openCount).toBe(1);
    expect(b.setBounds).toHaveBeenLastCalledWith({ x: 648, y: 738, width: 340, height: 50 });

    a.setBounds.mockClear();
    d.resize(sender(0), 340, 100);
    expect(a.setBounds).not.toHaveBeenCalled();
  });
});
