import * as dgram from "dgram";
import { promises as dns } from "dns";
import { isEqual, pick } from "lodash-es";
import { type ClockSettings } from "@/shared/settings";
import { type NtpStatus } from "@/shared/types";

const NTP_EPOCH_OFFSET_S: number = 2208988800;
const RETRY_MS: number = 5 * 60_000;
const MINUTE_MS: number = 60_000;
const DEFAULT_INTERVAL_MIN: number = 60;
const PACKET_SIZE: number = 48;
const NTP_PORT: number = 123;

export type NtpConfig = Readonly<ClockSettings["ntp"]>;

export interface NtpResult {
  readonly offset: number;
  readonly rtt: number;
}

const DISABLED_STATUS: Readonly<NtpStatus> = {
  enabled: false,
  server: "",
  offsetMs: 0,
  rttMs: null,
  lastSync: null,
  error: null,
  syncing: false,
};

/**
 * @description - NTPの64bitタイムスタンプをUNIX時刻に変換する
 * @param {Buffer} buf - 受信パケット
 * @param {number} offset - タイムスタンプの位置
 * @return {number} - UNIX時刻
 */
const readTimestamp = (buf: Buffer, offset: number): number => {
  const secs: number = buf.readUInt32BE(offset);
  const frac: number = buf.readUInt32BE(offset + 4);
  return (secs - NTP_EPOCH_OFFSET_S) * 1000 + (frac * 1000) / 2 ** 32;
};

/**
 * @description - クライアント要求パケットを作る
 * @return {Buffer} - 要求パケット
 */
const requestPacket = (): Buffer => {
  const req: Buffer = Buffer.alloc(PACKET_SIZE);
  req[0] = 0x23; // LI=0, VN=4, Mode=3
  return req;
};

/**
 * @description - サーバ応答から時計のずれと往復遅延を求める
 * @param {Buffer} buf - 受信パケット
 * @param {number} t1 - 送信時刻
 * @param {number} t4 - 受信時刻
 * @return {NtpResult | Error} - 結果
 */
const parseResponse = (buf: Buffer, t1: number, t4: number): NtpResult | Error => {
  if (buf.length < PACKET_SIZE) return new Error("不正な応答");
  if (buf[1] === 0) return new Error("サーバに拒否されました");
  const t2: number = readTimestamp(buf, 32);
  const t3: number = readTimestamp(buf, 40);
  return { offset: (t2 - t1 + (t3 - t4)) / 2, rtt: t4 - t1 - (t3 - t2) };
};

/**
 * @description - SNTPクライアント
 * @param {string} server - NTPサーバのホスト名
 * @param {number} timeoutMs - タイムアウト
 * @return {Promise<NtpResult>} - ずれと往復遅延
 */
export const queryNtp = async (server: string, timeoutMs: number = 5000): Promise<NtpResult> => {
  const { address, family } = await dns.lookup(server);

  return new Promise((resolve: (r: NtpResult) => void, reject: (e: Error) => void) => {
    const sock: dgram.Socket = dgram.createSocket(family === 6 ? "udp6" : "udp4");
    let finished: boolean = false;
    let t1: number = 0;

    /**
     * @description - 一度だけ結果を確定し、タイマーとソケットを片付ける
     * @param {NtpResult | Error} result - 結果またはエラー
     * @return {void} - なし
     */
    const finish = (result: NtpResult | Error): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      sock.close();
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    const timer: NodeJS.Timeout = setTimeout(() => finish(new Error("タイムアウト")), timeoutMs);

    sock.on("error", (e: Error) => finish(e));
    sock.on("message", (buf: Buffer) => finish(parseResponse(buf, t1, Date.now())));

    t1 = Date.now();
    sock.send(requestPacket(), NTP_PORT, address, (err: Error | null) => {
      if (err) finish(err);
    });
  });
};

/**
 * @description - 定期同期の間隔を求める
 * @param {NtpConfig | null} cfg - NTP設定
 * @return {number} - 間隔
 */
export const intervalMs = (cfg: NtpConfig | null): number =>
  Math.max(1, cfg?.intervalMin ?? DEFAULT_INTERVAL_MIN) * MINUTE_MS;

/**
 * @description - 比較対象のNTP設定項目だけを取り出す
 * @param {NtpConfig} cfg - NTP設定
 * @return {NtpConfig} - enabled / server / intervalMinのみのコピー
 */
const pickConfig = (cfg: NtpConfig): NtpConfig => pick(cfg, ["enabled", "server", "intervalMin"]);

export interface NtpSync {
  readonly status: NtpStatus;
  /**
   * @description - 設定を反映する
   * @param {NtpConfig} cfg - NTP設定
   * @return {void} - なし
   */
  configure(cfg: NtpConfig): void;
  /**
   * @description - 今すぐ同期する
   * @return {Promise<NtpStatus>} - 同期後の状態
   */
  syncNow(): Promise<NtpStatus>;
}

/**
 * @description - NTP同期を管理するオブジェクトを作る
 * @param {(s: NtpStatus) => void} onChange - 状態が変わるたびに呼ばれる
 * @return {NtpSync} - NTP同期
 */
export const createNtpSync = (onChange: (s: NtpStatus) => void): NtpSync => {
  let status: NtpStatus = { ...DISABLED_STATUS };
  let cfg: NtpConfig | null = null;
  let timer: NodeJS.Timeout | null = null;

  /**
   * @description - 状態を更新して通知する
   * @param {Partial<NtpStatus>} patch - 変更する項目
   * @return {void} - なし
   */
  const set = (patch: Partial<NtpStatus>): void => {
    status = { ...status, ...patch };
    onChange(status);
  };

  /**
   * @description - 予約済みの同期を取り消す
   * @return {void} - なし
   */
  const clearTimer = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  /**
   * @description - 指定時間後の同期を予約する
   * @param {number} ms - 待ち時間 (ms)
   * @return {void} - なし
   */
  const schedule = (ms: number): void => {
    clearTimer();
    timer = setTimeout(() => void syncNow(), ms);
  };

  /**
   * @description - 今すぐ同期する
   * @return {Promise<NtpStatus>} - 同期後の状態
   */
  const syncNow = async (): Promise<NtpStatus> => {
    const current: NtpConfig | null = cfg;
    if (!current?.enabled) return status;
    clearTimer();
    set({ syncing: true });
    try {
      const r: NtpResult = await queryNtp(current.server);
      if (current !== cfg) return status;
      set({ offsetMs: r.offset, rttMs: r.rtt, lastSync: Date.now(), error: null, syncing: false });
      schedule(intervalMs(cfg));
    } catch (e) {
      if (current !== cfg) return status;
      set({ error: e instanceof Error ? e.message : String(e), syncing: false });
      schedule(Math.min(RETRY_MS, intervalMs(cfg)));
    }
    return status;
  };

  /**
   * @description - 設定を反映する
   * @param {NtpConfig} next - NTP設定
   * @return {void} - なし
   */
  const configure = (next: NtpConfig): void => {
    const prev: NtpConfig | null = cfg;
    const picked: NtpConfig = pickConfig(next);
    if (prev && isEqual(prev, picked)) return;
    cfg = picked;
    clearTimer();

    if (!picked.enabled) {
      set({ ...DISABLED_STATUS, server: picked.server });
      return;
    }
    set({ enabled: true, server: picked.server, error: null });
    if (!prev || prev.server !== picked.server || !prev.enabled) void syncNow();
    else schedule(intervalMs(cfg));
  };

  return {
    /**
     * @description - 現在の同期状態を返す
     * @return {NtpStatus} - 同期状態
     */
    get status(): NtpStatus {
      return status;
    },
    configure,
    syncNow,
  };
};
