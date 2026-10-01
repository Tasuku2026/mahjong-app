// 危険度（放銃率）の推定。
// 公開情報（河・副露・ドラ表示牌・自分の手牌）だけから、各牌が各相手に当たる確率を見積もる。
import { Game } from '../core/game';
import { Kind, kindOf, isHonor, doraFromIndicator, toCounts } from '../core/tiles';
import { getWaits } from '../core/shanten';
import { evaluateWin } from '../core/yaku';
import { meldIsOpen } from '../core/types';

/** 相手 o に対して確実に安全な牌（現物: o の捨て牌、o のリーチ後に誰かが通した牌） */
export function safeKinds(g: Game, o: number): Set<Kind> {
  const p = g.players[o];
  const s = new Set<Kind>();
  for (const r of p.river) s.add(kindOf(r.tile));
  if (p.riichi) {
    for (const q of g.players) for (const r of q.river) if (r.seq > p.riichiSeq) s.add(kindOf(r.tile));
  }
  return s;
}

/**
 * 相手 o がテンパイしている確率の目安
 * リーチ: 1、副露3つ以上: 0.6、2つ: 0.35、1つ: 0.15、門前: 巡目に応じて 0〜0.35
 */
export function tenpaiProb(g: Game, o: number): number {
  const p = g.players[o];
  if (p.riichi) return 1;
  const open = p.melds.filter(meldIsOpen).length;
  if (open >= 3) return 0.6;
  if (open === 2) return 0.35;
  const byTurn = Math.min(0.35, Math.max(0, (p.discardCount - 5) * 0.03));
  if (open === 1) return Math.max(0.15, byTurn);
  return byTurn;
}

/**
 * 相手 o がテンパイしているとき、牌 k が当たる確率の目安（統計的な放銃率をもとにした概算）
 * visible: 見えている枚数（観測者視点）
 */
export function tileRisk(g: Game, o: number, k: Kind, visible: number[], safe: Set<Kind> = safeKinds(g, o)): number {
  if (safe.has(k)) return 0;
  if (isHonor(k)) {
    const v = visible[k];
    if (v >= 3) return 0.003;
    if (v === 2) return 0.02;
    if (v === 1) return 0.045;
    return 0.065;
  }
  const n = k % 9; // 0..8
  const pos = Math.min(n, 8 - n); // 0:1/9, 1:2/8, 2:3/7, 3:4/6, 4:5
  const suitBase = k - n;
  // 両面待ちの2つの形（左: n-2,n-1 / 右: n+1,n+2）が否定されているか
  const sideSafe = (d: number): boolean => {
    const a = n + d; // 筋の牌
    const near = n + Math.sign(d); // 壁の判定に使う隣の牌
    if (a < 0 || a > 8) return true; // その形はそもそもない
    if (safe.has(suitBase + a)) return true; // 筋
    if (visible[suitBase + near] >= 4) return true; // 壁（ノーチャンス）
    return false;
  };
  const left = sideSafe(-3);
  const right = sideSafe(3);
  let risk: number;
  if (left && right) risk = [0.025, 0.035, 0.045, 0.04, 0.04][pos];
  else if (left || right) risk = [0.06, 0.07, 0.075, 0.075, 0.08][pos];
  else risk = [0.06, 0.08, 0.095, 0.12, 0.125][pos];
  // 4枚目付近は単騎・シャンポンの可能性が下がる
  if (visible[k] >= 3) risk *= 0.6;
  return risk;
}

/** 観測者 seat から見た、各牌種の危険度（全相手合計の放銃確率の目安） */
export function dangerMap(g: Game, seat: number): number[] {
  const visible = g.visibleCounts(seat);
  const out = new Array(34).fill(0);
  for (let o = 0; o < 4; o++) {
    if (o === seat) continue;
    const t = tenpaiProb(g, o);
    if (t <= 0) continue;
    const safe = safeKinds(g, o);
    for (let k = 0; k < 34; k++) out[k] += t * tileRisk(g, o, k, visible, safe);
  }
  return out.map((x) => Math.min(1, x));
}

/** 相手ごとの危険度（UI 表示用） */
export function dangerByOpponent(g: Game, seat: number): { seat: number; tenpai: number; risk: number[] }[] {
  const visible = g.visibleCounts(seat);
  const res: { seat: number; tenpai: number; risk: number[] }[] = [];
  for (let o = 0; o < 4; o++) {
    if (o === seat) continue;
    const t = tenpaiProb(g, o);
    const safe = safeKinds(g, o);
    res.push({ seat: o, tenpai: t, risk: Array.from({ length: 34 }, (_, k) => t * tileRisk(g, o, k, visible, safe)) });
  }
  return res;
}

/** ドラかどうか */
export function isDoraKind(g: Game, k: Kind): boolean {
  return g.doraIndicators.some((t) => doraFromIndicator(kindOf(t)) === k);
}

/**
 * 相手の実際の手牌から求めた、各牌種でロンされる相手の一覧（透視）。
 * 役がない・フリテンでロンできない待ちは含めない。
 */
export function exactHits(g: Game, seat: number): number[][] {
  const hits: number[][] = Array.from({ length: 34 }, () => []);
  for (let o = 0; o < 4; o++) {
    if (o === seat) continue;
    const p = g.players[o];
    if (p.hand.length % 3 !== 1) continue;
    const waits = getWaits(toCounts(p.hand), p.melds.length);
    if (waits.length === 0 || g.isFuriten(p, waits)) continue;
    for (const k of waits) {
      const tile = k * 4 + 3;
      const r = evaluateWin({
        hand: [...p.hand, tile], melds: p.melds, winTile: tile, tsumo: false,
        riichi: p.riichi ? (p.doubleRiichi ? 2 : 1) : 0, seatWind: g.seatWind(o), roundWind: g.roundWindKind,
        doraIndicators: g.doraIndicators, uraIndicators: [], rules: g.rules,
      });
      if (r) hits[k].push(o);
    }
  }
  return hits;
}
