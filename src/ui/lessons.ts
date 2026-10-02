// まーじゃん教室: ルールをまったく知らない人向けのコース（ほー博士とぴよの会話で進む）
import { Tile, kindOf, parseTiles } from '../core/tiles';
import { tileHtml } from './tileView';
import { furiganaKids as furigana } from './terms';
import { charaFor, Expr } from './characters';

type Who = 'h' | 'p';

type Option = { text?: string; tiles?: string };

type Step =
  | { t: 'talk'; who: Who; text: string; tiles?: string; face?: Expr }
  | { t: 'pick'; text: string; tiles: string; answer: string; explain: string; shown?: { label: string; tiles: string } }
  | { t: 'choice'; text: string; tiles?: string; options: Option[]; answer: number; explain: string }
  | { t: 'group'; text: string; tiles: string }
  | { t: 'play'; text: string; hand: string; script: { draw: string; discard?: string; say: string }[] }
  | { t: 'graduate'; text: string };

interface Lesson { id: number; title: string; sub: string; steps: Step[] }

// ---------------------------------------------------------------
// レッスンの中身
// ---------------------------------------------------------------

export const LESSONS: Lesson[] = [
  {
    id: 1, title: '牌を知ろう', sub: '34種類の牌の見分け方',
    steps: [
      { t: 'talk', who: 'h', face: 'happy', text: 'ようこそ、まーじゃん教室へ！わしは先生のほー博士じゃ。' },
      { t: 'talk', who: 'p', face: 'happy', text: 'ぴよも、まーじゃん全然わからないぴよ…いっしょにがんばるぴよ！' },
      { t: 'talk', who: 'h', text: '麻雀で使う牌は全部で34種類。それぞれ4枚ずつ、合計136枚あるんじゃ。まずは種類を見ていこう。' },
      { t: 'talk', who: 'h', tiles: '123456789m', text: 'これが萬子じゃ。漢数字と、赤い「萬」の字。1から9まであるぞ。' },
      { t: 'talk', who: 'h', tiles: '123456789p', text: 'これは筒子。まるの数が、そのまま数字じゃ。' },
      { t: 'talk', who: 'h', tiles: '123456789s', text: 'これは索子。竹の本数が数字じゃ。1だけは鳥の絵になっておるぞ。' },
      { t: 'talk', who: 'p', face: 'surprised', text: '1索だけ鳥さん！ぴよの仲間ぴよ！' },
      { t: 'talk', who: 'h', tiles: '1234567z', text: '最後は字牌。東南西北の「風」と、白發中の3つじゃ。字牌には数字がないぞ。' },
      { t: 'pick', text: 'クイズじゃ！3筒（まるが3つの牌）をタップしてみよう。', tiles: '3m7p3s3p5z', answer: '3p', explain: 'そのとおり！まるが3つで3筒じゃ。' },
      { t: 'pick', text: 'では1索はどれかな？（ヒント：鳥）', tiles: '1m9s1p1s', answer: '1s', explain: '正解！鳥の絵が1索じゃ。' },
      { t: 'pick', text: '字牌はどれじゃ？', tiles: '5m5p1z5s', answer: '1z', explain: 'お見事！「東」は字牌じゃ。' },
      { t: 'talk', who: 'p', face: 'happy', text: 'ぜんぶわかったぴよ！' },
    ],
  },
  {
    id: 2, title: 'ゴールの形', sub: '和了（あがり）の形を知ろう',
    steps: [
      { t: 'talk', who: 'h', text: '麻雀のゴールは「和了」じゃ。手の中の14枚を、決まった形に組み合わせるんじゃよ。' },
      { t: 'talk', who: 'h', text: 'その形は「3枚の組が4つ」と「同じ牌2枚が1つ」。まずは組の作り方を見ていこう。' },
      { t: 'talk', who: 'h', tiles: '123m', text: 'ひとつめは順子。同じ種類で、数字が3つ続いたものじゃ。' },
      { t: 'talk', who: 'h', tiles: '555p', text: 'ふたつめは刻子。まったく同じ牌3枚じゃ。' },
      { t: 'talk', who: 'h', tiles: '77s', text: 'そして雀頭。同じ牌2枚のことじゃ。これは1つだけ作る。' },
      { t: 'talk', who: 'h', tiles: '123m456p234777s55z', text: 'これが和了の形じゃ。123萬・456筒・234索・777索の4組と、白白の雀頭。' },
      { t: 'choice', text: '順子になっているのはどれじゃ？', options: [{ tiles: '135m' }, { tiles: '456p' }, { tiles: '1m2p3s' }], answer: 1, explain: '正解！456筒は同じ筒子で数字が続いておる。135は飛んでおるし、色がちがうものも順子にはならんのじゃ。' },
      { t: 'talk', who: 'p', text: '形はわかったけど、実際にやってみたいぴよ。' },
      { t: 'group', text: 'では、この14枚を組に分けてみよう。3枚（または雀頭の2枚）をタップして選び、「組にする」を押すんじゃ。', tiles: '234m666p789s345s11z' },
      { t: 'talk', who: 'p', face: 'happy', text: 'パズルみたいで楽しいぴよ！' },
    ],
  },
  {
    id: 3, title: 'ゲームの流れ', sub: '引いて、捨てて、和了をめざす',
    steps: [
      { t: 'talk', who: 'h', text: '麻雀は4人で、順番に「山から1枚引いて、いらない1枚を捨てる」をくり返すゲームじゃ。' },
      { t: 'talk', who: 'h', text: '牌を引くことをツモという。手牌はいつも13枚、引いたときだけ14枚になるぞ。' },
      { t: 'talk', who: 'h', text: 'こうして少しずつ手をよくして、和了の形ができたら勝ちじゃ。実際にやってみよう！' },
      {
        t: 'play', text: 'わしの言うとおりに、捨てる牌をタップしてみよう。', hand: '123m456p78s11s1z9m5z',
        script: [
          { draw: '9s', discard: '5z', say: '9索を引いた！78索とつながって順子になったぞ。使わない白を捨てよう。' },
          { draw: '1z', discard: '9m', say: '東を引いて、東が2枚になった。ひとりぼっちの9萬を捨てよう。' },
          { draw: '1z', say: 'もう1枚、東がきた！これで和了の形じゃ。「ツモ」を押そう！' },
        ],
      },
      { t: 'talk', who: 'p', face: 'happy', text: '和了れたぴよ〜！うれしいぴよ！' },
      { t: 'talk', who: 'h', text: '自分で引いた牌で和了ることを「ツモ」というんじゃ。本番では、ほかの3人も和了をめざしておるぞ。' },
    ],
  },
  {
    id: 4, title: 'テンパイと待ち', sub: 'あと1枚で和了の状態',
    steps: [
      { t: 'talk', who: 'h', text: 'あと1枚で和了できる状態を聴牌（テンパイ）という。その1枚のことを待ちというんじゃ。' },
      { t: 'talk', who: 'h', tiles: '123m456p789s23s55z', text: 'この手は23索がもう少し。1索か4索がくれば順子になって和了じゃ。待ちが2種類ある、とてもよい形じゃな。' },
      { t: 'choice', text: 'この手の待ちはどれじゃ？', tiles: '123m456p789s46s55z', options: [{ tiles: '5s' }, { tiles: '4s' }, { tiles: '7s' }], answer: 0, explain: '正解！46索のまん中、5索がくれば456索の順子になるぞ。' },
      { t: 'choice', text: 'では、この手の待ちは？', tiles: '123m456p789s234s5z', options: [{ tiles: '5z' }, { tiles: '2s' }, { tiles: '5s' }], answer: 0, explain: 'お見事！4つの組はもうできておるから、白がもう1枚くれば雀頭になって和了じゃ。' },
      { t: 'talk', who: 'p', text: '待ちがわかると、どきどきするぴよ！' },
    ],
  },
  {
    id: 5, title: '役ってなに？', sub: '和了るために必要な条件',
    steps: [
      { t: 'talk', who: 'h', text: 'ここが大事じゃ。和了の形ができても、役が1つ以上ないと和了れないんじゃ。' },
      { t: 'talk', who: 'p', face: 'surprised', text: 'えっ！？形だけじゃだめぴよ！？' },
      { t: 'talk', who: 'h', text: '役はたくさんあるが、最初は3つだけ覚えれば十分じゃ。' },
      { t: 'talk', who: 'h', text: 'ひとつめは立直。鳴かずにテンパイしたら「リーチ」と宣言する。それだけで役になる、いちばん簡単な役じゃ。' },
      { t: 'talk', who: 'h', tiles: '234m567p345s678s55p', text: 'ふたつめは断幺九。2から8の数字だけで作る役じゃ。1・9・字牌を使わない。' },
      { t: 'talk', who: 'h', tiles: '555z123m456p789s11p', text: 'みっつめは役牌。白・發・中などを3枚そろえる役じゃ。' },
      { t: 'choice', text: 'この手を、人の捨て牌で和了ろうとしておる（リーチはしていない）。和了れるかな？', tiles: '234m567p345s678s55p', options: [{ text: '和了れる（断幺九がある）' }, { text: '和了れない' }], answer: 0, explain: '正解！2〜8だけでできておるから、断幺九の役がついて和了れるぞ。' },
      { t: 'choice', text: 'では、この手は？（リーチはしていない・人の捨て牌で和了る）', tiles: '123m456p789s111s99p', options: [{ text: '和了れる' }, { text: '和了れない（役がない）' }], answer: 1, explain: 'そのとおり！形はできておるが、1や9があるから断幺九ではないし、役牌もない。リーチをしておけば和了れたんじゃ。' },
      { t: 'talk', who: 'h', text: 'どの役を目指せばいいか迷ったら、対局中の「役ナビ」を見るとよいぞ。今の手で狙いやすい役を教えてくれる。' },
    ],
  },
  {
    id: 6, title: 'ポン・チー・ロン・ツモ', sub: '人の捨て牌を使うとき',
    steps: [
      { t: 'talk', who: 'h', text: '人の捨て牌をもらって、自分の組を作ることを「鳴く」という。鳴き方は2つじゃ。' },
      { t: 'talk', who: 'h', tiles: '55z', text: 'ポンは、同じ牌を2枚持っているとき、だれかが3枚目を捨てたらもらえる。だれの捨て牌でもOKじゃ。' },
      { t: 'talk', who: 'h', tiles: '46m', text: 'チーは、左どなりの人（上家）の捨て牌で順子を作る。46萬を持っていたら、上家の5萬でチーできるぞ。' },
      { t: 'talk', who: 'h', text: '鳴くと手が早く進むが、リーチができなくなる。役がなくなることもあるから注意じゃ（断幺九や役牌は鳴いてもOK）。' },
      { t: 'talk', who: 'h', text: '和了り方も2つ。人の捨て牌で和了るのがロン、自分で引いて和了るのがツモじゃ。' },
      { t: 'choice', text: '上家（左どなり）が5萬を捨てた。手に46萬がある。できるのは？', options: [{ text: 'ポン' }, { text: 'チー' }, { text: 'なにもできない' }], answer: 1, explain: '正解！上家の捨て牌で456萬の順子が作れるから、チーじゃ。' },
      { t: 'choice', text: '向かいの人（対面）が白を捨てた。手に白が2枚ある。できるのは？', options: [{ text: 'ポン' }, { text: 'チー' }], answer: 0, explain: '正解！同じ牌が3枚になるからポンじゃ。ポンは対面からでもできるぞ。' },
    ],
  },
  {
    id: 7, title: '振り込まないコツ', sub: '守りのいちばん大事なこと',
    steps: [
      { t: 'talk', who: 'h', text: '自分の捨てた牌で、ほかの人にロンされることを放銃（振り込み）という。点数を払うのは、捨てたあなただけじゃ。' },
      { t: 'talk', who: 'p', face: 'sad', text: 'こわいぴよ…どうすればいいぴよ？' },
      { t: 'talk', who: 'h', text: '相手がリーチしたら、その相手が自分で捨てた牌は、ぜったいにロンされない。これを現物というんじゃ。' },
      { t: 'pick', text: 'リーチした人の捨て牌を見て、あなたの手牌から安全な牌をタップしよう。', shown: { label: 'リーチした人の捨て牌', tiles: '2m5p9s1z7m' }, tiles: '8m5p3s4z', answer: '5p', explain: '正解！5筒はリーチした人が自分で捨てておるから、ぜったいに安全じゃ。' },
      { t: 'talk', who: 'h', text: '対局中は「危険牌」ボタンで、どの牌が危ないかの目安が見られる。練習に使うとよいぞ。' },
    ],
  },
  {
    id: 8, title: '点数のしくみ', sub: '計算は覚えなくてOK',
    steps: [
      { t: 'talk', who: 'h', text: 'みんな25000点から始めて、和了ると点数がもらえる。最後にいちばん点数が多い人が勝ちじゃ。' },
      { t: 'talk', who: 'h', text: '点数は、役の数（翻）と手の形（符）で決まる。でも計算はアプリがやってくれるから、覚えなくて大丈夫じゃ。' },
      { t: 'talk', who: 'h', text: '目安だけ知っておこう（子の場合）。1翻はだいたい1000点。満貫は8000点、跳満は12000点、倍満は16000点、役満は32000点じゃ。' },
      { t: 'talk', who: 'h', text: '親（その局のディーラー役）が和了ると、点数が1.5倍になるぞ。親は順番に交代していくんじゃ。' },
      { t: 'choice', text: '子が満貫で和了ると、何点もらえる？', options: [{ text: '3900点' }, { text: '8000点' }, { text: '32000点' }], answer: 1, explain: '正解！満貫は8000点。役満の32000点を和了ったら大喜びじゃ。' },
      { t: 'talk', who: 'p', face: 'happy', text: 'これで、ぜんぶ習ったぴよ！' },
    ],
  },
  {
    id: 9, title: '卒業対局', sub: 'ぴよたちと実際に打ってみよう',
    steps: [
      { t: 'talk', who: 'h', text: 'よくがんばったのう。最後は卒業対局じゃ！' },
      { t: 'talk', who: 'p', face: 'happy', text: 'ぴよが3人で相手をするぴよ！手加減しないぴよ〜！' },
      { t: 'talk', who: 'h', text: '短い東風戦じゃ。「おすすめ」「見込み」「役ナビ」をオンにしておくから、困ったら見るとよい。1回でも和了ったら卒業じゃ！' },
      { t: 'graduate', text: '準備ができたら、卒業対局を始めよう！' },
    ],
  },
];

// ---------------------------------------------------------------
// 進み具合（この端末に保存）
// ---------------------------------------------------------------

const KEY = 'mahjong-lesson-v1';

export interface LessonProgress {
  done: number[];
  graduated: boolean;
  introShown: boolean;
}

export function loadProgress(): LessonProgress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { done: p.done ?? [], graduated: !!p.graduated, introShown: !!p.introShown };
  } catch {
    return { done: [], graduated: false, introShown: false };
  }
}

export function saveProgress(p: LessonProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* 保存できなくても進められる */
  }
}

// ---------------------------------------------------------------
// 画面
// ---------------------------------------------------------------

const tilesHtml = (s: string, cls = '') => parseTiles(s).map((t) => tileHtml(t, { classes: cls ? [cls] : [] })).join('');

export interface LessonHooks {
  startGraduation(): void;
  backToTop(): void;
}

export class LessonUI {
  private lesson: Lesson | null = null;
  private step = 0;
  private feedback: { ok: boolean; text: string } | null = null;
  private solved = false;
  // 組に分ける練習
  private pool: Tile[] = [];
  private groups: Tile[][] = [];
  private sel = new Set<Tile>();
  // 引いて捨てる練習
  private hand: Tile[] = [];
  private drawn: Tile | null = null;
  private si = 0;

  constructor(private root: HTMLElement, private hooks: LessonHooks) {}

  /** 教室のトップ（レッスン一覧） */
  showMenu(): void {
    this.lesson = null;
    const p = loadProgress();
    const h = charaFor(9);
    const items = LESSONS.map((l) => {
      const done = l.id === 9 ? p.graduated : p.done.includes(l.id);
      return `
        <button class="ls-item ${done ? 'done' : ''}" data-act="ls-open" data-id="${l.id}">
          <span class="ls-no">${l.id === 9 ? furigana('卒業') : `${l.id}`}</span>
          <span class="ls-text"><b>${furigana(l.title)}</b><small>${furigana(l.sub)}</small></span>
          <span class="ls-stamp">${done ? '<span class="stamp-ok">済</span>' : ''}</span>
        </button>`;
    }).join('');
    const next = LESSONS.find((l) => (l.id === 9 ? !p.graduated : !p.done.includes(l.id)));
    this.root.innerHTML = `
      <div class="start lesson-menu">
        <h1>まーじゃん${furigana('教室')}</h1>
        <div class="ls-hero">${h.face('happy')}<p>${furigana('麻雀のルールを、ゼロから楽しく覚えよう！ 1つのレッスンは2〜3分じゃ。上から順番に進めるのがおすすめじゃぞ。')}</p></div>
        ${p.graduated ? `<p class="ls-graduated">🎓 ${furigana('卒業おめでとう！ もう立派な雀士じゃ')}</p>` : ''}
        <div class="ls-list">${items}</div>
        ${next ? `<button class="primary big" data-act="ls-open" data-id="${next.id}">${furigana(next.id === 9 ? '卒業対局へ' : `レッスン${next.id}から始める`)}</button>` : ''}
        <button class="big secondary" data-act="ls-top">トップ${furigana('画面に戻る')}</button>
      </div>`;
  }

  /** data-act が ls- で始まるクリック。処理したら true */
  handle(act: string, el: HTMLElement): boolean {
    switch (act) {
      case 'ls-menu': this.showMenu(); return true;
      case 'ls-top': this.hooks.backToTop(); return true;
      case 'ls-open': this.open(Number(el.dataset.id)); return true;
      case 'ls-next': this.next(); return true;
      case 'ls-prev':
        if (this.step > 0) this.go(this.step - 1);
        return true;
      case 'ls-pick': this.pick(Number(el.dataset.tile)); return true;
      case 'ls-choice': this.choose(Number(el.dataset.i)); return true;
      case 'ls-sel': this.toggleSel(Number(el.dataset.tile)); return true;
      case 'ls-group': this.makeGroup(); return true;
      case 'ls-reset': this.go(this.step); return true;
      case 'ls-discard': this.discard(Number(el.dataset.tile)); return true;
      case 'ls-tsumo': this.tsumo(); return true;
      case 'ls-graduate': this.hooks.startGraduation(); return true;
    }
    return false;
  }

  private open(id: number): void {
    this.lesson = LESSONS.find((l) => l.id === id) ?? LESSONS[0];
    this.go(0);
  }

  private go(i: number): void {
    const l = this.lesson!;
    this.step = i;
    this.feedback = null;
    this.solved = false;
    this.sel.clear();
    const s = l.steps[i];
    if (s.t === 'group') {
      this.pool = parseTiles(s.tiles).sort((a, b) => a - b);
      this.groups = [];
    }
    if (s.t === 'play') {
      this.hand = parseTiles(s.hand).sort((a, b) => a - b);
      this.si = 0;
      this.drawn = parseTiles(s.script[0].draw)[0] + 2; // 手牌と別の牌IDにする
    }
    this.render();
  }

  private next(): void {
    const l = this.lesson!;
    const s = l.steps[this.step];
    if (s.t !== 'talk' && s.t !== 'graduate' && !this.solved) return;
    if (this.step < l.steps.length - 1) {
      this.go(this.step + 1);
      return;
    }
    // レッスン終わり
    const p = loadProgress();
    if (!p.done.includes(l.id)) p.done.push(l.id);
    saveProgress(p);
    this.renderComplete();
  }

  private pick(t: Tile): void {
    const s = this.lesson!.steps[this.step];
    if (s.t !== 'pick' || this.solved) return;
    const ok = kindOf(t) === kindOf(parseTiles(s.answer)[0]);
    this.feedback = ok ? { ok, text: s.explain } : { ok, text: 'うーん、ちがうみたいぴよ…もう一度えらんでみるぴよ！' };
    this.solved = ok;
    this.render();
  }

  private choose(i: number): void {
    const s = this.lesson!.steps[this.step];
    if (s.t !== 'choice' || this.solved) return;
    const ok = i === s.answer;
    this.feedback = ok ? { ok, text: s.explain } : { ok, text: 'ざんねん、ちがうぴよ…。もう一度考えてみるぴよ！' };
    this.solved = ok;
    this.render();
  }

  private toggleSel(t: Tile): void {
    if (this.sel.has(t)) this.sel.delete(t);
    else this.sel.add(t);
    this.feedback = null;
    this.render();
  }

  private makeGroup(): void {
    const tiles = [...this.sel].sort((a, b) => a - b);
    const ks = tiles.map(kindOf);
    const hasPair = this.groups.some((g) => g.length === 2);
    let ok = false;
    let why = '';
    if (ks.length === 3) {
      const same = ks.every((k) => k === ks[0]);
      const run = ks[0] < 27 && Math.floor(ks[0] / 9) === Math.floor(ks[2] / 9) && ks[1] === ks[0] + 1 && ks[2] === ks[0] + 2;
      ok = same || run;
      why = ok ? '' : '3枚の組は、同じ牌3枚（刻子）か、同じ種類で数字が続く3枚（順子）じゃ。';
    } else if (ks.length === 2) {
      ok = ks[0] === ks[1] && !hasPair;
      why = hasPair ? '雀頭（2枚の組）は1つだけじゃ。' : '雀頭は同じ牌2枚じゃ。';
    } else {
      why = '3枚（または雀頭の2枚）を選んでから押すんじゃ。';
    }
    if (!ok) {
      this.feedback = { ok: false, text: why };
      this.render();
      return;
    }
    this.groups.push(tiles);
    this.pool = this.pool.filter((t) => !this.sel.has(t));
    this.sel.clear();
    if (this.pool.length === 0) {
      this.solved = true;
      this.feedback = { ok: true, text: 'できた！4つの組と雀頭、これが和了の形じゃ！' };
    } else {
      this.feedback = { ok: true, text: ks.length === 2 ? 'いいぞ、雀頭じゃ！' : ks[0] === ks[1] ? 'いいぞ、刻子じゃ！' : 'いいぞ、順子じゃ！' };
    }
    this.render();
  }

  private discard(t: Tile): void {
    const s = this.lesson!.steps[this.step];
    if (s.t !== 'play' || this.solved) return;
    const sc = s.script[this.si];
    if (!sc.discard) return;
    if (kindOf(t) !== kindOf(parseTiles(sc.discard)[0])) {
      this.feedback = { ok: false, text: 'その牌はまだ使えるぞ。光っている牌を捨ててみよう。' };
      this.render();
      return;
    }
    const all = [...this.hand, this.drawn!];
    all.splice(all.indexOf(t), 1);
    this.hand = all.sort((a, b) => a - b);
    this.si++;
    this.drawn = parseTiles(s.script[this.si].draw)[0] + 1 + (this.si % 2);
    this.feedback = null;
    this.render();
  }

  private tsumo(): void {
    const s = this.lesson!.steps[this.step];
    if (s.t !== 'play') return;
    this.solved = true;
    this.feedback = { ok: true, text: 'ツモ！見事に和了ったぞ！' };
    this.render();
  }

  // ---------------- 描画 ----------------

  private talkHtml(who: Who, text: string, face: Expr = 'normal'): string {
    const c = who === 'h' ? charaFor(9) : charaFor(1);
    return `<div class="ls-talk ls-${who}">${c.face(face)}<div class="ls-bubble"><b>${furigana(c.name)}</b><p>${furigana(text)}</p></div></div>`;
  }

  private render(): void {
    const l = this.lesson!;
    const s = l.steps[this.step];
    const dots = l.steps.map((_, i) => `<i class="${i < this.step ? 'past' : i === this.step ? 'now' : ''}"></i>`).join('');
    let stage = '';
    let talk = '';
    let actions = '';
    const canNext = s.t === 'talk' || this.solved;
    const nextBtn = `<button class="primary" data-act="ls-next" ${canNext ? '' : 'disabled'}>${furigana(this.step === l.steps.length - 1 ? 'レッスン完了！' : '次へ')}</button>`;
    const prevBtn = this.step > 0 ? '<button class="secondary" data-act="ls-prev">もどる</button>' : '';

    switch (s.t) {
      case 'talk':
        stage = s.tiles ? `<div class="ls-tiles">${tilesHtml(s.tiles)}</div>` : '';
        talk = this.talkHtml(s.who, s.text, s.face);
        break;
      case 'pick': {
        const answerKind = kindOf(parseTiles(s.answer)[0]);
        stage = (s.shown ? `<div class="ls-label">${furigana(s.shown.label)}</div><div class="ls-tiles small">${tilesHtml(s.shown.tiles)}</div><div class="ls-label">${furigana('あなたの手牌')}</div>` : '')
          + `<div class="ls-tiles">${parseTiles(s.tiles).map((t) => tileHtml(t, {
            classes: ['tap', ...(this.solved && kindOf(t) === answerKind ? ['right'] : [])],
            attrs: { 'data-act': 'ls-pick', 'data-tile': t },
          })).join('')}</div>`;
        talk = this.talkHtml('h', s.text);
        break;
      }
      case 'choice':
        stage = (s.tiles ? `<div class="ls-tiles">${tilesHtml(s.tiles)}</div>` : '')
          + `<div class="ls-options">${s.options.map((o, i) => `
            <button class="ls-opt ${this.solved && i === s.answer ? 'right' : ''}" data-act="ls-choice" data-i="${i}">
              ${o.tiles ? `<span class="ls-opt-tiles">${tilesHtml(o.tiles)}</span>` : ''}${o.text ? furigana(o.text) : ''}
            </button>`).join('')}</div>`;
        talk = this.talkHtml('h', s.text);
        break;
      case 'group':
        stage = `
          <div class="ls-label">できた${furigana('組')}</div>
          <div class="ls-groups">${this.groups.length ? this.groups.map((g) => `<span class="ls-group">${g.map((t) => tileHtml(t)).join('')}</span>`).join('') : '<span class="muted small">（まだありません）</span>'}</div>
          <div class="ls-label">のこりの${furigana('牌')}</div>
          <div class="ls-tiles">${this.pool.map((t) => tileHtml(t, { classes: ['tap', ...(this.sel.has(t) ? ['sel'] : [])], attrs: { 'data-act': 'ls-sel', 'data-tile': t } })).join('')}</div>`;
        talk = this.talkHtml('h', s.text);
        if (!this.solved) actions = `<button class="primary" data-act="ls-group">${furigana('組にする')}</button><button class="secondary" data-act="ls-reset">${furigana('やり直す')}</button>`;
        break;
      case 'play': {
        const sc = s.script[Math.min(this.si, s.script.length - 1)];
        const target = sc.discard ? kindOf(parseTiles(sc.discard)[0]) : -1;
        const one = (t: Tile, extra: string[] = []) => tileHtml(t, {
          classes: [...extra, ...(this.solved ? [] : kindOf(t) === target ? ['tap', 'glow'] : ['dim'])],
          attrs: { 'data-act': 'ls-discard', 'data-tile': t },
        });
        stage = `<div class="ls-label">${furigana('あなたの手牌（右はしが引いた牌）')}</div>
          <div class="ls-tiles hand">${this.hand.map((t) => one(t)).join('')}${this.drawn !== null ? `<span class="ls-gap"></span>${one(this.drawn, ['drawn'])}` : ''}</div>`;
        talk = this.talkHtml('h', this.solved ? 'ツモ！見事に和了ったぞ！' : sc.say, this.solved ? 'happy' : 'normal');
        if (!this.solved && !sc.discard) actions = '<button class="win" data-act="ls-tsumo">ツモ</button>';
        break;
      }
      case 'graduate':
        talk = this.talkHtml('h', s.text, 'happy');
        actions = `<button class="primary big" data-act="ls-graduate">${furigana('卒業対局を始める')}</button>`;
        break;
    }
    const fb = this.feedback
      ? `<div class="ls-feedback ${this.feedback.ok ? 'ok' : 'ng'}">${this.feedback.ok ? charaFor(9).face('happy') : charaFor(1).face('sad')}<p>${furigana(this.feedback.text)}</p></div>`
      : '';
    this.root.innerHTML = `
      <div class="lesson">
        <div class="ls-top">
          <button class="secondary" data-act="ls-menu">← ${furigana('教室')}</button>
          <div class="ls-title"><small>${furigana(l.id === 9 ? '卒業' : `レッスン${l.id}`)}</small>${furigana(l.title)}</div>
        </div>
        <div class="ls-dots">${dots}</div>
        <div class="ls-stage">${stage}</div>
        ${talk}
        ${fb}
        <div class="ls-actions">${actions}${s.t !== 'graduate' ? prevBtn + nextBtn : prevBtn}</div>
      </div>`;
  }

  private renderComplete(): void {
    const l = this.lesson!;
    const nextL = LESSONS.find((x) => x.id === l.id + 1);
    this.root.innerHTML = `
      <div class="lesson ls-complete">
        <div class="ls-stamp-big">済</div>
        <h2>レッスン${l.id}「${furigana(l.title)}」${furigana('完了！')}</h2>
        ${this.talkHtml('p', 'やったぴよ！また1つ賢くなったぴよ！', 'happy')}
        <div class="ls-actions">
          ${nextL ? `<button class="primary big" data-act="ls-open" data-id="${nextL.id}">${furigana(nextL.id === 9 ? '卒業対局へ' : `次のレッスン（${nextL.title}）`)}</button>` : ''}
          <button class="big secondary" data-act="ls-menu">${furigana('教室に戻る')}</button>
        </div>
      </div>`;
  }
}
