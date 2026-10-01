// 牌の表現
// Tile: 0..135 の個別牌ID（同じ種類の牌が4枚ずつ）
// Kind: 0..33 の牌の種類
//   0-8: 萬子 1-9, 9-17: 筒子 1-9, 18-26: 索子 1-9
//   27-30: 東南西北, 31-33: 白發中

export type Tile = number;
export type Kind = number;

export const EAST = 27;
export const SOUTH = 28;
export const WEST = 29;
export const NORTH = 30;
export const HAKU = 31;
export const HATSU = 32;
export const CHUN = 33;

/** 赤ドラとして扱う個別牌（各色の5の1枚目） */
export const RED_TILES: ReadonlySet<Tile> = new Set([4 * 4, 13 * 4, 22 * 4]);

export const kindOf = (t: Tile): Kind => t >> 2;
export const isRedTile = (t: Tile): boolean => RED_TILES.has(t);
export const isHonor = (k: Kind): boolean => k >= 27;
export const isTerminal = (k: Kind): boolean => k < 27 && (k % 9 === 0 || k % 9 === 8);
export const isYaochu = (k: Kind): boolean => isHonor(k) || isTerminal(k);
export const isSimple = (k: Kind): boolean => !isYaochu(k);
export const isDragon = (k: Kind): boolean => k >= 31;
export const isWind = (k: Kind): boolean => k >= 27 && k <= 30;
/** 0:萬 1:筒 2:索 3:字 */
export const suitOf = (k: Kind): number => (k < 27 ? Math.floor(k / 9) : 3);
/** 数牌の数字 (1-9) */
export const numOf = (k: Kind): number => (k % 9) + 1;

/** ドラ表示牌からドラの種類を求める */
export function doraFromIndicator(k: Kind): Kind {
  if (k < 27) return Math.floor(k / 9) * 9 + ((k % 9) + 1) % 9;
  if (k < 31) return 27 + ((k - 27 + 1) % 4);
  return 31 + ((k - 31 + 1) % 3);
}

export function toCounts(tiles: readonly Tile[]): number[] {
  const c = new Array(34).fill(0);
  for (const t of tiles) c[kindOf(t)]++;
  return c;
}

export function sortTiles(tiles: Tile[]): Tile[] {
  return tiles.sort((a, b) => a - b);
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const KANJI_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const HONOR_NAMES = ['東', '南', '西', '北', '白', '發', '中'];
const SUIT_NAMES = ['萬', '筒', '索'];

/** 表示用の短い名前（例: 一萬, 5筒, 東） */
export function kindName(k: Kind): string {
  if (k >= 27) return HONOR_NAMES[k - 27];
  const s = suitOf(k);
  return (s === 0 ? KANJI_NUM[k % 9] : String(numOf(k))) + SUIT_NAMES[s];
}

/** 牌面表示用（上段/下段） */
export function tileFace(k: Kind): { top: string; bottom: string } {
  if (k >= 27) return { top: HONOR_NAMES[k - 27], bottom: '' };
  const s = suitOf(k);
  return { top: s === 0 ? KANJI_NUM[k % 9] : String(numOf(k)), bottom: SUIT_NAMES[s] };
}

export const WIND_NAMES = ['東', '南', '西', '北'];

/**
 * 簡易表記からTileを作る（テスト用）。例: "123m456p789s11z" → z は 1-7 = 東南西北白發中
 * "0m" は赤五萬。同じ種類が複数あれば別の個別牌IDを割り当てる。
 */
export function parseTiles(s: string): Tile[] {
  const used = new Map<Kind, number>();
  const out: Tile[] = [];
  let digits: string[] = [];
  for (const ch of s) {
    if (/[0-9]/.test(ch)) {
      digits.push(ch);
      continue;
    }
    const base = { m: 0, p: 9, s: 18, z: 27 }[ch];
    if (base === undefined) continue;
    for (const d of digits) {
      const n = Number(d);
      const red = n === 0;
      const k = base + (red ? 4 : n - 1);
      if (red) {
        out.push(k * 4);
        used.set(k, Math.max(used.get(k) ?? 0, 1));
        continue;
      }
      // 赤(copy 0)以外の番号から割り当てる
      let copy = used.get(k) ?? 0;
      if (copy === 0 && RED_TILES.has(k * 4)) copy = 1;
      out.push(k * 4 + copy);
      used.set(k, copy + 1);
    }
    digits = [];
  }
  return out;
}
