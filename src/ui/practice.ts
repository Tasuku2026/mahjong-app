// 練習: 何切る問題・点数計算の練習・役の図鑑
import { Kind, Tile, kindOf, toCounts, WIND_NAMES, doraFromIndicator } from '../core/tiles';
import { calcShanten } from '../core/shanten';
import { evaluateWin, calcBase, ronPoints, tsumoPoints, WinResult } from '../core/yaku';
import { DEFAULT_RULES } from '../core/types';
import { evaluateDiscards } from '../ai/cpu';
import { tileHtml } from './tileView';
import { furigana, kindRuby, yakuRuby } from './terms';

const fmt = (n: number) => n.toLocaleString('ja-JP');

// ---------------------------------------------------------------
// 乱数（「今日の1問」は日付から同じ問題を作る）
// ---------------------------------------------------------------

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

function shuffled(rand: () => number): Tile[] {
  const a = Array.from({ length: 136 }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------
// 何切る問題
// ---------------------------------------------------------------

interface NanikiruOption { tile: Tile; shanten: number; ukeire: number; kinds: Kind[] }
interface Nanikiru { hand: Tile[]; options: NanikiruOption[]; best: number; shanten: number }

/** 1〜2向聴の14枚を作り、捨てる牌ごとの受け入れを数える（ほかの人の情報はなし） */
/**
 * ひとりぼっちの牌があるか（字牌が1枚だけ、または前後2つ以内に同じ種類の牌がない数牌が1枚だけ）。
 * あると「それを切る」だけの、考えるところのない問題になるので出さない
 */
function hasIsolated(counts: number[]): boolean {
  for (let k = 0; k < 34; k++) {
    if (counts[k] !== 1) continue;
    if (k >= 27) return true;
    const base = Math.floor(k / 9) * 9;
    const n = k - base;
    let near = false;
    for (let d = -2; d <= 2; d++) {
      const m = n + d;
      if (d !== 0 && m >= 0 && m <= 8 && counts[base + m] > 0) near = true;
    }
    if (!near) return true;
  }
  return false;
}

export function makeNanikiru(rand: () => number): Nanikiru {
  for (let tries = 0; tries < 20000; tries++) {
    // 牌の種類を2〜3色にしぼり、字牌はときどきだけ混ぜる（形の選択が問われる手になりやすい）
    const suits = [0, 1, 2].sort(() => rand() - 0.5).slice(0, rand() < 0.7 ? 2 : 3);
    const useHonor = rand() < 0.3;
    const pool = shuffled(rand).filter((t) => {
      const k = kindOf(t);
      return k >= 27 ? useHonor : suits.includes(Math.floor(k / 9));
    });
    const hand = pool.slice(0, 14).sort((a, b) => a - b);
    const counts = toCounts(hand);
    if (hasIsolated(counts)) continue;
    const s = calcShanten(counts, 0);
    if (s < 1 || s > 2) continue;
    const unseen = counts.map((c) => 4 - c);
    const evals = evaluateDiscards(hand, 0, unseen, hand);
    const minS = Math.min(...evals.map((e) => e.shanten));
    const options = evals.map((e) => {
      const c = toCounts(hand);
      c[kindOf(e.tile)]--;
      const kinds: Kind[] = [];
      for (let k = 0; k < 34; k++) {
        if (unseen[k] <= 0 || c[k] >= 4) continue;
        c[k]++;
        if (calcShanten(c, 0) < e.shanten) kinds.push(k);
        c[k]--;
      }
      return { tile: e.tile, shanten: e.shanten, ukeire: e.shanten === minS ? e.ukeire : -1, kinds };
    });
    const best = Math.max(...options.map((o) => o.ukeire));
    const top = options.filter((o) => o.ukeire === best).length;
    const second = Math.max(...options.filter((o) => o.ukeire < best).map((o) => o.ukeire), 0);
    // 正解が1つに決まり、2番目と少し差がある問題だけにする
    if (top !== 1 || best - second < 2) continue;
    return { hand, options, best, shanten: s };
  }
  // まず起きないが、念のため
  return makeNanikiru(rng(hash(String(Math.random()))));
}

// ---------------------------------------------------------------
// 点数計算の練習
// ---------------------------------------------------------------

export interface ScoreQuiz {
  hand: Tile[]; // 和了牌を除く13枚
  winTile: Tile;
  tsumo: boolean;
  dealer: boolean;
  riichi: boolean;
  seatWind: Kind;
  dora: Tile;
  result: WinResult;
  answer: string;
  choices: string[];
}

function pointText(base: number, dealer: boolean, tsumo: boolean): string {
  if (!tsumo) return `${fmt(ronPoints(base, dealer))}点`;
  const t = tsumoPoints(base, dealer);
  return dealer ? `${fmt(t.other)}点オール` : `子${fmt(t.other)}・親${fmt(t.dealer)}点`;
}

/** 鳴きなしの和了形をでたらめに作り、役があるものを問題にする */
export function makeScoreQuiz(rand: () => number): ScoreQuiz {
  const pick = (n: number) => Math.floor(rand() * n);
  for (let tries = 0; tries < 5000; tries++) {
    const counts = new Array(34).fill(0);
    const kinds: Kind[] = [];
    let ok = true;
    for (let g = 0; g < 4 && ok; g++) {
      if (rand() < 0.7) {
        const suit = pick(3);
        const start = suit * 9 + pick(7);
        for (let i = 0; i < 3; i++) kinds.push(start + i);
      } else {
        const k = pick(34);
        kinds.push(k, k, k);
      }
    }
    const pair = pick(34);
    kinds.push(pair, pair);
    for (const k of kinds) if (++counts[k] > 4) ok = false;
    if (!ok) continue;
    // 牌IDに（赤ドラは使わない）
    const used = new Array(34).fill(0);
    const tiles = kinds.map((k) => k * 4 + 3 - used[k]++);
    const winIdx = pick(14);
    const winTile = tiles[winIdx];
    const tsumo = rand() < 0.4;
    const dealer = rand() < 0.3;
    const riichi = rand() < 0.5;
    const seatWind = dealer ? 27 : 28 + pick(3);
    const dora = pick(136);
    if (tiles.includes(dora)) continue;
    const result = evaluateWin({
      hand: tiles, melds: [], winTile, tsumo, riichi: riichi ? 1 : 0, seatWind, roundWind: 27,
      doraIndicators: [dora], uraIndicators: [], rules: { ...DEFAULT_RULES, aka: false },
    });
    if (!result || result.yakuman || result.han > 7) continue;
    const answer = pointText(result.base, dealer, tsumo);
    // まちがいの選択肢: 翻と符を少しずらした点数
    const pool = new Set<string>();
    for (const dh of [-1, 0, 1, 2]) {
      for (const df of [-10, 0, 10, 20]) {
        const h = result.han + dh;
        const f = result.fu + df;
        if (h < 1 || f < 20 || (dh === 0 && df === 0)) continue;
        const t = pointText(calcBase(h, f, 0, false).base, dealer, tsumo);
        if (t !== answer) pool.add(t);
      }
    }
    const wrong = [...pool].sort(() => rand() - 0.5).slice(0, 3);
    if (wrong.length < 3) continue;
    const choices = [answer, ...wrong].sort(() => rand() - 0.5);
    const hand = tiles.filter((_, i) => i !== winIdx).sort((a, b) => a - b);
    return { hand, winTile, tsumo, dealer, riichi, seatWind, dora, result, answer, choices };
  }
  throw new Error('点数問題を作れませんでした');
}

// ---------------------------------------------------------------
// 役の図鑑（自分が和了った役を記録）
// ---------------------------------------------------------------

const DEX_KEY = 'mahjong-yakudex-v1';
type Dex = Record<string, { count: number; first: string }>;

export function loadDex(): Dex {
  try {
    return JSON.parse(localStorage.getItem(DEX_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** 図鑑での名前（自風・場風は風の種類をまとめる） */
const dexName = (name: string) => (name.startsWith('自風') ? '自風' : name.startsWith('場風') ? '場風' : name);

/** 和了った役を図鑑に記録する。初めての役の名前を返す */
export function recordDex(r: WinResult): string[] {
  const dex = loadDex();
  const fresh: string[] = [];
  for (const y of r.yaku) {
    const n = dexName(y.name);
    if (!dex[n]) {
      dex[n] = { count: 0, first: today() };
      fresh.push(n);
    }
    dex[n].count++;
  }
  try {
    localStorage.setItem(DEX_KEY, JSON.stringify(dex));
  } catch {
    /* 保存できなくても対局は続ける */
  }
  return fresh;
}

const DEX_GROUPS: [string, string[]][] = [
  ['1翻', ['立直', '一発', '門前清自摸和', '断幺九', '平和', '一盃口', '役牌 白', '役牌 發', '役牌 中', '自風', '場風', '海底摸月', '河底撈魚', '嶺上開花', '槍槓']],
  ['2翻', ['ダブル立直', '三色同順', '一気通貫', '混全帯幺九', '七対子', '対々和', '三暗刻', '三色同刻', '三槓子', '小三元', '混老頭']],
  ['3翻以上', ['二盃口', '純全帯幺九', '混一色', '清一色']],
  ['役満', ['国士無双', '四暗刻', '大三元', '小四喜', '大四喜', '字一色', '緑一色', '清老頭', '四槓子', '九蓮宝燈', '天和', '地和']],
];

// ---------------------------------------------------------------
// 画面
// ---------------------------------------------------------------

export interface PracticeHooks { backToTop(): void }

const NK_KEY = 'mahjong-nanikiru-v1';

export class PracticeUI {
  private nk: Nanikiru | null = null;
  private nkDaily = false;
  private nkPicked: Tile | null = null;
  private sq: ScoreQuiz | null = null;
  private sqPicked: string | null = null;
  private sqScore = { right: 0, total: 0 };

  constructor(private root: HTMLElement, private hooks: PracticeHooks) {}

  handle(act: string, el: HTMLElement): void {
    switch (act) {
      case 'pr-top': this.hooks.backToTop(); return;
      case 'pr-nk-daily': this.startNanikiru(true); return;
      case 'pr-nk-new': this.startNanikiru(false); return;
      case 'pr-nk-pick': this.pickNanikiru(Number(el.dataset.tile)); return;
      case 'pr-sq-new': this.startScore(); return;
      case 'pr-sq-pick': this.pickScore(el.dataset.v!); return;
      case 'pr-dex': this.showDex(); return;
    }
  }

  /** 今日の1問はもう解いたか */
  static dailyDone(): boolean {
    try {
      return localStorage.getItem(NK_KEY) === today();
    } catch {
      return false;
    }
  }

  // ---- 何切る ----
  startNanikiru(daily: boolean): void {
    this.nkDaily = daily;
    this.nk = makeNanikiru(rng(daily ? hash(today()) : hash(String(Math.random()))));
    this.nkPicked = null;
    this.renderNanikiru();
  }

  private pickNanikiru(t: Tile): void {
    if (!this.nk || this.nkPicked !== null) return;
    this.nkPicked = t;
    if (this.nkDaily) {
      try {
        localStorage.setItem(NK_KEY, today());
      } catch {
        /* 記録できなくても続ける */
      }
    }
    this.renderNanikiru();
  }

  private renderNanikiru(): void {
    const q = this.nk!;
    const picked = this.nkPicked;
    const hand = q.hand.map((t) => tileHtml(t, {
      classes: ['tap', ...(picked !== null && kindOf(picked) === kindOf(t) ? ['sel'] : [])],
      attrs: picked === null ? { 'data-act': 'pr-nk-pick', 'data-tile': t } : {},
    })).join('');
    let result = '';
    if (picked !== null) {
      const mine = q.options.find((o) => kindOf(o.tile) === kindOf(picked))!;
      const ok = mine.ukeire === q.best;
      const rows = q.options.filter((o) => o.ukeire >= 0).sort((a, b) => b.ukeire - a.ukeire).slice(0, 5).map((o) => `
        <div class="nk-row ${o.ukeire === q.best ? 'best' : ''} ${kindOf(o.tile) === kindOf(picked) ? 'mine' : ''}">
          <span class="nk-cut">${tileHtml(o.tile)}<small>を切る</small></span>
          <span class="nk-kinds">${o.kinds.map((k) => tileHtml(k * 4 + 3)).join('')}</span>
          <b>${o.ukeire}枚</b>
        </div>`).join('');
      const msg = ok
        ? '正解！ いちばん手が進む切り方です。'
        : mine.ukeire < 0
          ? `その牌を切ると、${furigana('聴牌')}から遠くなってしまいます。`
          : `おしい！ その切り方の受け入れは${mine.ukeire}枚。いちばん多いのは${q.best}枚です。`;
      result = `
        <div class="pr-feedback ${ok ? 'ok' : 'ng'}">${furigana(msg)}</div>
        <div class="nk-table">
          <div class="nk-head"><span>切る牌</span><span>引くと${furigana('聴牌')}に近づく牌</span><span>受け入れ</span></div>
          ${rows}
        </div>
        <p class="pr-note">${furigana('受け入れ＝引くと聴牌に近づく牌の残り枚数。ほかの人の捨て牌やドラは考えず、手の進みやすさだけで比べています。')}</p>
        <div class="btns"><button class="primary" data-act="pr-nk-new">もう1問</button><button data-act="pr-top">トップ画面へ</button></div>`;
    }
    this.root.innerHTML = `
      <div class="start practice">
        <h1 class="pr-h1">${this.nkDaily ? '今日の何切る' : '何切る問題'}</h1>
        <p class="sub">${furigana(`いまは${q.shanten === 1 ? '聴牌の一歩手前' : '聴牌まであと2枚'}。いちばん手が進むのは、どれを切ったとき？`)}</p>
        <div class="pr-hand">${hand}</div>
        ${picked === null ? `<p class="pr-note">${furigana('切る牌をタップしよう')}</p><div class="btns"><button data-act="pr-top">トップ画面へ</button></div>` : result}
      </div>`;
  }

  // ---- 点数計算 ----
  startScore(): void {
    this.sq = makeScoreQuiz(rng(hash(String(Math.random()))));
    this.sqPicked = null;
    this.renderScore();
  }

  private pickScore(v: string): void {
    if (!this.sq || this.sqPicked !== null) return;
    this.sqPicked = v;
    this.sqScore.total++;
    if (v === this.sq.answer) this.sqScore.right++;
    this.renderScore();
  }

  private renderScore(): void {
    const q = this.sq!;
    const picked = this.sqPicked;
    const cond = [
      q.dealer ? '親' : `子（自風 ${WIND_NAMES[q.seatWind - 27]}）`,
      '場風 東',
      q.tsumo ? 'ツモ和了' : 'ロン和了',
      q.riichi ? 'リーチあり' : 'リーチなし',
    ];
    const choices = q.choices.map((c) => {
      const cls = picked === null ? '' : c === q.answer ? 'right' : c === picked ? 'wrong' : '';
      return `<button class="pr-choice ${cls}" data-act="pr-sq-pick" data-v="${c}" ${picked !== null ? 'disabled' : ''}>${furigana(c)}</button>`;
    }).join('');
    let result = '';
    if (picked !== null) {
      const r = q.result;
      const yaku = r.yaku.map((y) => `<li><span>${yakuRuby(y.name)}</span><span>${y.han}${furigana('翻')}</span></li>`).join('')
        + (r.dora ? `<li><span>ドラ</span><span>${r.dora}${furigana('翻')}</span></li>` : '');
      const ok = picked === q.answer;
      result = `
        <div class="pr-feedback ${ok ? 'ok' : 'ng'}">${ok ? '正解！' : `ざんねん。正解は ${furigana(q.answer)}`}</div>
        <ul class="yaku pr-yaku">${yaku}</ul>
        <p class="pr-calc">${furigana(`合計 ${r.han}翻 ${r.fu}符`)}${r.limit ? `（${furigana(r.limit)}）` : ''} → <b>${furigana(q.answer)}</b></p>
        <p class="pr-note">${furigana(`これまで ${this.sqScore.right} / ${this.sqScore.total}問 正解`)}</p>
        <div class="btns"><button class="primary" data-act="pr-sq-new">次の問題</button><button data-act="pr-top">トップ画面へ</button></div>`;
    }
    this.root.innerHTML = `
      <div class="start practice">
        <h1 class="pr-h1">${furigana('点数計算の練習')}</h1>
        <p class="sub">${cond.map((c) => furigana(c)).join('・')}</p>
        <div class="pr-dora">${furigana('ドラ表示牌')} ${tileHtml(q.dora)} → ドラ ${tileHtml(doraFromIndicator(kindOf(q.dora)) * 4 + 3)}</div>
        <div class="pr-hand">${q.hand.map((t) => tileHtml(t)).join('')}<span class="pr-gap"></span>${tileHtml(q.winTile, { classes: ['win-tile'] })}</div>
        <p class="pr-note">${furigana(`右はしが和了牌（${kindRuby(kindOf(q.winTile))}）。何点の和了？`)}</p>
        <div class="pr-choices">${choices}</div>
        ${result}
        ${picked === null ? '<div class="btns"><button data-act="pr-top">トップ画面へ</button></div>' : ''}
      </div>`;
  }

  // ---- 役の図鑑 ----
  showDex(): void {
    const dex = loadDex();
    const all = DEX_GROUPS.flatMap(([, n]) => n);
    const got = all.filter((n) => dex[n]).length;
    const groups = DEX_GROUPS.map(([head, names]) => `
      <h2 class="dex-h">${furigana(head)}</h2>
      <div class="dex-grid">${names.map((n) => {
    const d = dex[n];
    return `<div class="dex-item ${d ? 'got' : ''}"><b>${yakuRuby(n)}</b><small>${d ? `${d.count}回・はじめて ${d.first}` : furigana('まだ和了っていません')}</small></div>`;
  }).join('')}</div>`).join('');
    this.root.innerHTML = `
      <div class="start practice">
        <h1 class="pr-h1">${furigana('役の図鑑')}</h1>
        <p class="sub">${furigana(`対局で和了った役が記録されます。${got} / ${all.length} 種類 達成`)}</p>
        ${groups}
        <div class="btns"><button data-act="pr-top">トップ画面へ</button></div>
      </div>`;
  }
}
