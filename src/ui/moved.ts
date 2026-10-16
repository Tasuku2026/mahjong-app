// 旧アドレス（GitHub Pages: tasuku2026.github.io/mahjong-app）からの引っ越し
// 旧アドレスを開くと、そこに保存されていた戦績・設定・教室の進み具合を「#move=…」に入れて、新しいアドレスへ移ってくる。
// 「#」より後ろはサーバーに送られないので、データはブラウザの中だけで受け渡される。
// 形: #move=g.<gzip した JSON を base64url> ／ 圧縮できない古いブラウザでは #move=j.<JSON を base64url>
// JSON は { "mahjong-stats-v1": "…", … }（localStorage の名前と中身）

const PREFIX = 'mahjong-';
const STATS_KEY = 'mahjong-stats-v1';
const MAX_TOTAL = 4_000_000; // 受け取る中身の上限（文字数）。おかしなデータで端末をいっぱいにしない

/** 引っ越してきたデータのうち、新しいアドレスに書き込むものを決める。
 * まだ保存がない項目はそのまま入れる。戦績は、新しいアドレスでもう遊んでいたら両方を合わせる。
 * それ以外ですでに保存がある項目（設定など）は、新しいアドレスのほうを残す */
export function mergeMoved(moved: Record<string, unknown>, current: (key: string) => string | null): Record<string, string> {
  const out: Record<string, string> = {};
  let total = 0;
  for (const [key, value] of Object.entries(moved)) {
    if (!key.startsWith(PREFIX) || typeof value !== 'string') continue;
    total += key.length + value.length;
    if (total > MAX_TOTAL) break;
    const now = current(key);
    if (now === null) out[key] = value;
    else if (key === STATS_KEY) out[key] = mergeStats(now, value);
  }
  return out;
}

// 戦績を合わせる: 同じ対局（日時と点数が同じ）は1つにして、日時の順に並べる。多すぎるときは新しい 1000 件
function mergeStats(a: string, b: string): string {
  try {
    const list = [...JSON.parse(a), ...JSON.parse(b)].filter((r) => r && typeof r.date === 'string');
    const seen = new Set<string>();
    const uniq = list.filter((r) => {
      const id = `${r.date}|${r.score}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    uniq.sort((x, y) => x.date.localeCompare(y.date));
    return JSON.stringify(uniq.slice(-1000));
  } catch {
    return a;
  }
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function decode(payload: string): Promise<Record<string, unknown> | null> {
  const [kind, body] = [payload.slice(0, 2), payload.slice(2)];
  let bytes = fromBase64Url(body);
  if (kind === 'g.') {
    const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  } else if (kind !== 'j.') {
    return null;
  }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
}

/** アドレスに引っ越しのデータが付いていたら取り込み、アドレスから消す。取り込んだら true */
export async function importMoved(): Promise<boolean> {
  const m = location.hash.match(/^#move=(.+)$/);
  if (!m) return false;
  // 読み込み直しや共有で二度取り込まないよう、先にアドレスから消しておく
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const moved = await decode(m[1]);
    if (!moved) return false;
    const toWrite = mergeMoved(moved, (k) => localStorage.getItem(k));
    for (const [k, v] of Object.entries(toWrite)) localStorage.setItem(k, v);
    return Object.keys(toWrite).length > 0;
  } catch {
    // 壊れたデータや保存できない環境では、何もせずに始める
    return false;
  }
}
