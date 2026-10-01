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
