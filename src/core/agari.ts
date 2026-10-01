import { Kind, isYaochu } from './tiles';

export interface Group {
  type: 'shuntsu' | 'koutsu';
  kind: Kind; // 順子は先頭の牌
}

export interface Decomposition {
  pair: Kind;
  groups: Group[];
}

/** 3n+2枚の手牌を雀頭+面子に分解する（全通り） */
export function decompose(counts: number[]): Decomposition[] {
  const c = counts.slice();
  const out: Decomposition[] = [];
  const groups: Group[] = [];

  const rec = (i: number, pair: Kind): void => {
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) {
      out.push({ pair, groups: groups.slice() });
      return;
    }
    if (c[i] >= 3) {
      c[i] -= 3;
      groups.push({ type: 'koutsu', kind: i });
      rec(i, pair);
      groups.pop();
      c[i] += 3;
    }
    if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      groups.push({ type: 'shuntsu', kind: i });
      rec(i, pair);
      groups.pop();
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
  };

  for (let p = 0; p < 34; p++) {
    if (c[p] >= 2) {
      c[p] -= 2;
      rec(0, p);
      c[p] += 2;
    }
  }
  return out;
}

export function isChiitoi(counts: number[]): boolean {
  let pairs = 0;
  for (let i = 0; i < 34; i++) {
    if (counts[i] === 2) pairs++;
    else if (counts[i] !== 0) return false;
  }
  return pairs === 7;
}

export function isKokushi(counts: number[]): boolean {
  let pair = false;
  for (let i = 0; i < 34; i++) {
    if (isYaochu(i)) {
      if (counts[i] === 0) return false;
      if (counts[i] === 2) pair = true;
      if (counts[i] > 2) return false;
    } else if (counts[i] > 0) return false;
  }
  return pair;
}
