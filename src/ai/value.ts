// 手の価値の見積もり（目指す役・打点・和了率・期待値）
import { Game } from '../core/game';
import {
  Kind, Tile, kindOf, toCounts, isHonor, isYaochu, isDragon, suitOf, doraFromIndicator, isRedTile, WIND_NAMES,
} from '../core/tiles';
import { calcShanten, getWaits, shantenChiitoi } from '../core/shanten';
import { evaluateWin, calcBase, ronPoints, tsumoPoints, WinResult } from '../core/yaku';
import { meldIsOpen } from '../core/types';

export interface WaitValue {
  kind: Kind;
  /** 見えていない残り枚数 */
  remain: number;
  /** ロン時の点数（役なしなら0） */
  ron: number;
  /** ツモ時の合計点数 */
  tsumo: number;
  result: WinResult | null;
}

export interface Outlook {
  shanten: number;
  /** 目指せる役（見込み） */
  yaku: string[];
  /** 和了したときの見込み点数 */
  points: number;
  /** 和了率の目安 (0..1) */
  winProb: number;
  /** 期待値 = 和了率 × 点数 */
  ev: number;
  /** テンパイ時の待ちごとの点数 */
  waits: WaitValue[];
  /** リーチ前提の見積もりか */
  assumeRiichi: boolean;
}

const DRAGON_NAMES: Record<number, string> = { 31: '白', 32: '發', 33: '中' };

/** テンパイ形（13枚）の待ちごとの点数 */
export function tenpaiWaits(g: Game, seat: number, hand: Tile[], unseen: number[], assumeRiichi: boolean): WaitValue[] {
  const p = g.players[seat];
  const waits = getWaits(toCounts(hand), p.melds.length);
  const dealer = seat === g.dealer;
  const riichi = (p.riichi ? (p.doubleRiichi ? 2 : 1) : assumeRiichi ? 1 : 0) as 0 | 1 | 2;
  return waits.map((k) => {
    // 和了牌として使う個別牌（赤以外を優先）
    const tile = k * 4 + 3;
    const base = {
      hand: [...hand, tile], melds: p.melds, winTile: tile, riichi,
      seatWind: g.seatWind(seat), roundWind: g.roundWindKind,
      doraIndicators: g.doraIndicators, uraIndicators: [], rules: g.rules,
    };
    const ron = evaluateWin({ ...base, tsumo: false });
    const tsumo = evaluateWin({ ...base, tsumo: true });
    const tp = tsumo ? tsumoPoints(tsumo.base, dealer) : null;
    return {
      kind: k,
      remain: unseen[k],
      ron: ron ? ronPoints(ron.base, dealer) : 0,
      tsumo: tp ? (dealer ? tp.other * 3 : tp.dealer + tp.other * 2) : 0,
      result: ron ?? tsumo,
    };
  });
}

/** 二項分布: n 回の試行で k 回以上成功する確率 */
function atLeast(n: number, k: number, p: number): number {
  if (k <= 0) return 1;
  if (n < k) return 0;
  let sum = 0;
  let c = 1; // C(n, i)
  for (let i = 0; i < k; i++) {
    sum += c * Math.pow(p, i) * Math.pow(1 - p, n - i);
    c = (c * (n - i)) / (i + 1);
  }
  return Math.max(0, Math.min(1, 1 - sum));
}

/** 受け入れ枚数（最良の打牌後） */
function bestUkeire(counts: number[], meldCount: number, unseen: number[]): number {
  const s0 = calcShanten(counts, meldCount);
  const total = counts.reduce((a, b) => a + b, 0);
  const calc = (c: number[], s: number) => {
    let u = 0;
    for (let j = 0; j < 34; j++) {
      if (unseen[j] <= 0 || c[j] >= 4) continue;
      c[j]++;
      if (calcShanten(c, meldCount) < s) u += unseen[j];
      c[j]--;
    }
    return u;
  };
  if (total % 3 === 1) return calc(counts.slice(), s0);
  let best = 0;
  const c = counts.slice();
  for (let k = 0; k < 34; k++) {
    if (c[k] === 0) continue;
    c[k]--;
    if (calcShanten(c, meldCount) === s0) best = Math.max(best, calc(c, s0));
    c[k]++;
  }
  return best;
}

/** 目指せる役の見込みと、ドラを含む翻数の目安 */
function yakuProspects(g: Game, seat: number, hand: Tile[]): { names: string[]; han: number; hasYaku: boolean } {
  const p = g.players[seat];
  const all = [...hand, ...p.melds.flatMap((m) => m.tiles)];
  const kinds = all.map(kindOf);
  const counts = toCounts(all);
  const closed = p.melds.every((m) => !meldIsOpen(m));
  const names: string[] = [];
  let han = 0;
  let hasYaku = false;

  if (closed) {
    names.push(p.riichi ? '立直' : '立直（予定）');
    han += 1;
    hasYaku = true;
  }
  // 役牌
  const valuable = (k: Kind) => isDragon(k) || k === g.seatWind(seat) || k === g.roundWindKind;
  for (let k = 27; k < 34; k++) {
    if (!valuable(k)) continue;
    const label = isDragon(k) ? `役牌 ${DRAGON_NAMES[k]}` : `役牌 ${WIND_NAMES[k - 27]}`;
    const dbl = (k === g.seatWind(seat) ? 1 : 0) + (k === g.roundWindKind ? 1 : 0) + (isDragon(k) ? 1 : 0);
    if (counts[k] >= 3) {
      names.push(label);
      han += dbl;
      hasYaku = true;
    } else if (counts[k] === 2) {
      names.push(`${label}（あと1枚）`);
      han += dbl * 0.4;
      hasYaku = true;
    }
  }
  // 断幺九
  const yaochu = kinds.filter(isYaochu).length;
  const openYaochu = p.melds.some((m) => m.tiles.some((t) => isYaochu(kindOf(t))));
  if (!openYaochu && yaochu <= 2 && (closed || g.rules.kuitan)) {
    names.push('断幺九');
    han += yaochu === 0 ? 1 : 0.6;
    hasYaku = true;
  }
  // 混一色・清一色
  const suitCount = [0, 0, 0];
  for (const k of kinds) if (!isHonor(k)) suitCount[suitOf(k)]++;
  const main = suitCount.indexOf(Math.max(...suitCount));
  const off = suitCount.reduce((a, b, i) => (i === main ? a : a + b), 0);
  const honors = kinds.filter(isHonor).length;
  if (off <= 1 && suitCount[main] >= 7) {
    if (honors === 0 && off === 0) {
      names.push('清一色');
      han += closed ? 6 : 5;
    } else {
      names.push('混一色');
      han += (closed ? 3 : 2) * (off === 0 ? 1 : 0.7);
    }
    hasYaku = true;
  }
  // 七対子
  if (closed && p.melds.length === 0 && shantenChiitoi(toCounts(hand)) <= 2) {
    const pairs = toCounts(hand).filter((c) => c >= 2).length;
    if (pairs >= 4) names.push('七対子');
  }
  // 対々和
  const triples = counts.filter((c) => c >= 3).length;
  const pairsAll = counts.filter((c) => c === 2).length;
  if (p.melds.every((m) => m.type !== 'chi') && triples + pairsAll >= 5 && triples >= 2) {
    names.push('対々和');
    han += 1;
    hasYaku = true;
  }
  // ドラ
  let dora = 0;
  for (const ind of g.doraIndicators) {
    const d = doraFromIndicator(kindOf(ind));
    dora += kinds.filter((k) => k === d).length;
  }
  if (g.rules.aka) dora += all.filter(isRedTile).length;
  if (dora > 0) names.push(`ドラ${dora}`);
  han += dora;
  return { names: [...new Set(names)], han, hasYaku };
}

/**
 * 手の見通し。hand は 13枚形 または 14枚形（ツモ直後）。
 * 14枚形の場合は最も良い打牌をした後を想定する。
 */
export function outlook(g: Game, seat: number, hand: Tile[] = g.players[seat].hand): Outlook {
  const p = g.players[seat];
  const unseen = g.visibleCounts(seat).map((v) => Math.max(0, 4 - v));
  const counts = toCounts(hand);
  const shanten = calcShanten(counts, p.melds.length);
  const closed = p.melds.every((m) => !meldIsOpen(m));
  const dealer = seat === g.dealer;
  const turnsLeft = Math.max(0, Math.floor(g.live.length / 4));
  const N = Math.max(1, unseen.reduce((a, b) => a + b, 0));

  // テンパイ（13枚）なら待ちごとに正確に計算
  if (shanten === 0 && hand.length % 3 === 1) {
    const assumeRiichi = closed && !p.riichi;
    const waits = tenpaiWaits(g, seat, hand, unseen, assumeRiichi);
    const remain = waits.reduce((a, w) => a + w.remain, 0);
    const valid = waits.filter((w) => w.ron > 0 || w.tsumo > 0);
    const validRemain = valid.reduce((a, w) => a + w.remain, 0);
    const points = validRemain > 0
      ? valid.reduce((a, w) => a + w.remain * (w.ron * 0.6 + w.tsumo * 0.4), 0) / validRemain
      : 0;
    // 1巡あたり: 自分のツモ + 他家3人の捨て牌からのロン
    // 1巡あたり: 自分のツモ + 他家の捨て牌からのロン（相手は警戒するので控えめに）
    const perTurn = Math.min(0.6, (validRemain / N) * 1.4);
    // 他家に先に和了される分を差し引く
    const winProb = validRemain > 0 ? atLeast(turnsLeft, 1, perTurn) * 0.7 : 0;
    const names = valid[0]?.result?.yaku.map((y) => y.name) ?? [];
    const r = valid[0]?.result;
    if (r && (r.dora || r.aka)) names.push(`ドラ${r.dora + r.aka}`);
    return { shanten, yaku: names, points: Math.round(points / 100) * 100, winProb, ev: winProb * points, waits, assumeRiichi: assumeRiichi && remain > 0 };
  }

  // それ以外は概算
  const pros = yakuProspects(g, seat, hand);
  let points = 0;
  if (pros.hasYaku) {
    const han = Math.max(1, Math.round(pros.han + (closed ? 0.3 : 0)));
    const { base } = calcBase(han, closed ? 40 : 30, 0, g.rules.kiriage);
    points = ronPoints(base, dealer);
  }
  const ukeire = bestUkeire(counts, p.melds.length, unseen);
  // 向聴数ごとの和了率の目安（残り12巡程度・標準的な受け入れのとき）を、残り巡目と受け入れ枚数で補正する
  const s = Math.min(shanten, 5);
  const base = [0.5, 0.35, 0.22, 0.12, 0.06, 0.03][s];
  const typical = [8, 20, 35, 50, 60, 70][s];
  const timeFactor = Math.pow(Math.min(1.2, turnsLeft / 12), s + 1);
  const ukeFactor = Math.min(1.4, Math.max(0.5, Math.sqrt(ukeire / typical)));
  const winProb = pros.hasYaku ? Math.min(0.9, base * timeFactor * ukeFactor) : 0;
  return { shanten, yaku: pros.names, points, winProb, ev: winProb * points, waits: [], assumeRiichi: closed };
}

