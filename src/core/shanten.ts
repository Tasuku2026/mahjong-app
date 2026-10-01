import { Kind, isYaochu } from './tiles';

/**
 * 向聴数（テンパイまであと何枚か）。-1 = 和了形, 0 = テンパイ
 * counts: 手牌（副露を除く）の種類別枚数, meldCount: 副露（暗槓含む）の数
 */
export function calcShanten(counts: number[], meldCount: number): number {
  let s = shantenNormal(counts, meldCount);
  if (meldCount === 0) {
    s = Math.min(s, shantenChiitoi(counts), shantenKokushi(counts));
  }
  return s;
}

export function shantenNormal(counts: number[], meldCount: number): number {
  const c = counts.slice();
  let best = 8;

  const search = (i: number, m: number, t: number, pair: number): void => {
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) {
      const tt = Math.min(t, 4 - m);
      const s = 8 - 2 * m - tt - pair;
      if (s < best) best = s;
      return;
    }
    if (best <= -1) return;
    // 面子
    if (c[i] >= 3) {
      c[i] -= 3;
      search(i, m + 1, t, pair);
      c[i] += 3;
    }
    if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      search(i, m + 1, t, pair);
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
    // 搭子（面子+搭子が4を超えるものは数えない）
    if (m + t < 4) {
      if (c[i] >= 2) {
        c[i] -= 2;
        search(i, m, t + 1, pair);
        c[i] += 2;
      }
      if (i < 27 && i % 9 <= 7 && c[i + 1] > 0) {
        c[i]--; c[i + 1]--;
        search(i, m, t + 1, pair);
        c[i]++; c[i + 1]++;
      }
      if (i < 27 && i % 9 <= 6 && c[i + 2] > 0) {
        c[i]--; c[i + 2]--;
        search(i, m, t + 1, pair);
        c[i]++; c[i + 2]++;
      }
    }
    // 孤立牌として扱う
    const n = c[i];
    c[i] = 0;
    search(i + 1, m, t, pair);
    c[i] = n;
  };

  // 雀頭あり
  for (let i = 0; i < 34; i++) {
    if (c[i] >= 2) {
      c[i] -= 2;
      search(0, meldCount, 0, 1);
      c[i] += 2;
    }
  }
  // 雀頭なし
  search(0, meldCount, 0, 0);
  return best;
}

export function shantenChiitoi(counts: number[]): number {
  let pairs = 0;
  let kinds = 0;
  for (let i = 0; i < 34; i++) {
    if (counts[i] > 0) kinds++;
    if (counts[i] >= 2) pairs++;
  }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

export function shantenKokushi(counts: number[]): number {
  let kinds = 0;
  let pair = 0;
  for (let i = 0; i < 34; i++) {
    if (!isYaochu(i)) continue;
    if (counts[i] > 0) kinds++;
    if (counts[i] >= 2) pair = 1;
  }
  return 13 - kinds - pair;
}

/** テンパイ形（3n+1枚）の待ち牌の種類一覧 */
export function getWaits(counts: number[], meldCount: number): Kind[] {
  const waits: Kind[] = [];
  const c = counts.slice();
  for (let k = 0; k < 34; k++) {
    if (c[k] >= 4) continue;
    c[k]++;
    if (calcShanten(c, meldCount) === -1) waits.push(k);
    c[k]--;
  }
  return waits;
}

// ---------------------------------------------------------------
// 14枚以上の牌の中に和了形が含まれるか（山が見える CPU 用）
// ---------------------------------------------------------------

// 状態ビット: (面子数 m: 0..4, 雀頭数 p: 0..1) → m * 2 + p
const bit = (m: number, p: number) => 1 << (Math.min(m, 4) * 2 + p);

function addMentsu(mask: number): number {
  let r = 0;
  for (let m = 0; m <= 4; m++) for (let p = 0; p <= 1; p++) if (mask & bit(m, p)) r |= bit(m + 1, p);
  return r;
}

function addPair(mask: number): number {
  let r = 0;
  for (let m = 0; m <= 4; m++) if (mask & bit(m, 0)) r |= bit(m, 1);
  return r;
}

function combine(a: number, b: number): number {
  let r = 0;
  for (let m1 = 0; m1 <= 4; m1++) for (let p1 = 0; p1 <= 1; p1++) {
    if (!(a & bit(m1, p1))) continue;
    for (let m2 = 0; m2 <= 4; m2++) for (let p2 = 0; p2 + p1 <= 1; p2++) {
      if (b & bit(m2, p2)) r |= bit(m1 + m2, p1 + p2);
    }
  }
  return r;
}

const suitMemo = new Map<number, number>();

/** 数牌1色（9種）から作れる (面子数, 雀頭数) の組み合わせ。使わない牌があってもよい */
function suitMask(c: number[]): number {
  let key = 0;
  for (let i = 0; i < 9; i++) key = key * 5 + c[i];
  const hit = suitMemo.get(key);
  if (hit !== undefined) return hit;
  let i = 0;
  while (i < 9 && c[i] === 0) i++;
  let res = bit(0, 0);
  if (i < 9) {
    c[i]--;
    res |= suitMask(c);
    c[i]++;
    if (c[i] >= 3) {
      c[i] -= 3;
      res |= addMentsu(suitMask(c));
      c[i] += 3;
    }
    if (i <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      res |= addMentsu(suitMask(c));
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
    if (c[i] >= 2) {
      c[i] -= 2;
      res |= addPair(suitMask(c));
      c[i] += 2;
    }
  }
  suitMemo.set(key, res);
  return res;
}

/** counts（何枚でもよい）の一部で和了形を作れるか */
export function containsWin(counts: number[], meldCount: number): boolean {
  const need = 4 - meldCount;
  let mask = bit(0, 0);
  for (let s = 0; s < 3; s++) mask = combine(mask, suitMask(counts.slice(s * 9, s * 9 + 9).map((x) => Math.min(x, 4))));
  for (let k = 27; k < 34; k++) {
    let h = bit(0, 0);
    if (counts[k] >= 2) h |= bit(0, 1);
    if (counts[k] >= 3) h |= bit(1, 0);
    mask = combine(mask, h);
  }
  for (let m = need; m <= 4; m++) if (mask & bit(m, 1)) return true;
  if (meldCount === 0) {
    if (counts.filter((x) => x >= 2).length >= 7) return true; // 七対子
    let kinds = 0;
    let pair = false;
    for (let k = 0; k < 34; k++) {
      if (!isYaochu(k)) continue;
      if (counts[k] > 0) kinds++;
      if (counts[k] >= 2) pair = true;
    }
    if (kinds === 13 && pair) return true; // 国士無双
  }
  return false;
}
