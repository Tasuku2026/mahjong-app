// プレイヤー向けの補助情報（残り枚数・危険度・ヒント・役と期待値）
import { Game } from '../core/game';
import { Kind, Tile, kindOf } from '../core/tiles';
import { CpuAgent, evaluateDiscards } from '../ai/cpu';
import { dangerByOpponent, exactHits } from '../ai/danger';
import { outlook, Outlook } from '../ai/value';

export type DangerMode = 'off' | 'est' | 'true';

export interface AssistSettings {
  remain: boolean;
  hint: boolean;
  outlook: boolean;
  danger: DangerMode;
  open: boolean;
}

export const DEFAULT_ASSIST: AssistSettings = { remain: false, hint: false, outlook: false, danger: 'off', open: false };

/** 自分から見た各牌の残り枚数（見えていない枚数） */
export function remainCounts(g: Game, seat = 0): number[] {
  return g.visibleCounts(seat).map((v) => Math.max(0, 4 - v));
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

/** 打牌候補ごとの情報 */
export function discardInfo(g: Game, tile: Tile, seat = 0): DiscardInfo {
  const p = g.players[seat];
  const unseen = remainCounts(g, seat);
  const e = evaluateDiscards(p.hand, p.melds.length, unseen, [tile])[0];
  const hand13 = p.hand.slice();
  hand13.splice(hand13.indexOf(tile), 1);
  return { tile, shanten: e.shanten, ukeire: e.ukeire, outlook: outlook(g, seat, hand13) };
}

const hintAgent = new CpuAgent(10);

/** おすすめの打牌（レベル10のCPUと同じ考え方） */
export function recommend(g: Game, candidates: Tile[], seat = 0): { tile: Tile; fold: boolean } {
  return hintAgent.decideDiscard(g, seat, candidates);
}
