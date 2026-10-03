// プレイヤー向けの補助情報（残り牌・危険牌・おすすめ・見込み）
import { CallAction, CallOptions, Game, TurnAction, TurnOptions } from '../core/game';
import { Kind, Tile, kindOf, toCounts } from '../core/tiles';
import { calcShanten } from '../core/shanten';
import { CpuAgent, evaluateDiscards, LEVEL_ONI } from '../ai/cpu';
import { dangerByOpponent, exactHits } from '../ai/danger';
import { outlook, Outlook } from '../ai/value';
import { ronPoints } from '../core/yaku';

export type DangerMode = 'off' | 'est' | 'true';

export interface AssistSettings {
  remain: boolean;
  hint: boolean;
  outlook: boolean;
  danger: DangerMode;
  open: boolean;
}

export const DEFAULT_ASSIST: AssistSettings = { remain: false, hint: false, outlook: false, danger: 'off', open: false };

/** 自分から見た各牌の残り枚数（見えていない枚数）。openHands のときは他家の手牌も見えているものとして数える */
export function remainCounts(g: Game, seat = 0, openHands = false): number[] {
  const v = g.visibleCounts(seat);
  if (openHands) {
    for (const p of g.players) if (p.seat !== seat) for (const t of p.hand) v[kindOf(t)]++;
  }
  return v.map((x) => Math.max(0, 4 - x));
}

export interface TileDanger {
  /** 0..1 の放銃確率（推定）または 0/1（透視） */
  value: number;
  /** 当たる相手（透視モード） */
  hitBy: number[];
}

/** 手牌の各牌種の危険度 */
export function handDanger(g: Game, mode: DangerMode, seat = 0): Map<Kind, TileDanger> {
  const out = new Map<Kind, TileDanger>();
  const kinds = new Set(g.players[seat].hand.map(kindOf));
  if (mode === 'est') {
    const byOpp = dangerByOpponent(g, seat);
    for (const k of kinds) {
      // 少なくとも1人に当たる確率
      let safe = 1;
      for (const o of byOpp) safe *= 1 - o.risk[k];
      out.set(k, { value: 1 - safe, hitBy: [] });
    }
  } else if (mode === 'true') {
    const hits = exactHits(g, seat);
    for (const k of kinds) out.set(k, { value: hits[k].length ? 1 : 0, hitBy: hits[k] });
  }
  return out;
}

export interface DiscardInfo {
  tile: Tile;
  shanten: number;
  ukeire: number;
  outlook: Outlook;
}

/** 打牌候補ごとの情報（openHands: カンニング中は相手の手牌も見えているものとして数える） */
export function discardInfo(g: Game, tile: Tile, seat = 0, openHands = false): DiscardInfo {
  const p = g.players[seat];
  const unseen = remainCounts(g, seat, openHands);
  const e = evaluateDiscards(p.hand, p.melds.length, unseen, [tile])[0];
  const hand13 = p.hand.slice();
  hand13.splice(hand13.indexOf(tile), 1);
  return { tile, shanten: e.shanten, ukeire: e.ukeire, outlook: outlook(g, seat, hand13, unseen) };
}

const hintAgent = new CpuAgent(10);
/** カンニング中は、相手の手牌が見えるレベル鬼と同じ判断にする */
const hintAgentOpen = new CpuAgent(LEVEL_ONI);

/** おすすめ（ふだんはレベル10、カンニング中はレベル鬼のCPUと同じ判断） */
export type Advice =
  | { kind: 'turn'; action: TurnAction; fold: boolean }
  | { kind: 'call'; action: CallAction };

export function adviseTurn(g: Game, opts: TurnOptions, seat = 0, openHands = false): Advice {
  const agent = openHands ? hintAgentOpen : hintAgent;
  const action = agent.decideTurn(g, seat, opts);
  const fold = action.type === 'discard' && !action.riichi && agent.decideDiscard(g, seat, opts.discardable).fold;
  return { kind: 'turn', action, fold };
}

export function adviseCall(g: Game, tile: Tile, from: number, opts: CallOptions, seat = 0, openHands = false): Advice {
  return { kind: 'call', action: (openHands ? hintAgentOpen : hintAgent).decideCall(g, seat, tile, from, opts) };
}

// ---------------------------------------------------------------
// 見込み: 捨てる牌ごとのくらべ（テンパイのとり方／テンパイの一歩手前）
// ---------------------------------------------------------------

export interface CompareRow {
  /** 捨てる牌（タップで選べるように、実際の牌ID） */
  tile: Tile;
  /** 待ち（テンパイ）または、引くとテンパイになる牌（一歩手前）と、その残り枚数 */
  tiles: { kind: Kind; remain: number; points?: number }[];
  /** 合計の残り枚数 */
  total: number;
  /** テンパイのときだけ: 点数・和了率 */
  points?: number;
  winProb?: number;
}

export interface CompareTable {
  mode: 'tenpai' | 'iishanten';
  rows: CompareRow[];
}

let compareCache: { key: string; table: CompareTable | null } | null = null;

/**
 * 14枚（自分の番）のとき、捨てる牌ごとの比較。
 * - テンパイにとれる捨て方が2つ以上 → 捨て方ごとの待ち・残り枚数・点数・和了率（和了率の高い順）
 * - テンパイの一歩手前 → 引くとテンパイになる牌が多い捨て方を上位3つ
 */
export function compareDiscards(g: Game, candidates: Tile[], seat = 0, openHands = false): CompareTable | null {
  const p = g.players[seat];
  if (p.riichi || p.hand.length % 3 !== 2) return null;
  const unseen = remainCounts(g, seat, openHands);
  const key = [p.hand.slice().sort((a, b) => a - b).join(','), candidates.join(','), unseen.join(''), p.melds.length, g.doraIndicators.join(',')].join('|');
  if (compareCache?.key === key) return compareCache.table;

  const evals = evaluateDiscards(p.hand, p.melds.length, unseen, candidates);
  const best = Math.min(...evals.map((e) => e.shanten));
  let table: CompareTable | null = null;
  const advancing = (hand13: Tile[], s: number) => {
    // 引くと向聴数が下がる牌
    const counts = toCounts(hand13);
    const out: { kind: Kind; remain: number }[] = [];
    for (let k = 0; k < 34; k++) {
      if (unseen[k] <= 0 || counts[k] >= 4) continue;
      counts[k]++;
      if (calcShanten(counts, p.melds.length) < s) out.push({ kind: k, remain: unseen[k] });
      counts[k]--;
    }
    return out;
  };
  const without = (t: Tile) => {
    const h = p.hand.slice();
    h.splice(h.indexOf(t), 1);
    return h;
  };

  if (best === 0) {
    const opts = evals.filter((e) => e.shanten === 0);
    if (opts.length >= 2) {
      const rows = opts.map((e) => {
        const o = outlook(g, seat, without(e.tile), unseen);
        const tiles = o.waits.map((w) => ({ kind: w.kind, remain: w.remain, points: Math.max(w.ron, w.tsumo) }));
        return { tile: e.tile, tiles, total: tiles.reduce((a, w) => a + w.remain, 0), points: o.points, winProb: o.winProb };
      });
      rows.sort((a, b) => (b.winProb! - a.winProb!) || (b.points! - a.points!));
      table = { mode: 'tenpai', rows };
    }
  } else if (best === 1) {
    const rows = evals.filter((e) => e.shanten === 1)
      .sort((a, b) => b.ukeire - a.ukeire)
      .slice(0, 3)
      .map((e) => {
        const tiles = advancing(without(e.tile), 1);
        return { tile: e.tile, tiles, total: tiles.reduce((a, w) => a + w.remain, 0) };
      });
    if (rows.length) table = { mode: 'iishanten', rows };
  }
  compareCache = { key, table };
  return table;
}

// ---------------------------------------------------------------
// 見込み: 鳴くかどうかのくらべ（スキップ・ポン・チー・カン）
// ---------------------------------------------------------------

export interface CallCompareRow {
  type: 'pass' | 'pon' | 'chi' | 'minkan' | 'ron';
  /** ポン・チーで使う手牌の2枚（ボタンと同じ並び） */
  tiles?: Tile[];
  /** 鳴いた後に捨てるとよい牌 */
  discard?: Tile;
  shanten: number;
  ukeire: number;
  winProb: number;
  points: number;
  hasYaku: boolean;
}

/** 13枚形（または鳴いた後の形）で、引くと向聴数が下がる牌の残り枚数 */
function ukeireOf(hand: Tile[], meldCount: number, unseen: number[]): number {
  const c = toCounts(hand);
  const s = calcShanten(c, meldCount);
  let u = 0;
  for (let k = 0; k < 34; k++) {
    if (unseen[k] <= 0 || c[k] >= 4) continue;
    c[k]++;
    if (calcShanten(c, meldCount) < s) u += unseen[k];
    c[k]--;
  }
  return u;
}

let callCache: { key: unknown; open: boolean; rows: CallCompareRow[] } | null = null;

/**
 * 鳴きの確認が出たとき、選んだ場合ごとの見通し。
 * ポン・チーは、鳴いた後にいちばん良い牌を捨てた形で比べる（鳴いた牌と同じ牌は捨てられないものとする）
 */
export function compareCalls(g: Game, tile: Tile, from: number, opts: CallOptions, seat = 0, openHands = false, key: unknown = null): CallCompareRow[] {
  if (key !== null && callCache && callCache.key === key && callCache.open === openHands) return callCache.rows;
  const p = g.players[seat];
  const unseen = remainCounts(g, seat, openHands);
  const rows: CallCompareRow[] = [];
  const row = (type: CallCompareRow['type'], hand13: Tile[], extra: Partial<CallCompareRow> = {}) => {
    const o = outlook(g, seat, hand13, unseen);
    rows.push({ type, shanten: o.shanten, ukeire: ukeireOf(hand13, p.melds.length, unseen), winProb: o.winProb, points: o.points, hasYaku: o.winProb > 0 || o.yaku.some((n) => !n.startsWith('ドラ')), ...extra });
  };
  if (opts.canRon && opts.ronResult) {
    rows.push({ type: 'ron', shanten: -1, ukeire: 0, winProb: 1, points: ronPoints(opts.ronResult.base, seat === g.dealer), hasYaku: true });
  }
  row('pass', p.hand);
  // 鳴いた形をいったん作って計算し、すぐに元に戻す（画面には出さない）
  const simulate = (type: 'pon' | 'chi' | 'minkan', use: Tile[]) => {
    const saveHand = p.hand;
    const saveMelds = p.melds;
    try {
      const rest = p.hand.filter((t) => !use.includes(t));
      p.melds = [...saveMelds, { type, tiles: [...use, tile], calledTile: tile, from }];
      if (type === 'minkan') {
        p.hand = rest;
        row(type, rest);
        return;
      }
      const cands = rest.filter((t) => kindOf(t) !== kindOf(tile));
      const evals = evaluateDiscards(rest, p.melds.length, unseen, cands.length ? cands : rest);
      evals.sort((a, b) => (a.shanten - b.shanten) || (b.ukeire - a.ukeire));
      const best = evals[0];
      const hand10 = rest.slice();
      hand10.splice(hand10.indexOf(best.tile), 1);
      p.hand = hand10;
      row(type, hand10, { tiles: use, discard: best.tile });
    } finally {
      p.hand = saveHand;
      p.melds = saveMelds;
    }
  };
  for (const use of opts.pon) simulate('pon', use);
  for (const use of opts.chi) simulate('chi', use);
  if (opts.minkan) simulate('minkan', opts.minkan);
  callCache = { key, open: openHands, rows };
  return rows;
}
