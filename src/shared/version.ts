export type Version = readonly [number, number, number];

const VERSION_RE: RegExp = /^v?(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;

/**
 * @description - "1.2.3"または"v1.2.3"をバージョンとして解釈する（プレリリース等の付加情報は受け付けない）
 * @param {string} s - バージョン文字列
 * @return {Version | null} - [major, minor, patch]。不正な形式ならnull
 */
export const parseVersion = (s: string): Version | null => {
  const m: RegExpExecArray | null = VERSION_RE.exec(s);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/**
 * @description - 2つのバージョンを比べる
 * @param {Version} a - 比べるバージョン
 * @param {Version} b - 比べるバージョン
 * @return {number} - aが新しければ正、古ければ負、同じなら0
 */
export const compareVersions = (a: Version, b: Version): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * @description - candidateがcurrentより新しいバージョンかを判定する
 * @param {string} candidate - 候補のバージョン
 * @param {string} current - 現在のバージョン
 * @return {boolean} - どちらも正しい形式で、candidateの方が新しければtrue
 */
export const isNewerVersion = (candidate: string, current: string): boolean => {
  const a: Version | null = parseVersion(candidate);
  const b: Version | null = parseVersion(current);
  return a !== null && b !== null && compareVersions(a, b) > 0;
};
