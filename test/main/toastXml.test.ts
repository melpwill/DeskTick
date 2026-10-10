import { describe, expect, it } from "vitest";
import { escapeXml, toastXml } from "@/main/toastXml";

describe("escapeXml", () => {
  it("XMLの特殊文字をすべてエスケープする", () => {
    expect(escapeXml(`<a & 'b'> "c"`)).toBe("&lt;a &amp; &apos;b&apos;&gt; &quot;c&quot;");
  });

  it("普通の文字列はそのままにする", () => {
    expect(escapeXml("昼休み 12:00")).toBe("昼休み 12:00");
  });
});

describe("toastXml", () => {
  it("OKボタン付きで音なしのトーストを、文字列をエスケープして組み立てる", () => {
    const xml = toastXml("<t>", "b&");
    expect(xml.startsWith('<toast activationType="foreground">')).toBe(true);
    expect(xml).toContain("<text>&lt;t&gt;</text><text>b&amp;</text>");
    expect(xml).toContain('<audio silent="true"/>');
    expect(xml).toContain('<action content="OK" arguments="dismiss" activationType="background"/>');
    expect(xml.endsWith("</toast>")).toBe(true);
  });
});
