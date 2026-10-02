// 役ごとの向聴数: 「その役の条件を満たしたまま和了形にするには、あと何枚入れ替えが必要か」
import { Kind } from '../core/tiles';

export interface ShantenOpts {
  /** すでに確定している面子の数（副露や、別に数えた必須の組） */
  meldCount: number;
  /** 使ってよい牌（使えない牌は手から外したものとして数える） */
  kindOk?: (k: Kind) => boolean;
  /** 順子の先頭として使ってよい牌（未指定なら数牌すべて） */
  shuntsuOk?: (k: Kind) => boolean;
  /** 刻子に使ってよい牌（未指定ならすべて） */
  koutsuOk?: (k: Kind) => boolean;
  /** 雀頭に使ってよい牌（未指定ならすべて） */
  pairOk?: (k: Kind) => boolean;
  /** 雀頭は別にそろっている */
  pairGiven?: boolean;
}

const all = () => true;
export const none = () => false;

/** 条件付きの向聴数（-1 = 和了形）。作れない場合も大きな数を返す */
export function restrictedShanten(counts: number[], o: ShantenOpts): number {
  const kindOk = o.kindOk ?? all;
  const seqOk = (k: Kind) => k < 27 && k % 9 <= 6 && (o.shuntsuOk ?? all)(k);
  const triOk = o.koutsuOk ?? all;
  const pairOk = o.pairOk ?? all;
  const c = counts.map((x, k) => (kindOk(k) ? Math.min(x, 4) : 0));
  let best = 8;

  const search = (i: number, m: number, t: number, p: number): void => {
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) {
      const s = 8 - 2 * m - Math.min(t, 4 - m) - p;
      if (s < best) best = s;
      return;
    }
    if (best <= -1) return;
    if (m < 4) {
      if (c[i] >= 3 && triOk(i)) {
        c[i] -= 3;
        search(i, m + 1, t, p);
        c[i] += 3;
      }
      if (seqOk(i) && c[i + 1] > 0 && c[i + 2] > 0) {
        c[i]--; c[i + 1]--; c[i + 2]--;
        search(i, m + 1, t, p);
        c[i]++; c[i + 1]++; c[i + 2]++;
      }
    }
    if (m + t < 4) {
      if (c[i] >= 2 && triOk(i)) {
        c[i] -= 2;
        search(i, m, t + 1, p);
        c[i] += 2;
      }
      // 両面・辺張（i,i+1）: i-1 か i から始まる順子の一部
      if (i < 27 && i % 9 <= 7 && c[i + 1] > 0 && (seqOk(i) || (i % 9 >= 1 && seqOk(i - 1)))) {
        c[i]--; c[i + 1]--;
        search(i, m, t + 1, p);
        c[i]++; c[i + 1]++;
      }
      // 嵌張（i,i+2）
      if (seqOk(i) && c[i + 2] > 0) {
        c[i]--; c[i + 2]--;
        search(i, m, t + 1, p);
        c[i]++; c[i + 2]++;
      }
    }
    const n = c[i];
    c[i] = 0;
    search(i + 1, m, t, p);
    c[i] = n;
  };

  const m0 = Math.min(4, o.meldCount);
  if (o.pairGiven) {
    search(0, m0, 0, 1);
  } else {
    for (let k = 0; k < 34; k++) {
      if (c[k] >= 2 && pairOk(k)) {
        c[k] -= 2;
        search(0, m0, 0, 1);
        c[k] += 2;
      }
    }
    search(0, m0, 0, 0);
  }
  return best;
}

/**
 * 決まった牌の組（例: 三色同順の 345m345p345s）を必ず含める場合の向聴数。
 * required: 牌の種類 → 必要枚数、reqMelds: その組が何面子分か、givesPair: 雀頭も含むか
 */
export function shantenWithRequired(
  counts: number[], required: Map<Kind, number>, reqMelds: number, givesPair: boolean, o: ShantenOpts,
): number {
  if (o.meldCount + reqMelds > 4) return Infinity;
  let missing = 0;
  const rest = counts.slice();
  for (const [k, n] of required) {
    const have = Math.min(rest[k], n);
    missing += n - have;
    rest[k] -= have;
  }
  const s = restrictedShanten(rest, { ...o, meldCount: o.meldCount + reqMelds, pairGiven: givesPair || o.pairGiven });
  return s + missing;
}
