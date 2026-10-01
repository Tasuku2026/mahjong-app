// 役確認: 役の説明と、今の手牌でどの役が狙いやすいかの目安
import { Game } from '../core/game';
import { Kind, kindOf, toCounts, isHonor, isYaochu, isDragon, isTerminal, suitOf, parseTiles, WIND_NAMES } from '../core/tiles';
import { calcShanten, shantenChiitoi, shantenKokushi } from '../core/shanten';
import { meldIsOpen, meldIsKan } from '../core/types';
import { tileHtml } from './tileView';
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
    example: '123m456p789s234s55p',
    fit: (c) => needMenzen(c) ?? (c.shanten <= 0
      ? { score: 1, note: 'テンパイしています。リーチできます！' }
      : { score: clamp(0.85 - c.shanten * 0.12), note: `鳴かずに進めて、あと${c.shanten}枚でテンパイ` }),
  },
  {
    name: '門前清自摸和', han: 1, openHan: null,
    desc: '鳴かずに、自分で引いた牌（ツモ）で和了する。',
    example: '123m456p789s234s55p',
    fit: (c) => needMenzen(c) ?? { score: 0.5, note: '鳴かずにツモで和了すればつきます' },
  },
  {
    name: '断幺九', han: 1, openHan: 1,
    desc: '2〜8の数牌だけで作る。1・9・字牌（東南西北白發中）を使わない。',
    example: '234m567p345s678s55p',
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
    example: '555z123m456p789s11p',
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
    example: '123m456p345s789s55p',
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
    example: '112233m456p789s55p',
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
    example: '1133m5577p2288s66z',
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
    example: '345m345p345s789m11z',
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
    example: '123456789m456p11z',
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
    example: '123m789p123s111z99m',
    fit: (c) => {
      const edge = c.all.filter((k) => isHonor(k) || k % 9 <= 2 || k % 9 >= 6).length;
      const r = edge / c.all.length;
      return { score: clamp((r - 0.6) * 2), note: `端の牌（1〜3・7〜9）と字牌で作る（中ほどの4〜6が あと${c.all.length - edge}枚）` };
    },
  },
  {
    name: '対々和', han: 2, openHan: 2,
    desc: '刻子（同じ牌3枚）を4組と、雀頭（2枚）で作る。ポンしてもOK。',
    example: '111m555p999s222z33z',
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
    example: '111m555p999s234s66p',
    fit: (c) => {
      const t3 = toCounts(c.g.players[0].hand).filter((x) => x >= 3).length;
      const t2 = toCounts(c.g.players[0].hand).filter((x) => x === 2).length;
      return { score: clamp((t3 * 2 + t2 - 2) / 6), note: `手の中の刻子${t3}組・対子${t2}組` };
    },
  },
  {
    name: '小三元', han: 2, openHan: 2,
    desc: '白・發・中のうち2種類を刻子（3枚）、残り1種類を雀頭（2枚）にする。役牌2つも一緒につくので高い。',
    example: '555z666z77z123m456p',
    fit: (c) => {
      const d = [31, 32, 33].reduce((a, k) => a + Math.min(c.counts[k], 3), 0);
      return { score: clamp((d - 3) / 5), note: `白・發・中が合わせて${d}枚（8枚必要）` };
    },
  },
  {
    name: '混老頭', han: 2, openHan: 2,
    desc: '1・9・字牌だけで作る（2〜8を使わない）。',
    example: '111m999p111s222z99s',
    fit: (c) => {
      const n = c.all.filter((k) => !isYaochu(k)).length;
      return { score: clamp(1 - n * 0.15), note: n ? `2〜8の牌が あと${n}枚` : '1・9・字牌だけです！' };
    },
  },
  {
    name: '三色同刻', han: 2, openHan: 2,
    desc: '萬子・筒子・索子で、同じ数字の刻子を作る（例：222萬・222筒・222索）。',
    example: '222m222p222s456m99s',
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
    example: '112233m556677p11s',
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
    example: '123m789p123s999s11m',
    fit: (c) => {
      if (c.all.some(isHonor)) return { score: 0.05, note: '字牌があるとつきません（字牌を切ろう）' };
      const edge = c.all.filter((k) => k % 9 <= 2 || k % 9 >= 6).length;
      return { score: clamp((edge / c.all.length - 0.65) * 2), note: `中ほどの4〜6が あと${c.all.length - edge}枚` };
    },
  },
  {
    name: '混一色', han: 3, openHan: 2,
    desc: '1種類の数牌（萬子・筒子・索子のどれか）と字牌だけで作る。',
    example: '123456m789m111z22z',
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
    example: '12323445678999m',
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
    example: '111m555p999s222z33z',
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
    example: '555z666z777z123m11p',
    fit: (c) => {
      const d = [31, 32, 33].reduce((a, k) => a + Math.min(c.counts[k], 3), 0);
      return { score: clamp((d - 4) / 5), note: `白・發・中が合わせて${d}枚（9枚必要）` };
    },
  },
  {
    name: '小四喜', han: 13, openHan: 13, yakuman: true,
    desc: '東南西北のうち3種類を刻子、1種類を雀頭にする。',
    example: '111z222z333z44z123m',
    fit: (c) => {
      const w = [27, 28, 29, 30].reduce((a, k) => a + Math.min(c.counts[k], 3), 0);
      return { score: clamp((w - 5) / 6), note: `東南西北が合わせて${w}枚（11枚必要）` };
    },
  },
  {
    name: '大四喜', han: 13, openHan: 13, yakuman: true,
    desc: '東南西北をすべて刻子にする。',
    example: '111z222z333z444z11m',
    fit: (c) => {
      const w = [27, 28, 29, 30].reduce((a, k) => a + Math.min(c.counts[k], 3), 0);
      return { score: clamp((w - 6) / 7), note: `東南西北が合わせて${w}枚（12枚必要）` };
    },
  },
  {
    name: '字一色', han: 13, openHan: 13, yakuman: true,
    desc: '字牌（東南西北白發中）だけで作る。',
    example: '111z222z333z555z66z',
    fit: (c) => {
      const n = c.all.filter((k) => !isHonor(k)).length;
      return { score: clamp(1 - n * 0.12), note: `数牌が あと${n}枚` };
    },
  },
  {
    name: '緑一色', han: 13, openHan: 13, yakuman: true,
    desc: '緑色だけの牌（2・3・4・6・8索と發）で作る。',
    example: '223344666888s66z',
    fit: (c) => {
      const green = new Set([19, 20, 21, 23, 25, 32]);
      const n = c.all.filter((k) => !green.has(k)).length;
      return { score: clamp(1 - n * 0.12), note: `緑以外の牌が あと${n}枚` };
    },
  },
  {
    name: '清老頭', han: 13, openHan: 13, yakuman: true,
    desc: '1と9の数牌だけで作る（字牌も使わない）。',
    example: '111m999m111p999p11s',
    fit: (c) => {
      const n = c.all.filter((k) => !isTerminal(k)).length;
      return { score: clamp(1 - n * 0.12), note: `1・9以外の牌が あと${n}枚` };
    },
  },
  {
    name: '九蓮宝燈', han: 13, openHan: null, yakuman: true,
    desc: '鳴かずに、1種類の数牌で「1112345678999」＋どれか1枚の形を作る。',
    example: '11123456789999m',
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

function mark(score: number): { sym: string; cls: string; label: string } {
  if (score >= 0.75) return { sym: '◎', cls: 'fit-great', label: '狙える' };
  if (score >= 0.45) return { sym: '○', cls: 'fit-good', label: 'あと少し' };
  if (score >= 0.2) return { sym: '△', cls: 'fit-far', label: '遠い' };
  if (score > 0) return { sym: '－', cls: 'fit-none', label: '' };
  return { sym: '×', cls: 'fit-no', label: '今は無理' };
}

function hanLabel(y: YakuDef, kuitan: boolean): string {
  if (y.yakuman) return furigana(y.openHan === null ? '役満（門前のみ）' : '役満');
  const open = y.name === '断幺九' && !kuitan ? null : y.openHan;
  const closed = `${y.han}${furigana('翻')}`;
  if (open === null) return `${closed}<span class="yk-tag menzen">${furigana('門前')}のみ</span>`;
  if (open === y.han) return `${closed}<span class="yk-tag">鳴いてもOK</span>`;
  return `${closed}<span class="yk-tag">鳴くと${open}${furigana('翻')}</span>`;
}

function itemHtml(y: YakuDef, c: Ctx): string {
  const f = y.fit(c);
  const m = mark(f.score);
  const example = y.example
    ? `<div class="yk-example">${parseTiles(y.example).sort((a, b) => a - b).map((t) => tileHtml(t)).join('')}</div>`
    : '<div class="yk-example muted small">（牌の例はありません）</div>';
  return `
    <details class="yk-item ${m.cls}">
      <summary>
        <span class="yk-mark" title="${m.label}">${m.sym}</span>
        <span class="yk-name">${yakuRuby(y.name)}</span>
        <span class="yk-han">${hanLabel(y, c.g.rules.kuitan)}</span>
        <span class="yk-note">${furigana(f.note)}</span>
      </summary>
      <p class="yk-desc">${furigana(y.desc)}</p>
      ${example}
    </details>`;
}

/** 役確認ウインドウの中身 */
export function yakuGuideHtml(g: Game): string {
  const c = context(g);
  const order = (list: YakuDef[]) => list
    .map((y) => ({ y, s: y.fit(c).score }))
    .sort((a, b) => b.s - a.s || a.y.han - b.y.han)
    .map((x) => x.y);
  const normal = order(YAKU.filter((y) => !y.yakuman));
  const yakuman = order(YAKU.filter((y) => y.yakuman));
  const wind = WIND_NAMES[g.seatWind(0) - 27];
  return `
    <div class="yk-head">
      <h2>${furigana('役')}確認</h2>
      <button class="yk-close" data-act="yaku-close" aria-label="閉じる">×</button>
    </div>
    <p class="yk-lead">今のあなたの手牌で<b>狙いやすい順</b>に並んでいます。役をタップすると完成形の例が出ます。<br>
      <span class="fit-great">◎狙える</span>　<span class="fit-good">○あと少し</span>　<span class="fit-far">△遠い</span>　<span class="fit-no">×今は無理</span>
      <span class="muted">（あなたの自風：${wind}）</span></p>
    <div class="yk-list">${normal.map((y) => itemHtml(y, c)).join('')}</div>
    <details class="yk-yakuman">
      <summary>${furigana('役満')}（とても高い特別な役）を見る</summary>
      <div class="yk-list">${yakuman.map((y) => itemHtml(y, c)).join('')}</div>
    </details>`;
}
