import { Agent, CallAction, CallOptions, Game, TurnAction, TurnOptions } from '../core/game';
import { Kind, Tile, kindOf, toCounts, isHonor, isTerminal, isSimple, isDragon, isYaochu } from '../core/tiles';
import { calcShanten, getWaits } from '../core/shanten';
import { meldIsOpen } from '../core/types';

export interface DiscardEval {
  tile: Tile;
  shanten: number;
  /** 有効牌の残り枚数 */
  ukeire: number;
}

/** 各打牌候補の向聴数と受け入れ枚数 */
export function evaluateDiscards(hand: Tile[], meldCount: number, unseen: number[], candidates: Tile[]): DiscardEval[] {
  const counts = toCounts(hand);
  const seen = new Set<Kind>();
  const out: DiscardEval[] = [];
  for (const t of candidates) {
    const k = kindOf(t);
    if (seen.has(k)) continue;
    seen.add(k);
    counts[k]--;
    const s = calcShanten(counts, meldCount);
    let ukeire = 0;
    for (let j = 0; j < 34; j++) {
      if (unseen[j] <= 0 || counts[j] >= 4) continue;
      counts[j]++;
      if (calcShanten(counts, meldCount) < s) ukeire += unseen[j];
      counts[j]--;
    }
    counts[k]++;
    out.push({ tile: t, shanten: s, ukeire });
  }
  return out;
}

/** 孤立牌の切りやすさ（大きいほど先に切る） */
function isolationScore(k: Kind, counts: number[], valuable: (k: Kind) => boolean): number {
  if (isHonor(k)) {
    if (counts[k] >= 2) return 0;
    return valuable(k) ? 2 : 3;
  }
  let score = isTerminal(k) ? 1.5 : (k % 9 === 1 || k % 9 === 7) ? 1 : 0.5;
  for (let d = -2; d <= 2; d++) {
    if (d === 0) continue;
    const j = k + d;
    if (j < 0 || j >= 27 || Math.floor(j / 9) !== Math.floor(k / 9)) continue;
    if (counts[j] > 0) score -= 0.4;
  }
  return score;
}

export class CpuAgent implements Agent {
  constructor(public level: number) {}

  private unseen(g: Game, seat: number): number[] {
    return g.visibleCounts(seat).map((v) => Math.max(0, 4 - v));
  }

  private valuable(g: Game, seat: number) {
    return (k: Kind) => isDragon(k) || k === g.seatWind(seat) || k === g.roundWindKind;
  }

  /** レベルが低いほど選択ミスをする確率 */
  private get mistakeRate(): number {
    return Math.max(0, (10 - this.level) * 0.07);
  }

  async turn(g: Game, seat: number, opts: TurnOptions): Promise<TurnAction> {
    await g.ui.delay(550);
    const p = g.players[seat];
    if (opts.canTsumo) return { type: 'tsumo' };
    if (opts.canKyuushu) {
      const counts = toCounts(p.hand);
      let n = 0;
      for (let k = 0; k < 34; k++) if (isYaochu(k) && counts[k] > 0) n++;
      if (n >= 10 || this.level <= 3) return { type: 'kyuushu' };
    }
    if (p.riichi) {
      if (opts.ankanKinds.length > 0) return { type: 'ankan', kind: opts.ankanKinds[0] };
      return { type: 'discard', tile: opts.discardable[0] };
    }

    const unseen = this.unseen(g, seat);
    const counts = toCounts(p.hand);
    const curShanten = calcShanten(counts, p.melds.length);

    // 暗槓・加槓: 向聴数が悪くならなければする
    for (const k of opts.ankanKinds) {
      const c = counts.slice();
      c[k] = 0;
      if (calcShanten(c, p.melds.length + 1) <= curShanten) return { type: 'ankan', kind: k };
    }
    for (const k of opts.kakanKinds) {
      const c = counts.slice();
      c[k]--;
      if (calcShanten(c, p.melds.length) <= curShanten) return { type: 'kakan', kind: k };
    }

    const tile = this.chooseDiscard(g, seat, opts.discardable, unseen);

    if (opts.riichiTiles.length > 0) {
      // 最も待ち枚数が多くなるリーチ打牌
      let best: Tile | null = null;
      let bestWait = -1;
      for (const t of opts.riichiTiles) {
        const c = counts.slice();
        c[kindOf(t)]--;
        const w = getWaits(c, p.melds.length).reduce((a, k) => a + unseen[k], 0);
        if (w > bestWait) {
          bestWait = w;
          best = t;
        }
      }
      if (best !== null && (bestWait > 0 || this.level <= 4)) return { type: 'discard', tile: best, riichi: true };
    }
    return { type: 'discard', tile };
  }

  chooseDiscard(g: Game, seat: number, candidates: Tile[], unseen: number[]): Tile {
    const p = g.players[seat];
    const evals = evaluateDiscards(p.hand, p.melds.length, unseen, candidates);
    if (Math.random() < this.mistakeRate) {
      return evals[Math.floor(Math.random() * evals.length)].tile;
    }
    const counts = toCounts(p.hand);
    const valuable = this.valuable(g, seat);
    const isOpen = p.melds.some(meldIsOpen);
    evals.sort((a, b) => {
      if (a.shanten !== b.shanten) return a.shanten - b.shanten;
      if (a.ukeire !== b.ukeire) return b.ukeire - a.ukeire;
      const ka = kindOf(a.tile);
      const kb = kindOf(b.tile);
      let sa = isolationScore(ka, counts, valuable);
      let sb = isolationScore(kb, counts, valuable);
      // 鳴いてタンヤオを狙っているときは幺九牌を優先して切る
      if (isOpen) {
        sa += isSimple(ka) ? 0 : 1;
        sb += isSimple(kb) ? 0 : 1;
      }
      // 赤ドラは残す
      if (g.isRed(a.tile)) sa -= 1;
      if (g.isRed(b.tile)) sb -= 1;
      return sb - sa;
    });
    return evals[0].tile;
  }

  async call(g: Game, seat: number, tile: Tile, _from: number, opts: CallOptions): Promise<CallAction> {
    if (opts.canRon) return { type: 'ron' };
    if (this.level <= 2 && Math.random() < 0.15) {
      if (opts.pon.length) return { type: 'pon', tiles: opts.pon[0] };
      if (opts.chi.length) return { type: 'chi', tiles: opts.chi[0] };
    }
    const p = g.players[seat];
    const k = kindOf(tile);
    const valuable = this.valuable(g, seat);
    const curShanten = calcShanten(toCounts(p.hand), p.melds.length);

    const shantenAfter = (used: Tile[]): number => {
      const rest = p.hand.slice();
      for (const t of used) rest.splice(rest.indexOf(t), 1);
      return calcShanten(toCounts(rest), p.melds.length + 1);
    };

    // 役の見込みがあるか
    const hasYakuhaiMeld = p.melds.some((m) => valuable(kindOf(m.tiles[0])) && m.type !== 'chi');
    const tanyaoPossible = (used: Tile[]): boolean => {
      if (!g.rules.kuitan) return false;
      if (!isSimple(k)) return false;
      if (p.melds.some((m) => m.tiles.some((t) => !isSimple(kindOf(t))))) return false;
      const rest = p.hand.filter((t) => !used.includes(t));
      return rest.filter((t) => !isSimple(kindOf(t))).length <= 2;
    };

    for (const used of opts.pon) {
      if (valuable(k)) return { type: 'pon', tiles: used };
      if ((hasYakuhaiMeld || tanyaoPossible(used)) && shantenAfter(used) < curShanten) return { type: 'pon', tiles: used };
    }
    for (const used of opts.chi) {
      if ((hasYakuhaiMeld || tanyaoPossible(used)) && shantenAfter(used) < curShanten) return { type: 'chi', tiles: used };
    }
    return { type: 'pass' };
  }
}
