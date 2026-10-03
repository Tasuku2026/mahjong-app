// 役ナビ: 役の説明と、今の手牌で各役を成立させられる確率・あと何枚必要か
import { Game } from '../core/game';
import { Kind, Tile, kindOf, toCounts, isHonor, isYaochu, isDragon, isTerminal, suitOf, parseTiles, WIND_NAMES } from '../core/tiles';
import { calcShanten, shantenChiitoi, shantenKokushi } from '../core/shanten';
import { meldIsOpen, meldIsKan } from '../core/types';
import { tileHtml } from './tileView';
import { none, restrictedShanten, shantenWithRequired } from '../ai/yakuShanten';
import { furigana, yakuRuby } from './terms';

interface Ctx {
  g: Game;
  /** 手牌（副露を除く） */
  hand: Kind[];
  /** 手牌 + 副露の全部 */
  all: Kind[];
  counts: number[];
  menzen: boolean;
  /** チーをしているか */
  hasChi: boolean;
  shanten: number;
  valuable: (k: Kind) => boolean;
}

interface Fit {
  /** 0..1 狙いやすさ */
  score: number;
  /** 今の手についてのひとこと */
  note: string;
}

interface YakuDef {
  name: string;
  /** 門前の翻数（役満は 13） */
  han: number;
  /** 鳴いたときの翻数（null は鳴くと不成立） */
  openHan: number | null;
  desc: string;
  example?: string;
  yakuman?: boolean;
  /** 偶然の役（狙って作るものではない） */
  luck?: boolean;
  fit: (c: Ctx) => Fit;
}

const SUIT_NAMES = ['萬子', '筒子', '索子'];
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const LUCK: Fit = { score: 0.02, note: '偶然つく役です（狙って作るものではありません）' };
const needMenzen = (c: Ctx): Fit | null => (c.menzen ? null : { score: 0, note: '鳴いているので、この局ではつきません' });
const needNoChi = (c: Ctx): Fit | null => (c.hasChi ? { score: 0, note: 'チーをしているので、この局ではつきません' } : null);

/** 一番多い色と、その枚数・字牌の枚数・それ以外の枚数 */
function suitStats(c: Ctx) {
  const cnt = [0, 0, 0];
  for (const k of c.all) if (!isHonor(k)) cnt[suitOf(k)]++;
  const main = cnt.indexOf(Math.max(...cnt));
  const honors = c.all.filter(isHonor).length;
  const off = c.all.length - cnt[main] - honors;
  return { main, mainCount: cnt[main], honors, off };
}

const YAKU: YakuDef[] = [
  {
    name: '立直', han: 1, openHan: null,
    desc: '鳴かずにテンパイ（あと1枚で和了）したときに「リーチ」と宣言する。どんな手でも役になる、いちばん基本の役。',
    example: '123m 456p 789s 234s 55p',
    fit: (c) => needMenzen(c) ?? (c.shanten <= 0
      ? { score: 1, note: 'テンパイしています。リーチできます！' }
      : { score: clamp(0.85 - c.shanten * 0.12), note: '鳴かずに進めて、テンパイしたらリーチ' }),
  },
  {
    name: '門前清自摸和', han: 1, openHan: null,
    desc: '鳴かずに、自分で引いた牌（ツモ）で和了する。',
    example: '123m 456p 789s 234s 55p',
    fit: (c) => needMenzen(c) ?? { score: 0.5, note: '鳴かずにツモで和了すればつきます' },
  },
  {
    name: '断幺九', han: 1, openHan: 1,
    desc: '2〜8の数牌だけで作る。1・9・字牌（東南西北白發中）を使わない。',
    example: '234m 567p 345s 678s 55p',
    fit: (c) => {
      if (!c.menzen && !c.g.rules.kuitan) return { score: 0, note: '喰いタンなしのルールなので、鳴くとつきません' };
      if (c.g.players[0].melds.some((m) => m.tiles.some((t) => isYaochu(kindOf(t))))) return { score: 0, note: '1・9・字牌を鳴いているので、この局ではつきません' };
      const n = c.hand.filter(isYaochu).length;
      return n === 0
        ? { score: 1, note: '1・9・字牌がありません。このまま進めればOK' }
        : { score: clamp(1 - n * 0.14), note: `1・9・字牌が あと${n}枚（これを切っていけばOK）` };
    },
  },
  {
    name: '役牌', han: 1, openHan: 1,
    desc: '白・發・中、場風（東場なら東）、自風（自分の席の風）を3枚そろえる。ポンしてもOK。',
    example: '555z 123m 456p 789s 11p',
    fit: (c) => {
      let best: Fit = { score: 0.05, note: '役牌（白・發・中・場風・自風）を持っていません' };
      for (let k = 27; k < 34; k++) {
        if (!c.valuable(k)) continue;
        const n = c.counts[k];
        const name = '東南西北白發中'[k - 27];
        const f: Fit = n >= 3 ? { score: 1, note: `${name}がそろっています！` }
          : n === 2 ? { score: 0.85, note: `${name}があと1枚（捨てられたらポンでもOK）` }
            : n === 1 ? { score: 0.3, note: `${name}があと2枚` } : best;
        if (f.score > best.score) best = f;
      }
      return best;
    },
  },
  {
    name: '平和', han: 1, openHan: null,
    desc: '鳴かずに、順子（123のような数字の並び）4組と、役牌以外の雀頭（2枚組）で作り、両面待ち（34で2と5を待つような形）で和了する。',
    example: '123m 456p 345s 789s 55p',
    fit: (c) => {
      const m = needMenzen(c);
      if (m) return m;
      const triples = c.counts.filter((x) => x >= 3).length;
      const honors = c.hand.filter(isHonor).length;
      return { score: clamp(0.75 - triples * 0.25 - honors * 0.08), note: honors ? `字牌（${honors}枚）を切って、数字の並びを作ろう` : '数字の並び（順子）を中心に作ろう' };
    },
  },
  {
    name: '一盃口', han: 1, openHan: null,
    desc: '鳴かずに、まったく同じ順子を2組作る（例：223344）。',
    example: '123m 123m 456p 789s 55p',
    fit: (c) => {
      const m = needMenzen(c);
      if (m) return m;
      let best = 0;
      for (let k = 0; k < 27; k++) {
        if (k % 9 > 6) continue;
        const v = Math.min(c.counts[k], 2) + Math.min(c.counts[k + 1], 2) + Math.min(c.counts[k + 2], 2);
        best = Math.max(best, v);
      }
      return best >= 6 ? { score: 1, note: '同じ順子が2組あります！' } : { score: clamp((best - 2) / 5), note: `同じ並びを2組（あと${6 - best}枚）` };
    },
  },
  {
    name: '七対子', han: 2, openHan: null,
    desc: '鳴かずに、対子（同じ牌2枚）を7組そろえる。特別な形の役。',
    example: '11m 33m 55p 77p 22s 88s 66z',
    fit: (c) => {
      const m = needMenzen(c);
      if (m) return m;
      const pairs = c.counts.filter((x) => x >= 2).length;
      const s = shantenChiitoi(toCounts(c.g.players[0].hand));
      return { score: clamp(0.15 + (pairs - 2) * 0.17), note: `対子が${pairs}組（あと${Math.max(0, s + 1)}枚で和了）` };
    },
  },
  {
    name: '三色同順', han: 2, openHan: 1,
    desc: '萬子・筒子・索子で、同じ数字の順子を作る（例：345萬・345筒・345索）。',
    example: '345m 345p 345s 789m 11z',
    fit: (c) => {
      let best = 0;
      let bestN = 0;
      for (let n = 0; n < 7; n++) {
        let v = 0;
        for (let s = 0; s < 3; s++) for (let d = 0; d < 3; d++) if (c.counts[s * 9 + n + d] > 0) v++;
        if (v > best) { best = v; bestN = n; }
      }
      const need = 9 - best;
      return need === 0 ? { score: 0.95, note: `${bestN + 1}${bestN + 2}${bestN + 3}が3色そろっています！` }
        : { score: clamp((best - 4) / 5), note: `${bestN + 1}${bestN + 2}${bestN + 3}を3色で（あと${need}種類）` };
    },
  },
  {
    name: '一気通貫', han: 2, openHan: 1,
    desc: '同じ色で 123・456・789 の順子をそろえる（1から9までの一本道）。',
    example: '123m 456m 789m 456p 11z',
    fit: (c) => {
      let best = 0;
      let bestS = 0;
      for (let s = 0; s < 3; s++) {
        let v = 0;
        for (let i = 0; i < 9; i++) if (c.counts[s * 9 + i] > 0) v++;
        if (v > best) { best = v; bestS = s; }
      }
      return best === 9 ? { score: 0.95, note: `${SUIT_NAMES[bestS]}の1〜9がそろっています！` }
        : { score: clamp((best - 4) / 5), note: `${SUIT_NAMES[bestS]}で1〜9を（あと${9 - best}種類）` };
    },
  },
  {
    name: '混全帯幺九', han: 2, openHan: 1,
    desc: 'すべての組（順子・刻子・雀頭）に、1・9・字牌のどれかを入れる（例：123、789、東東東）。',
    example: '123m 789p 123s 111z 99m',
    fit: (c) => {
      const edge = c.all.filter((k) => isHonor(k) || k % 9 <= 2 || k % 9 >= 6).length;
      const r = edge / c.all.length;
      return { score: clamp((r - 0.6) * 2), note: `端の牌（1〜3・7〜9）と字牌で作る（中ほどの4〜6が あと${c.all.length - edge}枚）` };
    },
  },
  {
    name: '対々和', han: 2, openHan: 2,
    desc: '刻子（同じ牌3枚）を4組と、雀頭（2枚）で作る。ポンしてもOK。',
    example: '111m 555p 999s 222z 33z',
    fit: (c) => {
      const no = needNoChi(c);
      if (no) return no;
      const t3 = c.counts.filter((x) => x >= 3).length;
      const t2 = c.counts.filter((x) => x === 2).length;
      return { score: clamp((t3 * 2 + t2 - 3) / 7), note: `刻子${t3}組・対子${t2}組（同じ牌を集めてポンしよう）` };
    },
  },
  {
    name: '三暗刻', han: 2, openHan: 2,
    desc: '鳴かずに自分で集めた刻子（暗刻）を3組作る。',
    example: '111m 555p 999s 234s 66p',
    fit: (c) => {
      const t3 = toCounts(c.g.players[0].hand).filter((x) => x >= 3).length;
      const t2 = toCounts(c.g.players[0].hand).filter((x) => x === 2).length;
      return { score: clamp((t3 * 2 + t2 - 2) / 6), note: `手の中の刻子${t3}組・対子${t2}組` };
    },
  },
  {
    name: '小三元', han: 2, openHan: 2,
    desc: '白・發・中のうち2種類を刻子（3枚）、残り1種類を雀頭（2枚）にする。役牌2つも一緒につくので高い。',
    example: '555z 666z 123m 456p 77z',
    fit: (c) => {
      const d = [31, 32, 33].reduce((a, k) => a + Math.min(c.counts[k], 3), 0);
      return { score: clamp((d - 3) / 5), note: `白・發・中が合わせて${d}枚（8枚必要）` };
    },
  },
  {
    name: '混老頭', han: 2, openHan: 2,
    desc: '1・9・字牌だけで作る（2〜8を使わない）。',
    example: '111m 999p 111s 222z 99s',
    fit: (c) => {
      const n = c.all.filter((k) => !isYaochu(k)).length;
      return { score: clamp(1 - n * 0.15), note: n ? `2〜8の牌が あと${n}枚` : '1・9・字牌だけです！' };
    },
  },
  {
    name: '三色同刻', han: 2, openHan: 2,
    desc: '萬子・筒子・索子で、同じ数字の刻子を作る（例：222萬・222筒・222索）。',
    example: '222m 222p 222s 456m 99s',
    fit: (c) => {
      let best = 0;
      for (let n = 0; n < 9; n++) best = Math.max(best, [0, 1, 2].reduce((a, s) => a + Math.min(c.counts[s * 9 + n], 3), 0));
      return { score: clamp((best - 4) / 6), note: `同じ数字が3色で合わせて${best}枚（9枚必要）` };
    },
  },
  {
    name: '三槓子', han: 2, openHan: 2,
    desc: 'カン（同じ牌4枚）を3回する。',
    fit: (c) => {
      const k = c.g.players[0].melds.filter(meldIsKan).length;
      return { score: k >= 2 ? 0.4 : 0.02, note: `カンを${k}回しています（3回必要）` };
    },
  },
  {
    name: '二盃口', han: 3, openHan: null,
    desc: '鳴かずに、一盃口（同じ順子2組）を2つ作る（例：112233萬・556677筒）。',
    example: '123m 123m 567p 567p 11s',
    fit: (c) => {
      const m = needMenzen(c);
      if (m) return m;
      const pairs = c.counts.filter((x) => x >= 2).length;
      return { score: clamp((pairs - 3) * 0.12), note: '対子の多い順子の手で狙える、珍しい役' };
    },
  },
  {
    name: '純全帯幺九', han: 3, openHan: 2,
    desc: 'すべての組に1か9を入れる（字牌は使わない）。混全帯幺九の上位版。',
    example: '123m 789p 123s 999s 11m',
    fit: (c) => {
      if (c.all.some(isHonor)) return { score: 0.05, note: '字牌があるとつきません（字牌を切ろう）' };
      const edge = c.all.filter((k) => k % 9 <= 2 || k % 9 >= 6).length;
      return { score: clamp((edge / c.all.length - 0.65) * 2), note: `中ほどの4〜6が あと${c.all.length - edge}枚` };
    },
  },
  {
    name: '混一色', han: 3, openHan: 2,
    desc: '1種類の数牌（萬子・筒子・索子のどれか）と字牌だけで作る。',
    example: '123m 456m 789m 111z 22z',
    fit: (c) => {
      const st = suitStats(c);
      return st.off === 0
        ? { score: 0.95, note: `${SUIT_NAMES[st.main]}と字牌だけです！` }
        : { score: clamp(1 - st.off * 0.12), note: `${SUIT_NAMES[st.main]}と字牌にそろえる（ほかの色が あと${st.off}枚）` };
    },
  },
  {
    name: '清一色', han: 6, openHan: 5,
    desc: '1種類の数牌だけで作る（字牌も使わない）。とても高い役。',
    example: '123m 234m 456m 789m 99m',
    fit: (c) => {
      const st = suitStats(c);
      const other = st.off + st.honors;
      return { score: clamp(1 - other * 0.11), note: other ? `${SUIT_NAMES[st.main]}だけにする（ほかの牌が あと${other}枚）` : `${SUIT_NAMES[st.main]}だけです！` };
    },
  },
  // ---- 偶然の役 ----
  { name: '一発', han: 1, openHan: null, luck: true, desc: 'リーチしてから1巡以内（誰も鳴かずに）和了する。', fit: () => LUCK },
  { name: 'ダブル立直', han: 2, openHan: null, luck: true, desc: '最初の1巡目（誰も鳴いていない）にリーチする。', fit: () => LUCK },
  { name: '海底摸月', han: 1, openHan: 1, luck: true, desc: '山の最後の1枚をツモって和了する。', fit: () => LUCK },
  { name: '河底撈魚', han: 1, openHan: 1, luck: true, desc: '最後に捨てられた牌でロン和了する。', fit: () => LUCK },
  { name: '嶺上開花', han: 1, openHan: 1, luck: true, desc: 'カンをしたあとに引く牌（嶺上牌）で和了する。', fit: () => LUCK },
  { name: '槍槓', han: 1, openHan: 1, luck: true, desc: '他の人が加カン（ポンした牌に4枚目を足す）した牌でロン和了する。', fit: () => LUCK },
  // ---- 役満 ----
  {
    name: '国士無双', han: 13, openHan: null, yakuman: true,
    desc: '1・9・字牌の13種類を1枚ずつ集め、どれか1種類をもう1枚。',
    example: '19m19p19s12345677z',
    fit: (c) => {
      const m = needMenzen(c);
      if (m) return m;
      const s = shantenKokushi(toCounts(c.g.players[0].hand));
      return { score: clamp((9 - s) / 9), note: `あと${s + 1}枚で和了` };
    },
  },
  {
    name: '四暗刻', han: 13, openHan: null, yakuman: true,
    desc: '鳴かずに刻子（同じ牌3枚）を4組作る。',
    example: '111m 555p 999s 222z 33z',
    fit: (c) => {
      const m = needMenzen(c);
      if (m) return m;
      const h = toCounts(c.g.players[0].hand);
      const t3 = h.filter((x) => x >= 3).length;
      const t2 = h.filter((x) => x === 2).length;
      return { score: clamp((t3 * 2 + t2 - 4) / 6), note: `刻子${t3}組・対子${t2}組` };
    },
  },
  {
    name: '大三元', han: 13, openHan: 13, yakuman: true,
    desc: '白・發・中をすべて刻子（3枚ずつ）にする。',
    example: '555z 666z 777z 123m 11p',
    fit: (c) => {
      const d = [31, 32, 33].reduce((a, k) => a + Math.min(c.counts[k], 3), 0);
      return { score: clamp((d - 4) / 5), note: `白・發・中が合わせて${d}枚（9枚必要）` };
    },
  },
  {
    name: '小四喜', han: 13, openHan: 13, yakuman: true,
    desc: '東南西北のうち3種類を刻子、1種類を雀頭にする。',
    example: '111z 222z 333z 123m 44z',
    fit: (c) => {
      const w = [27, 28, 29, 30].reduce((a, k) => a + Math.min(c.counts[k], 3), 0);
      return { score: clamp((w - 5) / 6), note: `東南西北が合わせて${w}枚（11枚必要）` };
    },
  },
  {
    name: '大四喜', han: 13, openHan: 13, yakuman: true,
    desc: '東南西北をすべて刻子にする。',
    example: '111z 222z 333z 444z 11m',
    fit: (c) => {
      const w = [27, 28, 29, 30].reduce((a, k) => a + Math.min(c.counts[k], 3), 0);
      return { score: clamp((w - 6) / 7), note: `東南西北が合わせて${w}枚（12枚必要）` };
    },
  },
  {
    name: '字一色', han: 13, openHan: 13, yakuman: true,
    desc: '字牌（東南西北白發中）だけで作る。',
    example: '111z 222z 333z 555z 66z',
    fit: (c) => {
      const n = c.all.filter((k) => !isHonor(k)).length;
      return { score: clamp(1 - n * 0.12), note: `数牌が あと${n}枚` };
    },
  },
  {
    name: '緑一色', han: 13, openHan: 13, yakuman: true,
    desc: '緑色だけの牌（2・3・4・6・8索と發）で作る。',
    example: '234s 234s 666s 888s 66z',
    fit: (c) => {
      const green = new Set([19, 20, 21, 23, 25, 32]);
      const n = c.all.filter((k) => !green.has(k)).length;
      return { score: clamp(1 - n * 0.12), note: `緑以外の牌が あと${n}枚` };
    },
  },
  {
    name: '清老頭', han: 13, openHan: 13, yakuman: true,
    desc: '1と9の数牌だけで作る（字牌も使わない）。',
    example: '111m 999m 111p 999p 11s',
    fit: (c) => {
      const n = c.all.filter((k) => !isTerminal(k)).length;
      return { score: clamp(1 - n * 0.12), note: `1・9以外の牌が あと${n}枚` };
    },
  },
  {
    name: '九蓮宝燈', han: 13, openHan: null, yakuman: true,
    desc: '鳴かずに、1種類の数牌で「1112345678999」＋どれか1枚の形を作る。',
    example: '123m 456m 789m 999m 11m',
    fit: (c) => {
      const m = needMenzen(c);
      if (m) return m;
      const st = suitStats(c);
      return { score: clamp(0.6 - (st.off + st.honors) * 0.1), note: `${SUIT_NAMES[st.main]}だけで特別な形を作る、とても珍しい役` };
    },
  },
  {
    name: '四槓子', han: 13, openHan: 13, yakuman: true,
    desc: 'カンを4回する。',
    fit: (c) => ({ score: c.g.players[0].melds.filter(meldIsKan).length >= 3 ? 0.4 : 0.01, note: 'とても珍しい役' }),
  },
  { name: '天和', han: 13, openHan: null, yakuman: true, luck: true, desc: '親が、最初に配られた手で和了している。', fit: () => LUCK },
  { name: '地和', han: 13, openHan: null, yakuman: true, luck: true, desc: '子が、最初のツモで和了する（誰も鳴いていないとき）。', fit: () => LUCK },
];

// ---------------------------------------------------------------
// 役ごとの「あと何枚」と「成立する確率」
// ---------------------------------------------------------------

interface SCtx {
  meldCount: number;
  menzen: boolean;
  hasChi: boolean;
  kuitan: boolean;
  valuable: (k: Kind) => boolean;
  /** 副露している牌の種類（ポン・カンは1種類、チーは3種類） */
  meldKinds: Kind[][];
  ponKinds: Kind[];
}

/** hc: 手牌（副露を除く）、cc: 手牌 + 副露（カンも3枚として数える） */
type ShFn = (x: SCtx, hc: number[], cc: number[]) => number;

const INF = Infinity;
const seq = (k: Kind) => [k, k + 1, k + 2];
const reqMap = (kinds: Kind[], n = 1) => {
  const m = new Map<Kind, number>();
  for (const k of kinds) m.set(k, (m.get(k) ?? 0) + n);
  return m;
};
const minOf = (xs: number[]) => xs.reduce((a, b) => Math.min(a, b), INF);
const SEQ_STARTS = Array.from({ length: 27 }, (_, k) => k).filter((k) => k % 9 <= 6);
const edgeNum = (k: Kind) => [0, 1, 2, 6, 7, 8].includes(k % 9);
const GREEN = new Set([19, 20, 21, 23, 25, 32]);
/** 手牌と副露をまとめて数えるときの設定 */
const FREE = { meldCount: 0 };

const SH: Record<string, ShFn> = {
  立直: (x, hc) => (x.menzen ? calcShanten(hc, x.meldCount) : INF),
  門前清自摸和: (x, hc) => (x.menzen ? calcShanten(hc, x.meldCount) : INF),
  断幺九: (x, hc) => {
    if (x.meldKinds.some((ks) => ks.some(isYaochu))) return INF;
    if (!x.menzen && !x.kuitan) return INF;
    return restrictedShanten(hc, { meldCount: x.meldCount, kindOk: (k) => !isYaochu(k) });
  },
  役牌: (x, hc) => minOf([27, 28, 29, 30, 31, 32, 33].filter(x.valuable).map((v) =>
    x.ponKinds.includes(v) ? calcShanten(hc, x.meldCount)
      : shantenWithRequired(hc, reqMap([v], 3), 1, false, { meldCount: x.meldCount }))),
  平和: (x, hc) => (x.menzen ? restrictedShanten(hc, { meldCount: x.meldCount, koutsuOk: none, pairOk: (k) => !x.valuable(k) }) : INF),
  一盃口: (x, hc) => (x.menzen
    ? minOf(SEQ_STARTS.map((k) => shantenWithRequired(hc, reqMap(seq(k), 2), 2, false, { meldCount: x.meldCount })))
    : INF),
  七対子: (x, hc) => (x.menzen && x.meldCount === 0 ? shantenChiitoi(hc) : INF),
  三色同順: (_x, _hc, cc) => minOf([0, 1, 2, 3, 4, 5, 6].map((n) =>
    shantenWithRequired(cc, reqMap([0, 9, 18].flatMap((b) => seq(b + n))), 3, false, FREE))),
  一気通貫: (_x, _hc, cc) => minOf([0, 9, 18].map((b) =>
    shantenWithRequired(cc, reqMap([0, 3, 6].flatMap((d) => seq(b + d))), 3, false, FREE))),
  混全帯幺九: (x, _hc, cc) => {
    if (x.meldKinds.some((ks) => !ks.some(isYaochu))) return INF;
    return restrictedShanten(cc, {
      meldCount: 0, kindOk: (k) => isHonor(k) || edgeNum(k),
      shuntsuOk: (k) => k % 9 === 0 || k % 9 === 6, koutsuOk: isYaochu, pairOk: isYaochu,
    });
  },
  対々和: (x, hc) => (x.hasChi ? INF : restrictedShanten(hc, { meldCount: x.meldCount, shuntsuOk: none })),
  三暗刻: (x, hc) => {
    const top = [...Array(34).keys()].sort((a, b) => hc[b] - hc[a]).slice(0, 3);
    return shantenWithRequired(hc, reqMap(top, 3), 3, false, { meldCount: x.meldCount });
  },
  小三元: (_x, _hc, cc) => minOf([31, 32, 33].map((d) => {
    const r = reqMap([31, 32, 33].filter((k) => k !== d), 3);
    r.set(d, 2);
    return shantenWithRequired(cc, r, 2, true, FREE);
  })),
  混老頭: (_x, _hc, cc) => restrictedShanten(cc, { meldCount: 0, kindOk: isYaochu, shuntsuOk: none }),
  三色同刻: (_x, _hc, cc) => minOf([...Array(9).keys()].map((n) =>
    shantenWithRequired(cc, reqMap([n, 9 + n, 18 + n], 3), 3, false, FREE))),
  二盃口: (x, hc) => {
    if (!x.menzen || x.meldCount > 0) return INF;
    const starts = SEQ_STARTS.filter((k) => seq(k).filter((j) => hc[j] > 0).length >= 2);
    const res: number[] = [];
    for (const a of starts) {
      for (const b of starts) {
        if (b >= a) res.push(shantenWithRequired(hc, reqMap([...seq(a), ...seq(a), ...seq(b), ...seq(b)]), 4, false, FREE));
      }
    }
    return minOf(res);
  },
  純全帯幺九: (x, _hc, cc) => {
    if (x.meldKinds.some((ks) => ks.some(isHonor) || !ks.some(isTerminal))) return INF;
    return restrictedShanten(cc, {
      meldCount: 0, kindOk: (k) => !isHonor(k) && edgeNum(k),
      shuntsuOk: (k) => k % 9 === 0 || k % 9 === 6, koutsuOk: isTerminal, pairOk: isTerminal,
    });
  },
  混一色: (x, hc) => minOf([0, 1, 2].map((s) =>
    (x.meldKinds.some((ks) => ks.some((k) => !isHonor(k) && suitOf(k) !== s)) ? INF
      : restrictedShanten(hc, { meldCount: x.meldCount, kindOk: (k) => isHonor(k) || suitOf(k) === s })))),
  清一色: (x, hc) => minOf([0, 1, 2].map((s) =>
    (x.meldKinds.some((ks) => ks.some((k) => isHonor(k) || suitOf(k) !== s)) ? INF
      : restrictedShanten(hc, { meldCount: x.meldCount, kindOk: (k) => !isHonor(k) && suitOf(k) === s })))),
  国士無双: (x, hc) => (x.menzen && x.meldCount === 0 ? shantenKokushi(hc) : INF),
  四暗刻: (x, hc) => (x.menzen ? restrictedShanten(hc, { meldCount: x.meldCount, shuntsuOk: none }) : INF),
  大三元: (_x, _hc, cc) => shantenWithRequired(cc, reqMap([31, 32, 33], 3), 3, false, FREE),
  小四喜: (_x, _hc, cc) => minOf([27, 28, 29, 30].map((w) => {
    const r = reqMap([27, 28, 29, 30].filter((k) => k !== w), 3);
    r.set(w, 2);
    return shantenWithRequired(cc, r, 3, true, FREE);
  })),
  大四喜: (_x, _hc, cc) => shantenWithRequired(cc, reqMap([27, 28, 29, 30], 3), 4, false, FREE),
  字一色: (x, _hc, cc) => Math.min(
    restrictedShanten(cc, { meldCount: 0, kindOk: isHonor, shuntsuOk: none }),
    x.meldCount === 0 ? shantenChiitoi(cc.map((n, k) => (isHonor(k) ? n : 0))) : INF),
  緑一色: (_x, _hc, cc) => restrictedShanten(cc, { meldCount: 0, kindOk: (k) => GREEN.has(k) }),
  清老頭: (_x, _hc, cc) => restrictedShanten(cc, { meldCount: 0, kindOk: isTerminal, shuntsuOk: none }),
  九蓮宝燈: (x, hc) => {
    if (!x.menzen || x.meldCount > 0) return INF;
    const pat = [3, 1, 1, 1, 1, 1, 1, 1, 3];
    return minOf([0, 9, 18].map((b) => {
      let fit = 0;
      let inSuit = 0;
      for (let i = 0; i < 9; i++) {
        fit += Math.min(hc[b + i], pat[i]);
        inSuit += hc[b + i];
      }
      const extra = inSuit > fit ? 1 : 0;
      return 14 - fit - extra - 1;
    }));
  },
};

interface Est {
  /** あと何枚の入れ替えが必要か（0 = 和了の形がそろっている、INF = 不可能） */
  need: number;
  /** この局のうちに成立させられる確率 */
  prob: number;
}

function estimate(fn: ShFn, x: SCtx, hc: number[], cc: number[], unseen: number[], turnsLeft: number): Est {
  const s = fn(x, hc, cc);
  if (!Number.isFinite(s) || s >= 9) return { need: INF, prob: 0 };
  const need = Math.max(0, s + 1);
  if (need === 0) return { need: 0, prob: 1 };
  if (need > 5) return { need, prob: 0 };
  // 引いたら1歩近づく牌の残り枚数
  let useful = 0;
  for (let k = 0; k < 34; k++) {
    if (unseen[k] <= 0) continue;
    hc[k]++;
    cc[k]++;
    if (fn(x, hc, cc) < s) useful += unseen[k];
    hc[k]--;
    cc[k]--;
  }
  // 「見込み」と同じ目安: テンパイまでの距離ごとの標準的な和了率を、残り巡目と役に役立つ牌の枚数で補正
  const sh = need - 1;
  const base = [0.5, 0.35, 0.22, 0.12, 0.06][sh];
  const typical = [8, 20, 35, 50, 60][sh];
  const timeFactor = Math.pow(Math.min(1.2, turnsLeft / 12), sh + 1);
  const ukeFactor = Math.min(1.4, Math.max(0.3, Math.sqrt(useful / typical)));
  return { need, prob: Math.min(0.9, base * timeFactor * ukeFactor) };
}

function sctx(g: Game): { x: SCtx; hc: number[]; cc: number[] } {
  const p = g.players[0];
  const hc = toCounts(p.hand);
  const cc = hc.slice();
  for (const m of p.melds) for (const k of m.tiles.map(kindOf).slice(0, 3)) cc[k]++;
  const x: SCtx = {
    meldCount: p.melds.length,
    menzen: !p.melds.some(meldIsOpen),
    hasChi: p.melds.some((m) => m.type === 'chi'),
    kuitan: g.rules.kuitan,
    valuable: (k) => isDragon(k) || k === g.seatWind(0) || k === g.roundWindKind,
    meldKinds: p.melds.map((m) => [...new Set(m.tiles.map(kindOf))]),
    ponKinds: p.melds.filter((m) => m.type !== 'chi').map((m) => kindOf(m.tiles[0])),
  };
  return { x, hc, cc };
}

function context(g: Game): Ctx {
  const p = g.players[0];
  const hand = p.hand.map(kindOf);
  const all = [...hand, ...p.melds.flatMap((m) => m.tiles.map(kindOf))];
  const valuable = (k: Kind) => isDragon(k) || k === g.seatWind(0) || k === g.roundWindKind;
  return {
    g, hand, all, counts: toCounts([...p.hand, ...p.melds.flatMap((m) => m.tiles)]),
    menzen: !p.melds.some(meldIsOpen),
    hasChi: p.melds.some((m) => m.type === 'chi'),
    shanten: calcShanten(toCounts(p.hand), p.melds.length),
    valuable,
  };
}

function mark(e: Est, luck: boolean): { sym: string; cls: string; label: string } {
  if (luck) return { sym: '☆', cls: 'fit-luck', label: '偶然' };
  if (!Number.isFinite(e.need)) return { sym: '×', cls: 'fit-no', label: '今は無理' };
  if (e.need === 0 || e.prob >= 0.2) return { sym: '◎', cls: 'fit-great', label: '狙える' };
  if (e.prob >= 0.05) return { sym: '○', cls: 'fit-good', label: 'あと少し' };
  return { sym: '△', cls: 'fit-far', label: '遠い' };
}

function hanLabel(y: YakuDef, kuitan: boolean): string {
  const menzenOnly = `<span class="yk-tag menzen">${furigana('門前')}のみ</span>`;
  if (y.yakuman) return furigana('役満') + (y.openHan === null ? menzenOnly : '<span class="yk-tag">鳴いてもOK</span>');
  const open = y.name === '断幺九' && !kuitan ? null : y.openHan;
  const closed = `${y.han}${furigana('翻')}`;
  if (open === null) return closed + menzenOnly;
  if (open === y.han) return `${closed}<span class="yk-tag">鳴いてもOK</span>`;
  return `${closed}<span class="yk-tag">鳴くと${open}${furigana('翻')}</span>`;
}

function statHtml(e: Est, luck: boolean): string {
  if (luck) return '<span class="yk-stat">偶然つく役</span>';
  if (!Number.isFinite(e.need)) return '<span class="yk-stat">この局では成立しません</span>';
  if (e.need === 0) return '<span class="yk-stat done">和了の形がそろっています！</span>';
  const pct = e.prob < 0.01 ? '1%未満' : `約${Math.round(e.prob * 100)}%`;
  return `<span class="yk-stat">成立する確率 <b>${pct}</b>・最短あと<b>${e.need}</b>枚</span>`;
}

/** 役の見本。空白で区切った組ごとに、少しすき間を空けて並べる（3・3・3・3・2） */
function exampleTiles(ex: string): string {
  return ex.trim().split(/\s+/)
    .map((g) => `<span class="yk-grp">${parseTiles(g).sort((a, b) => a - b).map((t) => tileHtml(t)).join('')}</span>`)
    .join('');
}

interface Row { y: YakuDef; e: Est; note: string }

function itemHtml(r: Row, open: Set<string>, kuitan: boolean, aim: string | null = null): string {
  const { y, e } = r;
  const m = mark(e, !!y.luck);
  const example = y.example
    ? `<div class="yk-example">${exampleTiles(y.example)}</div>`
    : '';
  const showNote = r.note && !y.luck && Number.isFinite(e.need) && e.need > 0;
  return `
    <details class="yk-item ${m.cls}" data-yaku="${y.name}" ${open.has(y.name) ? 'open' : ''}>
      <summary>
        <span class="yk-mark" title="${m.label}">${m.sym}</span>
        <span class="yk-name" data-yaku-pop="${y.name}" title="">${yakuRuby(y.name)}</span>
        <span class="yk-han">${hanLabel(y, kuitan)}</span>
        <span class="yk-note">${statHtml(e, !!y.luck)}${showNote ? `<br>${furigana(r.note)}` : ''}</span>
      </summary>
      <p class="yk-desc">${furigana(y.desc)}</p>
      ${example}
      ${!y.luck && Number.isFinite(e.need) ? (aim === y.name
    ? `<button class="yk-aim on" data-act="yaku-aim" data-yaku="${y.name}">◆ 狙い中（タップで解除）</button>`
    : `<button class="yk-aim" data-act="yaku-aim" data-yaku="${y.name}">◆ この${furigana('役')}を狙う</button>`) : ''}
    </details>`;
}

let cache: { key: string; rows: Row[] } | null = null;

/** 役ごとの見込み（手牌・副露・残り巡目が変わったときだけ計算し直す） */
function rows(g: Game, unseen: number[], tag = ''): Row[] {
  const p = g.players[0];
  const turnsLeft = Math.floor(g.live.length / 4);
  const key = [
    p.hand.slice().sort((a, b) => a - b).join(','), p.melds.map((m) => m.tiles.join('.')).join('|'),
    turnsLeft, g.roundName, g.honba, tag,
  ].join('/');
  if (cache?.key === key) return cache.rows;
  const c = context(g);
  const { x, hc, cc } = sctx(g);
  const out: Row[] = YAKU.map((y) => {
    const fn = SH[y.name];
    const e = y.luck || !fn ? { need: INF, prob: 0 } : estimate(fn, x, hc, cc, unseen, turnsLeft);
    return { y, e, note: y.fit(c).note };
  });
  cache = { key, rows: out };
  return out;
}

/** 折りたたみの欄 */
function foldHtml(key: string, title: string, list: Row[], open: Set<string>, kuitan: boolean, aim: string | null): string {
  if (list.length === 0) return '';
  return `
    <details class="yk-fold" data-yaku="${key}" ${open.has(key) ? 'open' : ''}>
      <summary>${title}（${list.length}）</summary>
      <div class="yk-list">${list.map((r) => itemHtml(r, open, kuitan, aim)).join('')}</div>
    </details>`;
}

/**
 * 役ナビの中身。
 * unseen: 自分から見えていない枚数、open: 開いている欄・役、closable: 閉じるボタンを出すか
 */
export function yakuGuideHtml(g: Game, unseen: number[], open: Set<string>, closable: boolean, aim: string | null = null, tag = ''): string {
  const list = rows(g, unseen, tag);
  // 成立する確率の高い順。同じなら「あと何枚」の少ない順、それも同じなら点数の低い順
  const possible = list.filter((r) => !r.y.luck && Number.isFinite(r.e.need))
    .sort((a, b) => (b.e.prob - a.e.prob) || (a.e.need - b.e.need) || (a.y.han - b.y.han));
  const near = possible.filter((r) => mark(r.e, false).cls !== 'fit-far');
  const far = possible.filter((r) => mark(r.e, false).cls === 'fit-far');
  const luck = list.filter((r) => r.y.luck);
  const impossible = list.filter((r) => !r.y.luck && !Number.isFinite(r.e.need));
  const wind = WIND_NAMES[g.seatWind(0) - 27];
  const k = g.rules.kuitan;
  return `
    <div class="yk-head">
      <h2>${furigana('役')}ナビ</h2>
      ${closable ? '<button class="yk-close" data-act="yaku-close" aria-label="閉じる">×</button>' : ''}
    </div>
    <p class="yk-lead">今のあなたの手牌で<b>成立しやすい順</b>です。役の名前にさわると完成形の図柄が、行をタップすると説明と「この役を狙う」ボタンが出ます。<br>
      <span class="fit-great">◎狙える</span>　<span class="fit-good">○あと少し</span>　<span class="muted">（自風：${wind}）</span></p>
    <div class="yk-list">${near.length ? near.map((r) => itemHtml(r, open, k, aim)).join('') : '<p class="muted small yk-empty">今はまだ、狙いやすい役がありません。下の「遠い役」も見てみましょう。</p>'}</div>
    ${foldHtml('__far', '△ 遠い役', far, open, k, aim)}
    ${foldHtml('__luck', '☆ 偶然つく役', luck, open, k, aim)}
    ${foldHtml('__impossible', '× この局ではもう成立しない役', impossible, open, k, aim)}`;
}

/** 役名にさわったときのポップアップ（完成形の図柄） */
export function yakuPopHtml(name: string): string {
  const y = YAKU.find((x) => x.name === name);
  if (!y) return '';
  const tiles = y.example
    ? `<div class="yk-pop-tiles">${exampleTiles(y.example)}</div>`
    : `<p class="yk-pop-desc">${furigana(y.desc)}</p>`;
  return `<div class="yk-pop-title">${yakuRuby(y.name)}<span class="muted">の完成形の例</span></div>${tiles}`;
}

/** 狙っている役の「あと何枚」（不可能なら Infinity） */
export function yakuNeed(g: Game, name: string, unseen: number[], tag = ''): number {
  return rows(g, unseen, tag).find((r) => r.y.name === name)?.e.need ?? INF;
}

/**
 * 狙っている役に近づく牌の種類（残り牌の表で目立たせる）。
 * 14枚のときは、その役のために一番よい牌を捨てた後で数える
 */
export function aimUsefulKinds(g: Game, name: string, unseen: number[]): Kind[] {
  const fn = SH[name];
  if (!fn) return [];
  const { x, hc, cc } = sctx(g);
  const p = g.players[0];
  if (p.hand.length % 3 === 2) {
    const t = aimDiscard(g, name, p.hand, unseen);
    if (t === null) return [];
    hc[kindOf(t)]--;
    cc[kindOf(t)]--;
  }
  const s0 = fn(x, hc, cc);
  if (!Number.isFinite(s0) || s0 >= 9) return [];
  const out: Kind[] = [];
  for (let k = 0; k < 34; k++) {
    if (unseen[k] <= 0) continue;
    hc[k]++;
    cc[k]++;
    if (fn(x, hc, cc) < s0) out.push(k);
    hc[k]--;
    cc[k]--;
  }
  return out;
}

/**
 * 「この役を狙う」: その役を作るのに一番よい捨て牌。
 * 役の向聴数が最も小さくなる牌、同じなら役に役立つ牌の残りが最も多くなる牌
 */
export function aimDiscard(g: Game, name: string, candidates: Tile[], unseen: number[]): Tile | null {
  const fn = SH[name];
  if (!fn) return null;
  const { x, hc, cc } = sctx(g);
  let best: { tile: Tile; s: number; u: number } | null = null;
  const seen = new Set<Kind>();
  for (const t of candidates) {
    const k = kindOf(t);
    if (seen.has(k)) continue;
    seen.add(k);
    hc[k]--;
    cc[k]--;
    const sh = fn(x, hc, cc);
    if (Number.isFinite(sh) && sh < 9) {
      let u = 0;
      if (sh <= 4) {
        for (let j = 0; j < 34; j++) {
          if (unseen[j] <= 0) continue;
          hc[j]++;
          cc[j]++;
          if (fn(x, hc, cc) < sh) u += unseen[j];
          hc[j]--;
          cc[j]--;
        }
      }
      if (!best || sh < best.s || (sh === best.s && u > best.u)) best = { tile: t, s: sh, u };
    }
    hc[k]++;
    cc[k]++;
  }
  return best?.tile ?? null;
}
