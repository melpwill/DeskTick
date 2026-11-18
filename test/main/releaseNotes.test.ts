import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { RELEASES_FEED } from "@/main/githubRelease";
import { type HttpGetOptions } from "@/main/http";
import { CACHE_MS, createReleaseNotesSource, type ReleaseNotesSource } from "@/main/releaseNotes";

const FEED = "<feed>v1.0.0</feed>";

let now: number;
let get: Mock<(url: string, opts: HttpGetOptions) => Promise<Uint8Array>>;
let source: ReleaseNotesSource;

beforeEach(() => {
  now = 1_000_000;
  get = vi.fn(async () => Buffer.from(FEED));
  source = createReleaseNotesSource({ get, now: () => now });
});

describe("createReleaseNotesSource", () => {
  it("APIではなくリリースのフィードを取得する", async () => {
    expect(await source.get()).toEqual({ feed: FEED, error: null });
    expect(get).toHaveBeenCalledWith(RELEASES_FEED, expect.objectContaining({ accept: "application/atom+xml" }));
  });

  it("しばらくは前回の結果を使い、時間がたったら取得し直す", async () => {
    await source.get();
    now += CACHE_MS - 1;
    await source.get();
    expect(get).toHaveBeenCalledTimes(1);
    get.mockResolvedValue(Buffer.from("<feed>v1.1.0</feed>"));
    now += 1;
    expect(await source.get()).toEqual({ feed: "<feed>v1.1.0</feed>", error: null });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("取得中に呼ばれたら、同じ取得の結果を返す", async () => {
    const [a, b] = await Promise.all([source.get(), source.get()]);
    expect(a).toEqual(b);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("取得に失敗したら理由を返し、次は取得し直す", async () => {
    get.mockRejectedValueOnce(new Error("offline"));
    expect(await source.get()).toEqual({ feed: "", error: "offline" });
    get.mockRejectedValueOnce("reset");
    expect(await source.get()).toEqual({ feed: "", error: "reset" });
    expect(await source.get()).toEqual({ feed: FEED, error: null });
    expect(get).toHaveBeenCalledTimes(3);
  });
});
