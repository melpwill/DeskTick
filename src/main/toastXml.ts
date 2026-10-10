const XML_ENTITIES: Readonly<Record<string, string>> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "'": "&apos;",
  '"': "&quot;",
};

/**
 * @description - 文字列をXMLテキストとして安全に埋め込めるようエスケープする
 * @param {string} s - 元の文字列
 * @return {string} - エスケープ済みの文字列
 */
export const escapeXml = (s: string): string => s.replace(/[<>&'"]/g, (c: string): string => XML_ENTITIES[c]);

/**
 * @description - 無音・OK ボタン付きのWindowsトーストXMLを組み立てる
 * @param {string} title - タイトル
 * @param {string} body - 本文
 * @return {string} - トーストXML
 */
export const toastXml = (title: string, body: string): string =>
  `<toast activationType="foreground"><visual><binding template="ToastGeneric">` +
  `<text>${escapeXml(title)}</text><text>${escapeXml(body)}</text>` +
  `</binding></visual><audio silent="true"/>` +
  `<actions><action content="OK" arguments="dismiss" activationType="background"/></actions></toast>`;
