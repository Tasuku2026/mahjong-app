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

// ---------------------------------------------------------------
// 水色: 中央（点数・残り枚数）の中の空き、卓の下（ヒント〜手牌）の空き
// ---------------------------------------------------------------

let measureCtx: CanvasRenderingContext2D | null = null;

/** font-size 100px での文字幅(px)。卓の % に直すときは font の S 比率を掛ける */
function textWidth(text: string, weight = 400): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * 60;
  const family = getComputedStyle(document.body).fontFamily;
  measureCtx.font = `${weight} 100px ${family}`;
  return measureCtx.measureText(text).width;
}

/** 中央の箱の中で、文字が置かれうる範囲（下向きの席を基準にした卓の %） */
function centerUsedRects(): { seat: Rect[]; fixed: Rect[] } {
  // 点数: 「北」+ 最長の点数 + リーチ棒。font-size は 0.034S、要素間の gap は 1.2%
  const fs = 0.034;
  const w = (textWidth('北', 800) + textWidth('-125,000')) * fs + 1.2 * 2 + 6;
  const textH = fs * 100 * 1.25;
  const seat: Rect[] = [
    [50 - w / 2, 63 - textH / 2, 50 + w / 2, 63 + textH / 2],
    [33, 66.3, 67, 67], // 手番の下線
  ];
  // 中央: 「残り 70」(数字は1.3倍) と「供託 10」を縦に中央寄せ
  const cf = 0.032;
  const l1w = (textWidth('残り ') + textWidth('70', 700) * 1.3) * cf;
  const l2w = textWidth('供託 10') * cf;
  const l1h = cf * 100 * 1.3 * 1.25;
  const l2h = cf * 100 * 1.25;
  const total = l1h + 0.8 + l2h;
  const top = 50 - total / 2;
  const fixed: Rect[] = [
    // 供託がないときは「残り」だけが中央に来る
    [50 - l1w / 2, 50 - l1h / 2, 50 + l1w / 2, 50 + l1h / 2],
    [50 - l1w / 2, top, 50 + l1w / 2, top + l1h],
    [50 - l2w / 2, top + l1h + 0.8, 50 + l2w / 2, top + total],
  ];
  return { seat, fixed };
}

let centerCache: string | null = null;

/** 中央の箱（33%〜67%）の中の空きを水色で */
export function centerFreeHtml(): string {
  if (centerCache) return centerCache;
  const { seat, fixed } = centerUsedRects();
  const used: Rect[] = [...fixed];
  for (let s = 0; s < 4; s++) for (const r of seat) used.push(rotate(r, s));
  const R = 0.5; // 0.5% 刻み
  const cells: boolean[][] = [];
  const x0 = 33;
  const n = Math.round(34 / R);
  for (let j = 0; j < n; j++) {
    cells.push([]);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * R;
      const y = x0 + j * R;
      cells[j].push(!used.some(([a, b, c, d]) => x + R > a && x < c && y + R > b && y < d));
    }
  }
  centerCache = mergeCells(cells).map(([a, b, c, d]) =>
    `<div class="free-space blue" style="left:${x0 + a * R}%;top:${x0 + b * R}%;width:${(c - a) * R}%;height:${(d - b) * R}%"></div>`).join('');
  return centerCache;
}

/** true のセルを長方形にまとめる（[x1, y1, x2, y2] セル単位） */
function mergeCells(free: boolean[][]): Rect[] {
  const rects: Rect[] = [];
  const open = new Map<string, Rect>();
  const H = free.length;
  const W = H ? free[0].length : 0;
  for (let y = 0; y <= H; y++) {
    const runs = new Set<string>();
    if (y < H) {
      for (let x = 0; x < W; ) {
        if (!free[y][x]) { x++; continue; }
        let e = x;
        while (e < W && free[y][e]) e++;
        runs.add(`${x}-${e}`);
        x = e;
      }
    }
    for (const [key, r] of open) if (!runs.has(key)) { rects.push(r); open.delete(key); }
    for (const key of runs) {
      const [a, b] = key.split('-').map(Number);
      const r = open.get(key);
      if (r) r[3] = y + 1;
      else open.set(key, [a, y, b, y + 1]);
    }
  }
  return rects;
}

/**
 * 卓の下（ヒントのボタン〜自分の手牌）で、常に空いている場所を水色で塗る。
 * 補助パネル・操作ボタン欄は、表示内容が最大のとき全体を使うので「使用中」とみなす。
 * 手牌は 14 枚（ツモ牌の間隔込み）のときの幅で考える。
 */
export function paintLowerFree(root: HTMLElement): void {
  document.querySelectorAll('.free-lower').forEach((e) => e.remove());
  const board = root.querySelector('.board-wrap');
  const toolbar = root.querySelector('.toolbar');
  const hand = root.querySelector<HTMLElement>('.my-hand');
  if (!board || !toolbar || !hand) return;
  const top = board.getBoundingClientRect().bottom;
  const bottom = window.innerHeight;
  const width = window.innerWidth;
  const used: DOMRect[] = [];
  // ボタン列: ボタンが並ぶ範囲
  const chips = [...toolbar.children].map((c) => c.getBoundingClientRect());
  if (chips.length) {
    used.push(new DOMRect(
      Math.min(...chips.map((r) => r.left)), Math.min(...chips.map((r) => r.top)),
      Math.max(...chips.map((r) => r.right)) - Math.min(...chips.map((r) => r.left)),
      Math.max(...chips.map((r) => r.bottom)) - Math.min(...chips.map((r) => r.top)),
    ));
  }
  for (const sel of ['.assist', '.controls', '.my-melds']) {
    const el = root.querySelector(sel);
    if (el) used.push(el.getBoundingClientRect());
  }
  // 手牌: ★/危険度の欄 + 牌 14 枚分
  const tile = hand.querySelector<HTMLElement>('.tile');
  const hr = hand.getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(hand).paddingTop) || 0;
  if (tile) {
    const tw = tile.getBoundingClientRect().width;
    const hw = tw * 14.35;
    const cx = hr.left + hr.width / 2;
    used.push(new DOMRect(cx - hw / 2, hr.top + pad, hw, hr.height - pad));
  }
  // 2px 刻みで空きを求める
  const R = 2;
  const cols = Math.ceil(width / R);
  const rows = Math.ceil((bottom - top) / R);
  const free: boolean[][] = [];
  for (let j = 0; j < rows; j++) {
    free.push([]);
    const y = top + j * R;
    for (let i = 0; i < cols; i++) {
      const x = i * R;
      free[j].push(!used.some((u) => x + R > u.left && x < u.right && y + R > u.top && y < u.bottom));
    }
  }
  const html = mergeCells(free).map(([a, b, c, d]) =>
    `<div class="free-space blue free-lower" style="position:fixed;left:${a * R}px;top:${top + b * R}px;width:${(c - a) * R}px;height:${(d - b) * R}px"></div>`).join('');
  document.body.insertAdjacentHTML('beforeend', html);
}
