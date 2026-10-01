// 【確認用・あとで削除】卓上で常に空いているスペースをピンクで塗る。
// URL に ?space=1 を付けたときだけ有効（公開サイトの通常表示には影響しない）。
//
// 座標はすべて卓（正方形）の一辺に対する % 。各席の要素は「自分の席（下）」向きの
// 座標で定義し、席ごとに回転させて卓全体の座標に直す。

export const SPACE_DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('space');

type Rect = [number, number, number, number]; // x1, y1, x2, y2

/** 下向きの席を基準にした、各席で使われうる範囲 */
const SEAT_RECTS: { rect: Rect; cpuOnly?: boolean }[] = [
  // 河: 幅 6.5 枚分、最大 4 段（リーチの横向き牌込み）
  { rect: [35.6, 68, 66.8, 94.2] },
  // 鳴きの吹き出し（最長の「九種九牌」）
  { rect: [30.5, 72, 69.5, 82] },
  // 点数表示
  { rect: [33, 59, 67, 67] },
  // CPU の手牌（ポン4回まで想定した最大幅）
  { rect: [14, 93.6, 86, 99.6], cpuOnly: true },
];

/** 回転しない要素 */
const FIXED_RECTS: Rect[] = [
  [33, 33, 67, 67], // 中央（残り枚数・供託）
  [7, 7, 33, 23.2], // 局・ドラ表示
];

function rotate([x1, y1, x2, y2]: Rect, seat: number): Rect {
  switch (seat) {
    case 1: return [y1, 100 - x2, y2, 100 - x1];
    case 2: return [100 - x2, 100 - y2, 100 - x1, 100 - y1];
    case 3: return [100 - y2, x1, 100 - y1, x2];
    default: return [x1, y1, x2, y2];
  }
}

function usedRects(): Rect[] {
  const out: Rect[] = [...FIXED_RECTS];
  for (let seat = 0; seat < 4; seat++) {
    for (const r of SEAT_RECTS) if (!r.cpuOnly || seat !== 0) out.push(rotate(r.rect, seat));
  }
  return out;
}

let cache: string | null = null;

/** 空きセル（1%単位）を横方向にまとめた長方形の HTML */
export function freeSpaceHtml(): string {
  if (cache) return cache;
  const used = usedRects();
  const N = 100;
  const free: boolean[][] = [];
  for (let y = 0; y < N; y++) {
    free.push([]);
    for (let x = 0; x < N; x++) {
      const hit = used.some(([x1, y1, x2, y2]) => x + 1 > x1 && x < x2 && y + 1 > y1 && y < y2);
      free[y].push(!hit);
    }
  }
  // 行ごとの連続区間を、同じ区間が続く行どうしで縦にまとめる
  const rects: Rect[] = [];
  const open = new Map<string, Rect>();
  for (let y = 0; y <= N; y++) {
    const runs = new Set<string>();
    if (y < N) {
      for (let x = 0; x < N; ) {
        if (!free[y][x]) { x++; continue; }
        let e = x;
        while (e < N && free[y][e]) e++;
        runs.add(`${x}-${e}`);
        x = e;
      }
    }
    for (const [key, r] of open) {
      if (!runs.has(key)) {
        rects.push(r);
        open.delete(key);
      }
    }
    for (const key of runs) {
      const [a, b] = key.split('-').map(Number);
      const r = open.get(key);
      if (r) r[3] = y + 1;
      else open.set(key, [a, y, b, y + 1]);
    }
  }
  cache = rects.map(([x1, y1, x2, y2]) =>
    `<div class="free-space" style="left:${x1}%;top:${y1}%;width:${x2 - x1}%;height:${y2 - y1}%"></div>`).join('');
  return cache;
}
