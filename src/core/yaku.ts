import { decompose, isChiitoi, isKokushi } from './agari';
import {
  Kind, Tile, kindOf, toCounts, isYaochu, isHonor, isTerminal, isSimple, isDragon, isWind,
  suitOf, doraFromIndicator, isRedTile, HAKU, HATSU, CHUN, WIND_NAMES,
} from './tiles';
import { Meld, Rules, meldIsOpen } from './types';

export interface WinInput {
  /** 副露以外の手牌（和了牌を含む） */
  hand: Tile[];
  melds: Meld[];
  winTile: Tile;
  tsumo: boolean;
  /** 0: なし, 1: リーチ, 2: ダブルリーチ */
  riichi: 0 | 1 | 2;
  ippatsu?: boolean;
  haitei?: boolean;
  houtei?: boolean;
  rinshan?: boolean;
  chankan?: boolean;
  tenhou?: boolean;
  chiihou?: boolean;
  seatWind: Kind;
  roundWind: Kind;
  doraIndicators: Tile[];
  uraIndicators: Tile[];
  rules: Rules;
}

export interface YakuItem {
  name: string;
  han: number;
  /** 役満の倍数（役満でなければ0/未定義） */
  yakuman?: number;
}

export interface WinResult {
  yaku: YakuItem[];
  /** ドラ込みの合計翻数（役満時は0） */
  han: number;
  fu: number;
  dora: number;
  aka: number;
  ura: number;
  yakuman: number;
  /** 基本点 */
  base: number;
  /** 満貫・跳満などの名前（なければ空文字） */
  limit: string;
}

type Wait = 'ryanmen' | 'kanchan' | 'penchan' | 'tanki' | 'shanpon';

interface FullGroup {
  type: 'shuntsu' | 'koutsu' | 'kantsu';
  kind: Kind;
  /** 副露しているか（暗槓は false） */
  open: boolean;
  /** ロンで完成した刻子（明刻扱い） */
  ronCompleted?: boolean;
}

interface Candidate {
  yaku: YakuItem[];
  fu: number;
}

const GREEN: ReadonlySet<Kind> = new Set([19, 20, 21, 23, 25, HATSU]);
const DRAGON_NAMES: Record<number, string> = { [HAKU]: '役牌 白', [HATSU]: '役牌 發', [CHUN]: '役牌 中' };

export function evaluateWin(inp: WinInput): WinResult | null {
  const counts = toCounts(inp.hand);
  const winKind = kindOf(inp.winTile);
  const menzen = inp.melds.every((m) => !meldIsOpen(m));
  const allTiles: Tile[] = [...inp.hand, ...inp.melds.flatMap((m) => m.tiles)];
  const allKinds = allTiles.map(kindOf);
  const situ = situationalYaku(inp, menzen);

  const candidates: Candidate[] = [];

  if (inp.melds.length === 0 && isKokushi(counts)) {
    candidates.push({ yaku: [{ name: '国士無双', han: 0, yakuman: 1 }], fu: 0 });
  }
  if (inp.melds.length === 0 && isChiitoi(counts)) {
    candidates.push({ yaku: chiitoiYaku(allKinds, inp), fu: 25 });
  }

  const meldGroups: FullGroup[] = inp.melds.map((m) => {
    const kinds = m.tiles.map(kindOf);
    const kind = Math.min(...kinds);
    if (m.type === 'chi') return { type: 'shuntsu', kind, open: true };
    if (m.type === 'pon') return { type: 'koutsu', kind, open: true };
    return { type: 'kantsu', kind, open: m.type !== 'ankan' };
  });

  for (const d of decompose(counts)) {
    // 和了牌がどの面子/雀頭に入ったかの全パターン
    const placements: { wait: Wait; index: number }[] = [];
    if (d.pair === winKind) placements.push({ wait: 'tanki', index: -1 });
    d.groups.forEach((g, i) => {
      if (g.type === 'koutsu') {
        if (g.kind === winKind) placements.push({ wait: 'shanpon', index: i });
      } else if (winKind >= g.kind && winKind <= g.kind + 2) {
        const pos = winKind - g.kind;
        let wait: Wait;
        if (pos === 1) wait = 'kanchan';
        else if (pos === 0) wait = g.kind % 9 === 6 ? 'penchan' : 'ryanmen';
        else wait = g.kind % 9 === 0 ? 'penchan' : 'ryanmen';
        placements.push({ wait, index: i });
      }
    });
    for (const p of placements) {
      const groups: FullGroup[] = d.groups.map((g, i) => ({
        type: g.type,
        kind: g.kind,
        open: false,
        ronCompleted: g.type === 'koutsu' && i === p.index && !inp.tsumo,
      }));
      groups.push(...meldGroups);
      candidates.push(normalYaku(groups, d.pair, p.wait, menzen, allKinds, counts, inp));
    }
  }

  let best: WinResult | null = null;
  for (const c of candidates) {
    const r = finalize(c, situ, allTiles, inp);
    if (!r) continue;
    if (!best || r.base > best.base || (r.base === best.base && (r.han > best.han || (r.han === best.han && r.fu > best.fu)))) {
      best = r;
    }
  }
  return best;
}

function situationalYaku(inp: WinInput, menzen: boolean): YakuItem[] {
  const y: YakuItem[] = [];
  if (inp.tenhou) y.push({ name: '天和', han: 0, yakuman: 1 });
  if (inp.chiihou) y.push({ name: '地和', han: 0, yakuman: 1 });
  if (inp.riichi === 2) y.push({ name: 'ダブル立直', han: 2 });
  else if (inp.riichi === 1) y.push({ name: '立直', han: 1 });
  if (inp.riichi && inp.ippatsu) y.push({ name: '一発', han: 1 });
  if (menzen && inp.tsumo) y.push({ name: '門前清自摸和', han: 1 });
  if (inp.haitei) y.push({ name: '海底摸月', han: 1 });
  if (inp.houtei) y.push({ name: '河底撈魚', han: 1 });
  if (inp.rinshan) y.push({ name: '嶺上開花', han: 1 });
  if (inp.chankan) y.push({ name: '槍槓', han: 1 });
  return y;
}

function colorYaku(allKinds: Kind[], menzen: boolean, y: YakuItem[]): void {
  const suits = new Set(allKinds.filter((k) => !isHonor(k)).map(suitOf));
  const hasHonor = allKinds.some(isHonor);
  if (suits.size === 1) {
    if (hasHonor) y.push({ name: '混一色', han: menzen ? 3 : 2 });
    else y.push({ name: '清一色', han: menzen ? 6 : 5 });
  }
}

function chiitoiYaku(allKinds: Kind[], inp: WinInput): YakuItem[] {
  const y: YakuItem[] = [];
  if (allKinds.every(isHonor)) return [{ name: '字一色', han: 0, yakuman: 1 }];
  y.push({ name: '七対子', han: 2 });
  if (allKinds.every(isSimple)) y.push({ name: '断幺九', han: 1 });
  if (allKinds.every(isYaochu)) y.push({ name: '混老頭', han: 2 });
  colorYaku(allKinds, true, y);
  return y;
}

function isValuePair(k: Kind, inp: WinInput): number {
  let v = 0;
  if (isDragon(k)) v++;
  if (k === inp.seatWind) v++;
  if (k === inp.roundWind) v++;
  return v;
}

function normalYaku(
  groups: FullGroup[], pair: Kind, wait: Wait, menzen: boolean,
  allKinds: Kind[], handCounts: number[], inp: WinInput,
): Candidate {
  const y: YakuItem[] = [];
  const ym: YakuItem[] = [];
  const shuntsu = groups.filter((g) => g.type === 'shuntsu');
  const kous = groups.filter((g) => g.type !== 'shuntsu');
  const anko = kous.filter((g) => !g.open && !g.ronCompleted).length;
  const kans = groups.filter((g) => g.type === 'kantsu').length;
  const dragonKous = kous.filter((g) => isDragon(g.kind)).length;
  const windKous = kous.filter((g) => isWind(g.kind)).length;

  // ---- 役満 ----
  if (anko === 4) ym.push({ name: '四暗刻', han: 0, yakuman: 1 });
  if (dragonKous === 3) ym.push({ name: '大三元', han: 0, yakuman: 1 });
  if (windKous === 4) ym.push({ name: '大四喜', han: 0, yakuman: 1 });
  else if (windKous === 3 && isWind(pair)) ym.push({ name: '小四喜', han: 0, yakuman: 1 });
  if (allKinds.every(isHonor)) ym.push({ name: '字一色', han: 0, yakuman: 1 });
  if (allKinds.every(isTerminal)) ym.push({ name: '清老頭', han: 0, yakuman: 1 });
  if (allKinds.every((k) => GREEN.has(k))) ym.push({ name: '緑一色', han: 0, yakuman: 1 });
  if (kans === 4) ym.push({ name: '四槓子', han: 0, yakuman: 1 });
  if (inp.melds.length === 0 && isChuuren(handCounts)) ym.push({ name: '九蓮宝燈', han: 0, yakuman: 1 });
  if (ym.length > 0) return { yaku: ym, fu: 0 };

  // ---- 通常役 ----
  const pinfu = menzen && shuntsu.length === 4 && isValuePair(pair, inp) === 0 && wait === 'ryanmen';
  if (pinfu) y.push({ name: '平和', han: 1 });

  if (allKinds.every(isSimple) && (menzen || inp.rules.kuitan)) y.push({ name: '断幺九', han: 1 });

  if (menzen) {
    const m = new Map<Kind, number>();
    for (const g of shuntsu) m.set(g.kind, (m.get(g.kind) ?? 0) + 1);
    let peiko = 0;
    for (const n of m.values()) peiko += Math.floor(n / 2);
    if (peiko >= 2) y.push({ name: '二盃口', han: 3 });
    else if (peiko === 1) y.push({ name: '一盃口', han: 1 });
  }

  for (const g of kous) {
    if (isDragon(g.kind)) y.push({ name: DRAGON_NAMES[g.kind], han: 1 });
    if (g.kind === inp.seatWind) y.push({ name: `自風 ${WIND_NAMES[g.kind - 27]}`, han: 1 });
    if (g.kind === inp.roundWind) y.push({ name: `場風 ${WIND_NAMES[g.kind - 27]}`, han: 1 });
  }

  // 三色同順
  for (let n = 0; n < 7; n++) {
    if ([0, 1, 2].every((s) => shuntsu.some((g) => g.kind === s * 9 + n))) {
      y.push({ name: '三色同順', han: menzen ? 2 : 1 });
      break;
    }
  }
  // 一気通貫
  for (let s = 0; s < 3; s++) {
    if ([0, 3, 6].every((n) => shuntsu.some((g) => g.kind === s * 9 + n))) {
      y.push({ name: '一気通貫', han: menzen ? 2 : 1 });
      break;
    }
  }
  // 混全帯幺九 / 純全帯幺九
  const groupHasYaochu = (g: FullGroup): boolean =>
    g.type === 'shuntsu' ? g.kind % 9 === 0 || g.kind % 9 === 6 : isYaochu(g.kind);
  if (shuntsu.length > 0 && isYaochu(pair) && groups.every(groupHasYaochu)) {
    if (allKinds.some(isHonor)) y.push({ name: '混全帯幺九', han: menzen ? 2 : 1 });
    else y.push({ name: '純全帯幺九', han: menzen ? 3 : 2 });
  }
  if (kous.length === 4) y.push({ name: '対々和', han: 2 });
  if (anko === 3) y.push({ name: '三暗刻', han: 2 });
  for (let n = 0; n < 9; n++) {
    if ([0, 1, 2].every((s) => kous.some((g) => g.kind === s * 9 + n))) {
      y.push({ name: '三色同刻', han: 2 });
      break;
    }
  }
  if (kans === 3) y.push({ name: '三槓子', han: 2 });
  if (dragonKous === 2 && isDragon(pair)) y.push({ name: '小三元', han: 2 });
  if (allKinds.every(isYaochu)) y.push({ name: '混老頭', han: 2 });
  colorYaku(allKinds, menzen, y);

  // ---- 符 ----
  let fu: number;
  if (pinfu) {
    fu = inp.tsumo ? 20 : 30;
  } else {
    fu = 20;
    if (menzen && !inp.tsumo) fu += 10;
    if (inp.tsumo) fu += 2;
    for (const g of kous) {
      let f = 2;
      if (isYaochu(g.kind)) f *= 2;
      if (!g.open && !g.ronCompleted) f *= 2;
      if (g.type === 'kantsu') f *= 4;
      fu += f;
    }
    fu += 2 * isValuePair(pair, inp);
    if (wait === 'kanchan' || wait === 'penchan' || wait === 'tanki') fu += 2;
    fu = Math.ceil(fu / 10) * 10;
    if (fu === 20) fu = 30; // 喰い平和形
  }
  return { yaku: y, fu };
}

function isChuuren(c: number[]): boolean {
  for (let s = 0; s < 3; s++) {
    const b = s * 9;
    let total = 0;
    for (let i = 0; i < 9; i++) total += c[b + i];
    if (total !== 14) continue;
    if (c[b] < 3 || c[b + 8] < 3) return false;
    for (let i = 1; i < 8; i++) if (c[b + i] < 1) return false;
    return true;
  }
  return false;
}

function countDora(allTiles: Tile[], indicators: Tile[]): number {
  let n = 0;
  for (const ind of indicators) {
    const d = doraFromIndicator(kindOf(ind));
    for (const t of allTiles) if (kindOf(t) === d) n++;
  }
  return n;
}

function finalize(c: Candidate, situ: YakuItem[], allTiles: Tile[], inp: WinInput): WinResult | null {
  const situYakuman = situ.filter((y) => y.yakuman);
  const structYakuman = c.yaku.filter((y) => y.yakuman);
  if (situYakuman.length + structYakuman.length > 0) {
    const yaku = [...situYakuman, ...structYakuman];
    const yakuman = yaku.reduce((a, y) => a + (y.yakuman ?? 0), 0);
    const { base, limit } = calcBase(0, 0, yakuman, inp.rules.kiriage);
    return { yaku, han: 0, fu: c.fu, dora: 0, aka: 0, ura: 0, yakuman, base, limit };
  }
  const yaku = [...situ, ...c.yaku];
  const yakuHan = yaku.reduce((a, y) => a + y.han, 0);
  if (yakuHan === 0) return null;
  const dora = countDora(allTiles, inp.doraIndicators);
  const aka = inp.rules.aka ? allTiles.filter(isRedTile).length : 0;
  const ura = inp.riichi ? countDora(allTiles, inp.uraIndicators) : 0;
  const han = yakuHan + dora + aka + ura;
  const { base, limit } = calcBase(han, c.fu, 0, inp.rules.kiriage);
  return { yaku, han, fu: c.fu, dora, aka, ura, yakuman: 0, base, limit };
}

export function calcBase(han: number, fu: number, yakuman: number, kiriage: boolean): { base: number; limit: string } {
  if (yakuman > 0) return { base: 8000 * yakuman, limit: yakuman > 1 ? `${yakuman}倍役満` : '役満' };
  if (han >= 13) return { base: 8000, limit: '数え役満' };
  if (han >= 11) return { base: 6000, limit: '三倍満' };
  if (han >= 8) return { base: 4000, limit: '倍満' };
  if (han >= 6) return { base: 3000, limit: '跳満' };
  const base = fu * Math.pow(2, han + 2);
  if (han >= 5 || base >= 2000) return { base: 2000, limit: '満貫' };
  if (kiriage && ((han === 4 && fu === 30) || (han === 3 && fu === 60))) return { base: 2000, limit: '満貫' };
  return { base, limit: '' };
}

const ceil100 = (x: number): number => Math.ceil(x / 100) * 100;

/** ロン和了の支払い額（本場を除く） */
export function ronPoints(base: number, dealer: boolean): number {
  return ceil100(base * (dealer ? 6 : 4));
}

/** ツモ和了の支払い額（本場を除く）。親: 子それぞれ。子: 親/子 */
export function tsumoPoints(base: number, dealer: boolean): { dealer: number; other: number } {
  if (dealer) {
    const v = ceil100(base * 2);
    return { dealer: v, other: v };
  }
  return { dealer: ceil100(base * 2), other: ceil100(base) };
}
