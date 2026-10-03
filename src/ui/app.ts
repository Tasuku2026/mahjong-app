import {
  Agent, CallAction, CallOptions, FinalStanding, Game, GameUI, RewindSignal, RoundResult, TurnAction, TurnOptions,
} from '../core/game';
import { Tile, Kind, kindOf, toCounts, WIND_NAMES, doraFromIndicator } from '../core/tiles';
import { calcShanten, getWaits } from '../core/shanten';
import { DEFAULT_RULES, Rules } from '../core/types';
import { CpuAgent, LEVEL_KAMI, LEVEL_ONI, levelLabel } from '../ai/cpu';
import { tileHtml, meldHtml } from './tileView';
import { helpButton, helpDialogHtml } from './help';
import { T, furigana, furiganaKids, kindRuby, roundRuby, yakuRuby } from './terms';
import { CHARAS, Chara, Expr, Talk, charaFor, pickLine } from './characters';
import { LessonUI, loadProgress, saveProgress } from './lessons';
import { PracticeUI, recordDex } from './practice';
import { aimDiscard, aimUsefulKinds, yakuGuideHtml, yakuNeed, yakuPopHtml } from './yakuGuide';
import { AssistSettings, DEFAULT_ASSIST, DangerMode, Advice, adviseCall, adviseTurn, discardInfo, handDanger, remainCounts, compareDiscards, CompareTable } from './assist';
import { outlook, Outlook } from '../ai/value';
import { setSoundEnabled, sfx, unlockAudio } from './sound';
import { analyticsEnabled, trackEvent } from './analytics';
import { GameRecord, RoundTally, clearRecords, emptyTally, levelBand, loadRecords, saveRecord, summarize } from './stats';

type Pending =
  | { kind: 'turn'; seat: number; opts: TurnOptions; resolve: (a: TurnAction) => void; reject: (e: unknown) => void }
  | { kind: 'call'; seat: number; tile: Tile; from: number; opts: CallOptions; resolve: (a: CallAction) => void; reject: (e: unknown) => void };

export interface Settings {
  rules: Rules;
  levels: [number, number, number];
  speed: number;
  assist: AssistSettings;
  sound: boolean;
  /** 画面が広いとき、役ナビを卓の横に表示するか */
  yakuSide: boolean;
}

type RuleKey = 'aka' | 'kuitan' | 'kiriage' | 'tobi' | 'agariYame' | 'extension' | 'undo';

const RULE_ROWS: [RuleKey, string][] = [
  ['aka', '赤ドラ'],
  ['kuitan', '喰いタン'],
  ['kiriage', '切り上げ満貫'],
  ['tobi', 'トビ終了'],
  ['agariYame', 'アガリやめ'],
  ['extension', '延長戦（西入・南入）'],
  ['undo', '待った'],
];

const SETTINGS_KEY = 'mahjong-settings-v1';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const fmt = (n: number) => n.toLocaleString('ja-JP');
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '±0');

function loadSettings(): Settings {
  const def: Settings = { rules: { ...DEFAULT_RULES }, levels: [5, 5, 5], speed: 1, assist: { ...DEFAULT_ASSIST }, sound: true, yakuSide: true };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return def;
    const s = JSON.parse(raw);
    return { ...def, ...s, rules: { ...def.rules, ...s.rules }, assist: { ...def.assist, ...s.assist } };
  } catch {
    return def;
  }
}

function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 保存できなくても動作には影響しない */
  }
}

/** 決して終わらない Promise（やめた対局をそこで止める） */
const never = <T>(): Promise<T> => new Promise<T>(() => {});

class HumanAgent implements Agent {
  constructor(private app: App, private live: () => boolean) {}

  async turn(g: Game, seat: number, opts: TurnOptions): Promise<TurnAction> {
    if (!this.live()) return never();
    const p = g.players[seat];
    // リーチ後は和了・暗槓の選択肢がなければ自動でツモ切り
    if (p.riichi && !opts.canTsumo && opts.ankanKinds.length === 0) {
      await g.ui.delay(450);
      return { type: 'discard', tile: opts.discardable[0] };
    }
    return new Promise((resolve, reject) => this.app.setPending({ kind: 'turn', seat, opts, resolve, reject }));
  }

  call(_g: Game, seat: number, tile: Tile, from: number, opts: CallOptions): Promise<CallAction> {
    if (!this.live()) return never();
    return new Promise((resolve, reject) => this.app.setPending({ kind: 'call', seat, tile, from, opts, resolve, reject }));
  }
}

export class App implements GameUI {
  private root: HTMLElement;
  private settings: Settings;
  private game: Game | null = null;
  private pending: Pending | null = null;
  private selected: Tile | null = null;
  private riichiMode = false;
  private bubbles = new Map<number, string>();
  private overlay: { html: string; resolve: () => void } | null = null;
  /** おすすめ打牌のキャッシュ（手番ごとに1回計算） */
  private hintCache: { pending: Pending; open: boolean; advice: Advice } | null = null;
  /** この対局での自分の成績 */
  private tally: RoundTally = emptyTally();
  /** ふり返り: おすすめ（レベル10の判断）と同じ打牌をした回数（局・対局全体）と、直前の打牌の危険度 */
  private review = { match: 0, total: 0, roundMatch: 0, roundTotal: 0, last: null as { tile: Tile; danger: number; safest: number } | null };
  /** 役ナビウインドウを開いているか（画面が狭いときのみ。対局は止めない） */
  private yakuOpen = false;
  /** まーじゃん教室 */
  private lessons: LessonUI;
  /** 練習（何切る・点数計算・役の図鑑） */
  private practice: PracticeUI;
  /** 卒業対局中か（1回和了ったら卒業） */
  private lessonGame: false | 'basic' | 'mid' = false;
  /** キャラクターの吹き出しと表情（席ごと） */
  private speech = new Map<number, { text: string; key: number }>();
  private faces = new Map<number, { expr: Expr; key: number }>();
  private talkKey = 0;
  /** 「この役を狙う」で選んだ役（局が終わると解除） */
  private aimYaku: string | null = null;
  private aimCache: { pending: Pending; aim: string; tile: Tile | null } | null = null;
  /** 役ナビで説明を開いている役（再描画しても開いたままにする） */
  private yakuOpenItems = new Set<string>();
  /** 対局ごとに増える番号（途中でやめた対局を見分ける） */
  private gameToken = 0;
  /** アニメーション済みの捨て牌・ツモ牌 */
  private animatedDiscard = '';
  private animatedDraw: Tile | null = null;
  private animDiscard = false;
  private animDraw = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.practice = new PracticeUI(root, { backToTop: () => this.showStart() });
    this.lessons = new LessonUI(root, {
      startGraduation: (c) => { void this.startGraduation(c); },
      backToTop: () => this.showStart(),
    });
    this.settings = loadSettings();
    setSoundEnabled(this.settings.sound);
    // ヘルプは root の外（body 直下）に出すため document で受ける
    document.addEventListener('click', (e) => this.onClick(e));
    // 役ナビで開いた説明は、再描画しても開いたままにする
    document.addEventListener('toggle', (e) => {
      const d = e.target as HTMLElement;
      const name = d.dataset?.yaku;
      if (!name) return;
      if ((d as HTMLDetailsElement).open) this.yakuOpenItems.add(name);
      else this.yakuOpenItems.delete(name);
    }, true);
    // 役名にマウスを乗せたら図柄のポップアップ
    document.addEventListener('mouseover', (e) => {
      const pop = (e.target as HTMLElement).closest<HTMLElement>('[data-yaku-pop]');
      if (pop) this.showYakuPop(pop);
    });
    document.addEventListener('mouseout', (e) => {
      const from = (e.target as HTMLElement).closest('[data-yaku-pop]');
      const to = (e as MouseEvent).relatedTarget as HTMLElement | null;
      if (from && !to?.closest('[data-yaku-pop]')) this.hideYakuPop();
    });
    // 画面の幅で、役ナビを卓の横に出すかが変わる
    window.addEventListener('resize', () => this.render());
  }

  // ------------------------------------------------------------------
  // スタート画面
  // ------------------------------------------------------------------

  showStart(): void {
    this.game = null;
    this.lessonGame = false;
    this.showIntroOnce();
    const s = this.settings;
    // アイコン付きの選択欄（ふつうのドロップダウンには絵を入れられないので自作）
    const levelSelect = (i: number, label: string) => `
      <div class="row lv-row"><span>${furigana(label)}</span>
        <div class="lv-pick" data-pick="${i}">
          <button type="button" class="lv-btn" data-act="lv-open" data-i="${i}" aria-haspopup="listbox">${this.levelItemHtml(s.levels[i])}<span class="lv-caret">▾</span></button>
          <input type="hidden" data-level="${i}" value="${s.levels[i]}">
        </div>
      </div>`;
    this.root.innerHTML = `
      <div class="start">
        <h1>ひとり麻雀</h1>
        <p class="sub">CPU 3人と対局する4人打ちリーチ麻雀</p>
        <button class="lesson-banner" data-act="lesson">${charaFor(9).face('happy')}<span><b>まーじゃん${furiganaKids('教室')}</b><small>${furiganaKids('ルールを知らない人はここから！')}${loadProgress().graduated ? `（${furiganaKids('卒業')}ずみ）` : ''}</small></span></button>
        <section class="card practice-card">
          <h2>練習${helpButton('practice')}</h2>
          <div class="practice-btns">
            <button class="secondary" data-act="pr-nk-daily">今日の何切る${PracticeUI.dailyDone() ? '<small>（解いた）</small>' : ''}</button>
            <button class="secondary" data-act="pr-sq-new">${furigana('点数計算')}の練習</button>
          </div>
        </section>
        <div class="start-grid">
        <section class="card">
          <h2>対局</h2>
          <label class="row"><span>対局の長さ${helpButton('len')}</span>
            <select id="len">
              <option value="tonpu" ${s.rules.gameLength === 'tonpu' ? 'selected' : ''}>東風戦</option>
              <option value="hanchan" ${s.rules.gameLength === 'hanchan' ? 'selected' : ''}>半荘戦</option>
            </select>
            <small class="sel-note">${furigana('東風戦')}・${furigana('半荘戦')}</small>
          </label>
          <label class="row"><span>CPUの速さ${helpButton('speed')}</span>
            <select id="speed">
              <option value="1.6" ${s.speed === 1.6 ? 'selected' : ''}>ゆっくり</option>
              <option value="1" ${s.speed === 1 ? 'selected' : ''}>ふつう</option>
              <option value="0.5" ${s.speed === 0.5 ? 'selected' : ''}>はやい</option>
            </select>
          </label>
          <label class="row inline"><span>効果音</span><input type="checkbox" id="sound" ${s.sound ? 'checked' : ''}></label>
        </section>
        <section class="card">
          <h2>CPUの強さ${helpButton('level')}</h2>
          ${levelSelect(0, '下家（右）')}
          ${levelSelect(1, '対面（上）')}
          ${levelSelect(2, '上家（左）')}
        </section>
        </div>
        <section class="card">
          <h2>ルール</h2>
          ${RULE_ROWS.map(([key, label]) => `
            <label class="row"><span>${furigana(label)}${helpButton(key)}</span><input type="checkbox" data-rule="${key}" ${s.rules[key] ? 'checked' : ''}></label>`).join('')}
        </section>
        <button class="primary big" data-act="start">対局開始</button>
        <button class="big secondary" data-act="stats">戦績を見る</button>
        <div class="dex-btns">
          <button class="big secondary" data-act="charas">キャラ図鑑</button>
          <button class="big secondary" data-act="pr-dex">${furigana('役')}の図鑑</button>
        </div>
        ${analyticsEnabled() ? '<p class="privacy">利用状況の把握のため、アクセス解析（GoatCounter）を使用しています。Cookieや個人を特定する情報は使用しません。</p>' : ''}
      </div>`;
  }

  /** 初めて開いた人に一度だけ、教室を案内する */
  private showIntroOnce(): void {
    const p = loadProgress();
    if (p.introShown) return;
    let firstTime = true;
    try {
      firstTime = !localStorage.getItem(SETTINGS_KEY);
    } catch {
      firstTime = true;
    }
    p.introShown = true;
    saveProgress(p);
    if (!firstTime) return;
    const h = charaFor(9);
    document.body.insertAdjacentHTML('beforeend', `
      <div class="overlay intro-overlay">
        <div class="dialog intro-dialog">
          <div class="intro-face">${h.face('happy')}</div>
          <h2>はじめまして！</h2>
          <p>${furiganaKids('わしは、ほー博士じゃ。麻雀のルールを知らなくても大丈夫。')}<b>まーじゃん${furiganaKids('教室')}</b>${furiganaKids('で、ゼロから楽しく覚えられるぞ。')}</p>
          <div class="btns">
            <button class="primary" data-act="lesson">${furiganaKids('教室へ行く')}</button>
            <button data-act="intro-later">${furiganaKids('もう知っているので、あとで')}</button>
          </div>
        </div>
      </div>`);
  }

  // ------------------------------------------------------------------
  // キャラクター
  // ------------------------------------------------------------------

  /** 「Lv1　ぴよ　[顔]」（withSpecies: 一覧では動物の種類も） */
  private levelItemHtml(level: number, withSpecies = false): string {
    const c = charaFor(level);
    return `<span class="lv-lv">Lv${levelLabel(level)}</span><span class="lv-nm">${c.name}${withSpecies ? `<small>${c.species}</small>` : ''}</span><span class="lv-ic">${c.face('normal')}</span>`;
  }

  private closeLevelLists(): void {
    this.root.querySelectorAll('.lv-list').forEach((e) => e.remove());
  }

  /** 席の子の顔 */
  private faceHtml(g: Game, seat: number, expr: Expr, cls: string): string {
    return `<span class="${cls}">${charaFor(g.players[seat].level).face(expr)}</span>`;
  }

  /** CPUにしゃべらせる（吹き出しは少しして消える） */
  private speak(seat: number, talk: Talk, expr?: Expr): void {
    const g = this.game;
    if (!g || seat === 0 || g.players[seat].isHuman) return;
    const key = ++this.talkKey;
    this.speech.set(seat, { text: pickLine(charaFor(g.players[seat].level), talk), key });
    if (expr) this.faces.set(seat, { expr, key });
    this.render();
    setTimeout(() => {
      let changed = false;
      if (this.speech.get(seat)?.key === key) { this.speech.delete(seat); changed = true; }
      if (this.faces.get(seat)?.key === key) { this.faces.delete(seat); changed = true; }
      if (changed && this.game === g) this.render();
    }, 2800);
  }

  /** 卓の中央の箱の角に顔、そばに吹き出し */
  private avatarHtml(g: Game, seat: number): string {
    const c = charaFor(g.players[seat].level);
    const expr = this.faces.get(seat)?.expr ?? 'normal';
    const sp = this.speech.get(seat);
    return `<div class="avatar av-s${seat} ${g.current === seat ? 'turn' : ''}" title="${c.name}（${c.species}）">${c.face(expr)}</div>
      ${sp ? `<div class="speech sp-s${seat}" data-k="${sp.key}">${furigana(sp.text)}</div>` : ''}`;
  }

  /** 局の結果に、キャラのひとこと */
  private resultCommentHtml(g: Game, r: RoundResult): string {
    const line = (seat: number, talk: Talk, expr: Expr) => {
      const c = charaFor(g.players[seat].level);
      return `<div class="chara-comment">${c.face(expr)}<div><b>${c.name}</b>「${furigana(pickLine(c, talk))}」</div></div>`;
    };
    if (r.type === 'win') {
      const w = r.wins[0];
      if (w.seat === 0) {
        // あなたの和了: 振り込んだ子はくやしがり、ツモならだれかがほめる
        const cpu = w.from !== null && w.from !== 0 ? w.from : 1 + Math.floor(Math.random() * 3);
        return w.from !== null && w.from !== 0 ? line(cpu, 'dealIn', 'sad') : line(cpu, 'praise', 'surprised');
      }
      // CPUの和了: 振り込んだのがCPUならその子、そうでなければ和了した子
      if (w.from !== null && w.from !== 0) return line(w.from, 'dealIn', 'sad');
      return line(w.seat, w.from === null ? 'tsumo' : 'ron', 'happy');
    }
    return line(1 + Math.floor(Math.random() * 3), 'draw', 'normal');
  }

  /** 対局の最後に、1位と4位の子のひとこと */
  private finalCommentsHtml(g: Game, st: FinalStanding[]): string {
    const out: string[] = [];
    for (const x of st) {
      if (x.seat === 0 || (x.rank !== 1 && x.rank !== 4)) continue;
      const c = charaFor(g.players[x.seat].level);
      const talk: Talk = x.rank === 1 ? 'first' : 'last';
      out.push(`<div class="chara-comment">${c.face(x.rank === 1 ? 'happy' : 'sad')}<div><b>${c.name}</b>「${furigana(pickLine(c, talk))}」</div></div>`);
    }
    return out.join('');
  }

  /** キャラ図鑑 */
  private showCharas(): void {
    const records = loadRecords();
    const vs = (c: Chara) => {
      let games = 0;
      let wins = 0;
      for (const r of records) {
        r.levels.forEach((l, i) => {
          if (l !== c.level) return;
          games++;
          if (r.ranks && r.rank < r.ranks[i + 1]) wins++;
        });
      }
      return { games, wins };
    };
    const cards = CHARAS.map((c) => {
      const v = vs(c);
      return `
        <section class="card chara-card">
          <div class="cc-faces">${(['normal', 'happy', 'sad', 'surprised'] as Expr[]).map((e) => `<span>${c.face(e)}</span>`).join('')}</div>
          <div class="cc-head"><b>${c.name}</b><span class="muted">${c.species}・レベル${levelLabel(c.level)}</span></div>
          <p class="cc-catch">「${furigana(c.catchphrase)}」</p>
          <p class="cc-profile">${furigana(c.profile)}</p>
          <div class="cc-vs">${v.games ? `いっしょに打った回数 <b>${v.games}</b>回・この子より上の順位 <b>${v.wins}</b>回` : 'まだ対戦していません'}</div>
        </section>`;
    }).join('');
    this.root.innerHTML = `
      <div class="start">
        <h1>キャラ図鑑</h1>
        <p class="sub">CPUのレベルごとに、ちがう子が登場します</p>
        ${cards}
        <button class="primary big" data-act="title">戻る</button>
      </div>`;
  }

  // ------------------------------------------------------------------
  // 戦績画面
  // ------------------------------------------------------------------

  private showStats(): void {
    const all = loadRecords();
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
    const block = (title: string, list: GameRecord[]) => {
      if (list.length === 0) return '';
      const m = summarize(list);
      const max = Math.max(1, ...m.rankDist);
      return `
        <section class="card stats-card">
          <h2>${title}<span class="muted"> ${m.games}戦</span></h2>
          <div class="stat-main">
            <div><span>平均順位</span><b>${m.avgRank.toFixed(2)}</b></div>
            <div><span>合計ポイント</span><b class="${m.totalPoint >= 0 ? 'plus' : 'minus'}">${m.totalPoint > 0 ? '+' : ''}${m.totalPoint.toFixed(1)}</b></div>
          </div>
          <div class="rank-bars">
            ${m.rankDist.map((n, i) => `
              <div class="rb"><span>${i + 1}位</span><div class="bar"><i class="r${i + 1}" style="width:${(n / max) * 100}%"></i></div><span class="num">${n}回 (${pct(n / m.games)})</span></div>`).join('')}
          </div>
          <div class="stat-grid">
            <div><span>${furigana('和了率')}</span><b>${pct(m.winRate)}</b></div>
            <div><span>${furigana('放銃率')}</span><b>${pct(m.dealinRate)}</b></div>
            <div><span>${furigana('立直率')}</span><b>${pct(m.riichiRate)}</b></div>
            <div><span>${furigana('副露率')}</span><b>${pct(m.callRate)}</b></div>
            <div><span>${furigana('平均和了点')}</span><b>${fmt(Math.round(m.avgWin))}</b></div>
          </div>
        </section>`;
    };
    const bands = ['Lv1〜3', 'Lv4〜6', 'Lv7〜10', '鬼・神あり'];
    const recent = all.slice(-10).reverse().map((r) => `
      <tr><td>${new Date(r.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}</td>
      <td>${r.length === 'tonpu' ? '東風' : '半荘'}</td><td>Lv${r.levels.map(levelLabel).join('/')}</td>
      <td class="num rank-${r.rank}">${r.rank}位</td><td class="num">${fmt(r.score)}</td></tr>`).join('');
    this.root.innerHTML = `
      <div class="start">
        <h1>戦績</h1>
        <p class="sub">この端末のブラウザに保存されています（${all.length}戦）</p>
        ${all.length === 0 ? '<section class="card"><p>まだ記録がありません。対局を最後まで終えると記録されます。</p></section>' : ''}
        ${block('すべて', all)}
        ${bands.map((b) => block(`CPU ${b}`, all.filter((r) => levelBand(r.levels) === b))).join('')}
        ${recent ? `<section class="card"><h2>最近の対局</h2><table class="scores recent">${recent}</table></section>` : ''}
        <button class="primary big" data-act="title">戻る</button>
        ${all.length ? '<button class="big danger-btn" data-act="clear-stats">戦績をリセット</button>' : ''}
      </div>`;
  }

  private readStartForm(): void {
    const s = this.settings;
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    s.rules.gameLength = q<HTMLSelectElement>('#len').value as Rules['gameLength'];
    s.speed = Number(q<HTMLSelectElement>('#speed').value);
    this.root.querySelectorAll<HTMLInputElement>('[data-rule]').forEach((el) => {
      s.rules[el.dataset.rule as RuleKey] = el.checked;
    });
    s.sound = q<HTMLInputElement>('#sound').checked;
    setSoundEnabled(s.sound);
    this.root.querySelectorAll<HTMLInputElement>('input[data-level]').forEach((el) => {
      s.levels[Number(el.dataset.level)] = Number(el.value);
    });
    saveSettings(s);
  }

  /**
   * 卒業対局（東風戦）。
   * 初級: ぴよ3人。おすすめ・見込み・役ナビをオン。1回和了ったら卒業
   * 中級: レベル4・5の相手。補助はいつもどおり。2位以内で卒業
   */
  private async startGraduation(course: 'basic' | 'mid' = 'basic'): Promise<void> {
    this.overlay = null;
    if (course === 'basic') {
      this.settings.assist.hint = true;
      this.settings.assist.outlook = true;
      this.settings.yakuSide = true;
      saveSettings(this.settings);
    }
    const levels: [number, number, number] = course === 'basic' ? [1, 1, 1] : [4, 5, 5];
    await this.startGame({ levels, rules: { ...this.settings.rules, gameLength: 'tonpu', undo: true } }, course);
  }

  async startGame(override?: Partial<Pick<Settings, 'levels' | 'rules'>>, lesson: false | 'basic' | 'mid' = false): Promise<void> {
    const s = { ...this.settings, ...override };
    this.lessonGame = lesson;
    const token = ++this.gameToken;
    const live = () => token === this.gameToken;
    // この対局専用の窓口。終了ボタンでやめた後は、古い対局の処理がここで止まる
    let gameRef: Game | null = null;
    const rewound = () => {
      if (gameRef?.rewindRequested) throw new RewindSignal();
    };
    const ui: GameUI = {
      update: () => {
        if (!live()) return;
        rewound();
        this.update();
      },
      delay: (ms) => {
        if (!live()) return never();
        // CPUの番に、ときどきつぶやく
        const cur = gameRef?.current ?? 0;
        if (cur !== 0 && !this.speech.has(cur) && Math.random() < 0.07) this.speak(cur, 'idle');
        return this.delay(ms).then(() => (live() ? rewound() : never<void>()));
      },
      announce: (seat, text) => (live() ? (rewound(), this.announce(seat, text).then(rewound)) : never()),
      showRoundResult: (game, r) => (live() ? this.showRoundResult(game, r) : never()),
    };
    const human = new HumanAgent(this, live);
    const players = [
      { name: 'あなた', isHuman: true, level: 0 },
      ...s.levels.map((l) => ({ name: charaFor(l).name, isHuman: false, level: l })),
    ];
    const agents: Agent[] = [human, new CpuAgent(s.levels[0]), new CpuAgent(s.levels[1]), new CpuAgent(s.levels[2])];
    const g = new Game({ ...s.rules }, players, agents, ui);
    gameRef = g;
    this.game = g;
    this.tally = emptyTally();
    this.review = { match: 0, total: 0, roundMatch: 0, roundTotal: 0, last: null };
    this.animatedDiscard = '';
    trackEvent('game-start', '対局開始');
    this.speech.clear();
    this.faces.clear();
    // あいさつ（少しずつずらして）
    [1, 2, 3].forEach((seat, i) => setTimeout(() => { if (live()) this.speak(seat, 'start', 'happy'); }, 400 + i * 900));
    trackEvent(`length-${s.rules.gameLength}`, s.rules.gameLength === 'tonpu' ? '東風戦' : '半荘戦');
    for (const l of s.levels) trackEvent(`cpu-level-${levelLabel(l)}`, `CPUレベル${levelLabel(l)}`);
    const standings = await g.run();
    if (!live()) return;
    await this.showFinal(standings);
  }

  // ------------------------------------------------------------------
  // GameUI
  // ------------------------------------------------------------------

  update(): void {
    this.render();
  }

  delay(ms: number): Promise<void> {
    return sleep(ms * this.settings.speed);
  }

  async announce(seat: number, text: string): Promise<void> {
    const talk: Talk | null = text === 'リーチ' ? 'riichi' : text === 'ツモ' ? 'tsumo' : text === 'ロン' ? 'ron'
      : ['ポン', 'チー', 'カン'].includes(text) ? 'call' : null;
    if (talk) this.speak(seat, talk, talk === 'riichi' || talk === 'call' ? 'normal' : 'happy');
    // だれかのリーチに、ほかのCPUが反応する
    if (text === 'リーチ' && Math.random() < 0.7) {
      const others = [1, 2, 3].filter((s) => s !== seat);
      const o = others[Math.floor(Math.random() * others.length)];
      setTimeout(() => this.speak(o, 'reactRiichi', 'surprised'), 700);
    }
    if (text === 'ロン' || text === 'ツモ') sfx.win();
    else if (text === 'リーチ') sfx.riichi();
    else sfx.call();
    this.bubbles.set(seat, text);
    this.render();
    await sleep(Math.max(500, 900 * this.settings.speed));
    this.bubbles.delete(seat);
    this.render();
  }

  showRoundResult(g: Game, r: RoundResult): Promise<void> {
    this.aimYaku = null;
    this.aimCache = null;
    const me = g.players[0];
    const t = this.tally;
    t.rounds++;
    const myWin = r.wins.find((w) => w.seat === 0);
    if (myWin) {
      t.wins++;
      t.winPoints += myWin.gain;
    }
    if (r.wins.some((w) => w.from === 0)) t.dealins++;
    if (me.riichi) t.riichi++;
    if (me.melds.some((m) => m.type !== 'ankan')) t.calls++;
    if (r.type !== 'win') sfx.draw();
    return new Promise((resolve) => {
      let banner = '';
      if (this.lessonGame === 'basic' && myWin) {
        const p = loadProgress();
        if (!p.graduated) {
          p.graduated = true;
          saveProgress(p);
          banner = `<div class="graduate-banner">${charaFor(9).face('happy')}<div><b>🎓 ${furiganaKids('卒業おめでとう！')}</b><p>${furiganaKids('はじめての和了じゃ！ これで、まーじゃん教室は卒業じゃ。このまま対局を続けてもいいし、トップ画面で好きな相手を選んで遊ぶのもよいぞ。')}</p></div></div>`;
        }
      }
      if (myWin) {
        const fresh = recordDex(myWin.result);
        if (fresh.length) banner += `<div class="dex-new">📖 ${furigana('役の図鑑に新しく登録')}：${fresh.map((n) => yakuRuby(n)).join('・')}</div>`;
      }
      this.overlay = { html: banner + this.resultHtml(g, r), resolve };
      this.review.roundMatch = 0;
      this.review.roundTotal = 0;
      this.review.last = null;
      this.render();
      if (r.type === 'win' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.countUp();
        const w = r.wins[0];
        const stampAt = (w.hand.length + 1) * 45 + (w.result.yaku.length + 2) * 140;
        if (w.result.yakuman) setTimeout(() => sfx.yakuman(), stampAt);
        else if (w.result.limit) setTimeout(() => sfx.stamp(), stampAt);
      }
    });
  }

  setPending(p: Pending): void {
    this.pending = p;
    this.selected = null;
    this.riichiMode = false;
    this.render();
  }

  private resolveTurn(a: TurnAction): void {
    const p = this.pending;
    if (!p || p.kind !== 'turn') return;
    if (a.type === 'discard' && this.game) this.recordDiscard(this.game, a.tile);
    this.pending = null;
    this.selected = null;
    this.riichiMode = false;
    p.resolve(a);
  }

  /** ふり返り用: おすすめと同じ打牌だったか、捨てた牌の危険度（予想）を記録 */
  private recordDiscard(g: Game, tile: Tile): void {
    const me = g.players[0];
    if (me.riichi) return; // リーチ後は選べないので数えない
    try {
      const adv = this.hint(g);
      if (adv?.kind === 'turn' && adv.action.type === 'discard') {
        const ok = kindOf(adv.action.tile) === kindOf(tile);
        this.review.total++;
        this.review.roundTotal++;
        if (ok) {
          this.review.match++;
          this.review.roundMatch++;
        }
      }
      const d = handDanger(g, 'est');
      const danger = d.get(kindOf(tile))?.value ?? 0;
      const safest = Math.min(...[...d.values()].map((x) => x.value));
      this.review.last = { tile, danger, safest };
    } catch {
      /* ふり返りは失敗しても対局を止めない */
    }
  }

  /** 局の結果に出す、ふり返り */
  private reviewHtml(r: RoundResult): string {
    const v = this.review;
    const lines: string[] = [];
    if (v.roundTotal > 0) lines.push(`この局、おすすめと同じ牌を切ったのは <b>${v.roundMatch} / ${v.roundTotal}回</b>`);
    const dealt = r.type === 'win' && r.wins.some((w) => w.from === 0);
    if (dealt && v.last) {
      const pct = (x: number) => `約${Math.max(1, Math.round(x * 100))}%`;
      lines.push(`${furigana('振り込んだ')}${kindRuby(kindOf(v.last.tile))}${furigana('の危険度（予想）は')} <b>${pct(v.last.danger)}</b>`
        + furigana(v.last.safest < v.last.danger - 0.03 ? `。手の中でいちばん安全な牌なら ${pct(v.last.safest)} でした`
          : v.last.danger < 0.05 ? '。予想ではほぼ安全な牌で、運が悪かったといえます' : '。ほかの牌も同じくらい危険でした'));
    }
    if (!lines.length) return '';
    return `<div class="review"><b class="review-title">ふり返り</b>${lines.map((l) => `<p>${l}</p>`).join('')}</div>`;
  }

  private resolveCall(a: CallAction): void {
    const p = this.pending;
    if (!p || p.kind !== 'call') return;
    this.pending = null;
    p.resolve(a);
  }

  // ------------------------------------------------------------------
  // 入力
  // ------------------------------------------------------------------

  private onClick(e: Event): void {
    const pop = (e.target as HTMLElement).closest<HTMLElement>('[data-yaku-pop]');
    if (pop) {
      // 役名のタップは説明の開閉ではなく、図柄のポップアップ
      e.preventDefault();
      if (this.popFor === pop.dataset.yakuPop) this.hideYakuPop();
      else this.showYakuPop(pop);
      return;
    }
    if (!(e.target as HTMLElement).closest('.yk-pop')) this.hideYakuPop();
    // レベルの選択欄の外をタップしたら閉じる
    if (!(e.target as HTMLElement).closest('.lv-pick')) this.closeLevelLists();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const act = el.dataset.act!;
    if (act.startsWith('ls-')) {
      this.lessons.handle(act, el);
      return;
    }
    if (act.startsWith('pr-')) {
      this.practice.handle(act, el);
      return;
    }
    const pend = this.pending;
    switch (act) {
      case 'toggle': {
        const key = el.dataset.key as 'remain' | 'hint' | 'outlook' | 'open';
        this.settings.assist[key] = !this.settings.assist[key];
        saveSettings(this.settings);
        this.render();
        return;
      }
      case 'yaku-open':
        if (this.yakuSideMode()) {
          this.settings.yakuSide = !this.settings.yakuSide;
          saveSettings(this.settings);
        } else {
          this.yakuOpen = true;
        }
        this.render();
        return;
      case 'yaku-aim': {
        const name = el.dataset.yaku!;
        this.aimYaku = this.aimYaku === name ? null : name;
        this.aimCache = null;
        trackEvent('yaku-aim', '役を狙う');
        this.render();
        return;
      }
      case 'yaku-close':
        // 背景（ウインドウの外）か × ボタン
        if (el.classList.contains('yaku-backdrop') && e.target !== el) return;
        this.yakuOpen = false;
        this.render();
        return;
      case 'undo': {
        const g = this.game;
        if (!g || this.overlay || !g.rules.undo) return;
        // 自分が牌を選んでいる最中なら1つ前の自分の番へ、それ以外は直近の自分の番へ
        if (!g.requestRewind(this.pending?.kind === 'turn')) return;
        const p = this.pending;
        this.pending = null;
        this.selected = null;
        this.riichiMode = false;
        this.bubbles.clear();
        this.hintCache = null;
        this.aimCache = null;
        trackEvent('undo', '待った');
        p?.reject(new RewindSignal());
        return;
      }
      case 'quit':
        document.querySelector('.confirm-overlay')?.remove();
        document.body.insertAdjacentHTML('beforeend', `
          <div class="overlay help-overlay confirm-overlay" data-act="quit-no">
            <div class="dialog confirm-dialog" role="alertdialog" aria-modal="true">
              <h2>対局をやめますか？</h2>
              <p>トップ画面に戻ります。この対局は最後まで終わっていないので、戦績には記録されません。</p>
              <div class="btns">
                <button data-act="quit-no">続ける</button>
                <button class="danger-solid" data-act="quit-yes">やめる</button>
              </div>
            </div>
          </div>`);
        return;
      case 'quit-no':
        if (el.classList.contains('confirm-overlay') && e.target !== el) return;
        document.querySelector('.confirm-overlay')?.remove();
        return;
      case 'quit-yes':
        document.querySelector('.confirm-overlay')?.remove();
        this.gameToken++;
        this.pending = null;
        this.overlay = null;
        this.bubbles.clear();
        this.yakuOpen = false;
        trackEvent('game-quit', '途中終了');
        this.showStart();
        return;
      case 'sound': {
        this.settings.sound = !this.settings.sound;
        setSoundEnabled(this.settings.sound);
        if (this.settings.sound) {
          unlockAudio();
          sfx.select();
        }
        saveSettings(this.settings);
        this.render();
        return;
      }
      case 'danger': {
        const order: DangerMode[] = ['off', 'est', 'true'];
        const a = this.settings.assist;
        a.danger = order[(order.indexOf(a.danger) + 1) % order.length];
        saveSettings(this.settings);
        this.render();
        return;
      }
      case 'help':
        // label 内のボタンなので、チェックボックスやセレクトが反応しないようにする
        e.preventDefault();
        document.querySelector('.help-overlay')?.remove();
        document.body.insertAdjacentHTML('beforeend', helpDialogHtml(el.dataset.help!));
        return;
      case 'close-help':
        // ダイアログ本文のタップでは閉じない（背景か閉じるボタンのみ）
        if (el.classList.contains('help-overlay') && e.target !== el) return;
        document.querySelector('.help-overlay')?.remove();
        return;
      case 'lv-open': {
        const i = el.dataset.i!;
        const pick = this.root.querySelector<HTMLElement>(`.lv-pick[data-pick="${i}"]`)!;
        const wasOpen = !!pick.querySelector('.lv-list');
        this.closeLevelLists();
        if (wasOpen) return;
        const cur = Number(pick.querySelector<HTMLInputElement>('input[data-level]')!.value);
        const levels = [...Array.from({ length: 10 }, (_, n) => n + 1), LEVEL_ONI, LEVEL_KAMI];
        pick.insertAdjacentHTML('beforeend', `<div class="lv-list" role="listbox">${levels.map((l) => `
          <button type="button" class="lv-item ${l === cur ? 'cur' : ''}" role="option" aria-selected="${l === cur}" data-act="lv-pick" data-i="${i}" data-level-value="${l}">${this.levelItemHtml(l, true)}</button>`).join('')}</div>`);
        pick.querySelector('.lv-item.cur')?.scrollIntoView({ block: 'nearest' });
        return;
      }
      case 'lv-pick': {
        const i = el.dataset.i!;
        const l = Number(el.dataset.levelValue);
        const pick = this.root.querySelector<HTMLElement>(`.lv-pick[data-pick="${i}"]`)!;
        pick.querySelector<HTMLInputElement>('input[data-level]')!.value = String(l);
        pick.querySelector('.lv-btn')!.innerHTML = `${this.levelItemHtml(l)}<span class="lv-caret">▾</span>`;
        this.closeLevelLists();
        return;
      }
      case 'charas':
        this.showCharas();
        return;
      case 'stats':
        this.showStats();
        return;
      case 'clear-stats':
        if (window.confirm('戦績をすべて削除します。よろしいですか？')) {
          clearRecords();
          this.showStats();
        }
        return;
      case 'start':
        unlockAudio();
        this.readStartForm();
        void this.startGame();
        return;
      case 'title':
        this.overlay = null;
        this.showStart();
        return;
      case 'lesson':
        this.overlay = null;
        document.querySelector('.intro-overlay')?.remove();
        this.lessonGame = false;
        this.game = null;
        this.lessons.showMenu();
        return;
      case 'intro-later':
        document.querySelector('.intro-overlay')?.remove();
        return;
      case 'restart':
        this.overlay = null;
        void this.startGame();
        return;
      case 'next': {
        const o = this.overlay;
        this.overlay = null;
        o?.resolve();
        return;
      }
      case 'tile': {
        if (!pend || pend.kind !== 'turn') return;
        const t = Number(el.dataset.tile);
        const allowed = this.riichiMode ? pend.opts.riichiTiles : pend.opts.discardable;
        if (!allowed.includes(t)) return;
        if (this.selected === t) {
          this.resolveTurn({ type: 'discard', tile: t, riichi: this.riichiMode });
        } else {
          this.selected = t;
          sfx.select();
          this.render();
        }
        return;
      }
      case 'tsumo':
        this.resolveTurn({ type: 'tsumo' });
        return;
      case 'riichi':
        this.riichiMode = !this.riichiMode;
        this.selected = null;
        this.render();
        return;
      case 'ankan':
        this.resolveTurn({ type: 'ankan', kind: Number(el.dataset.kind) });
        return;
      case 'kakan':
        this.resolveTurn({ type: 'kakan', kind: Number(el.dataset.kind) });
        return;
      case 'kyuushu':
        this.resolveTurn({ type: 'kyuushu' });
        return;
      case 'ron':
        this.resolveCall({ type: 'ron' });
        return;
      case 'pon':
        if (pend?.kind === 'call') this.resolveCall({ type: 'pon', tiles: pend.opts.pon[Number(el.dataset.i)] });
        return;
      case 'chi':
        if (pend?.kind === 'call') this.resolveCall({ type: 'chi', tiles: pend.opts.chi[Number(el.dataset.i)] });
        return;
      case 'minkan':
        this.resolveCall({ type: 'minkan' });
        return;
      case 'pass':
        this.resolveCall({ type: 'pass' });
        return;
    }
  }

  // ------------------------------------------------------------------
  // 描画
  // ------------------------------------------------------------------

  private render(): void {
    const g = this.game;
    if (!g) return;
    const red = (t: Tile) => g.isRed(t);
    // 再描画で補助パネルのスクロール位置が戻らないようにする
    const scroll = this.root.querySelector('.assist')?.scrollTop ?? 0;
    const yakuScroll = this.root.querySelector('.yaku-panel, .yaku-side')?.scrollTop ?? 0;
    // 画面が広ければ、役ナビを卓の横に常に表示する
    const wide = this.yakuSideMode();
    const side = wide && this.settings.yakuSide;
    // 新しい捨て牌・ツモ牌だけアニメーションさせる（再描画のたびに動かないように）
    const ld = g.lastDiscard;
    const dKey = ld ? `${g.roundName}-${g.honba}-${ld.seat}-${ld.index}` : '';
    this.animDiscard = dKey !== '' && dKey !== this.animatedDiscard;
    if (this.animDiscard) sfx.discard();
    this.animatedDiscard = dKey;
    const drawn = g.players[0].drawn;
    this.animDraw = drawn !== null && drawn !== this.animatedDraw;
    this.animatedDraw = drawn;
    this.root.innerHTML = `
      <div class="game ${side ? 'side-layout' : ''}">
        <div class="board-wrap"><div class="board">
          ${this.centerHtml(g)}
          ${[0, 1, 2, 3].map((s) => this.seatHtml(g, s)).join('')}
          ${[1, 2, 3].map((seat) => this.avatarHtml(g, seat)).join('')}
          ${this.soundButtonHtml()}
          ${this.undoButtonHtml(g)}
          <button class="quit-btn" data-act="quit" aria-label="対局をやめてトップ画面に戻る">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
          </button>
          ${this.toolbarHtml()}
          <div class="controls">${this.controlsHtml(g)}</div>
          ${this.aimTagHtml(g)}
          <div class="yaku-corner"><button class="yaku-btn ${side ? 'on' : ''}" data-act="yaku-open" aria-pressed="${side}">${furigana('役')}ナビ</button>${helpButton('yaku')}</div>
          ${!wide && this.yakuOpen ? `<div class="yaku-panel">${this.yakuHtml(g, true)}</div>` : ''}
        </div></div>
        ${!wide && this.yakuOpen ? '<div class="yaku-backdrop" data-act="yaku-close"></div>' : ''}
        <div class="me">
          <div class="my-melds">${g.players[0].melds.map((m) => meldHtml(m, 0, red)).join('')}</div>
          <div class="my-hand has-badges">${this.myHandHtml(g)}</div>
        </div>
        <div class="assist">${this.assistHtml(g)}</div>
        ${side ? `<aside class="yaku-side">${this.yakuHtml(g, false)}</aside>` : ''}
        ${this.overlay ? `<div class="overlay"><div class="dialog">${this.overlay.html}</div></div>` : ''}
      </div>`;
    const assist = this.root.querySelector('.assist');
    if (assist) assist.scrollTop = scroll;
    const yk = this.root.querySelector('.yaku-panel, .yaku-side');
    if (yk) yk.scrollTop = yakuScroll;
  }

  private centerHtml(g: Game): string {
    return `
      <div class="round-info">
        <div class="round">${roundRuby(g.roundName)}<small>${g.honba}${furigana('本場')}</small></div>
        <div class="label">${furigana('ドラ表示牌')}</div>
        <div class="dora">${g.doraIndicators.map((t) => tileHtml(t, { red: g.isRed(t) })).join('')}${
          '<div class="tile back"></div>'.repeat(5 - g.doraCount)}</div>
      </div>
      <div class="center">
        <div class="remain">残り <b>${g.live.length}</b></div>
        ${g.kyoutaku > 0 ? `<div class="kyoutaku">${furigana('供託')} ${g.kyoutaku}</div>` : ''}
      </div>`;
  }

  private seatHtml(g: Game, seat: number): string {
    const p = g.players[seat];
    const red = (t: Tile) => g.isRed(t);
    const wind = WIND_NAMES[g.seatWind(seat) - 27];
    const active = g.current === seat && !this.overlay;
    const river = p.river.map((r, i) => {
      const cls: string[] = [];
      if (r.called) cls.push('called');
      if (g.lastDiscard && g.lastDiscard.seat === seat && g.lastDiscard.index === i) {
        cls.push('last');
        if (this.animDiscard) cls.push('enter');
      }
      if (r.tsumogiri) cls.push('tsumogiri');
      return tileHtml(r.tile, { sideways: r.riichi, red: red(r.tile), classes: cls });
    }).join('');
    let handArea = '';
    if (seat !== 0) {
      const open = this.settings.assist.open;
      const shown = open ? p.hand.slice().sort((a, b) => a - b) : p.hand;
      const backs = shown.map((t) => tileHtml(t, { back: !open, red: open && red(t) })).join('');
      handArea = `<div class="cpu-hand"><div class="tiles">${backs}</div>${p.melds.map((m) => meldHtml(m, seat, red)).join('')}</div>`;
    }
    const bubble = this.bubbles.get(seat);
    return `
      <div class="layer rot${seat}">
        <div class="score ${active ? 'active' : ''} ${seat === g.dealer ? 'dealer' : ''}">
          <span class="wind">${wind}</span>
          <span class="pts">${fmt(p.score)}</span>
          ${p.riichi ? '<span class="stick"></span>' : ''}
        </div>
        <div class="river">${river}</div>
        ${handArea}
        ${bubble ? `<div class="bubble">${furigana(bubble)}</div>` : ''}
      </div>`;
  }

  // ------------------------------------------------------------------
  // 補助機能
  // ------------------------------------------------------------------

  private toolbarHtml(): string {
    const a = this.settings.assist;
    const chip = (key: string, label: string, on: boolean) =>
      `<div class="tool-row"><button class="chip ${on ? 'on' : ''} ${on && key === 'open' ? 'cheat' : ''}" data-act="toggle" data-key="${key}" aria-pressed="${on}">${label}</button>${helpButton(key)}</div>`;
    const dangerLabel = { off: '危険牌', est: '危険牌：予想', true: '危険牌：正解' }[a.danger];
    // 卓の右下の空いている角に縦1列で置く。それぞれの右に説明の？
    return `
      <div class="tools">
        ${chip('hint', 'おすすめ', a.hint)}
        ${chip('outlook', '見込み', a.outlook)}
        <div class="tool-row"><button class="chip ${a.danger !== 'off' ? 'on' : ''} ${a.danger === 'true' ? 'cheat' : ''}" data-act="danger">${dangerLabel}</button>${helpButton('danger')}</div>
        ${chip('remain', '残り牌', a.remain)}
        ${chip('open', 'カンニング', a.open)}
      </div>`;
  }

  /** 役名のポップアップを、役名の上か下に出す */
  private popFor: string | null = null;

  private showYakuPop(target: HTMLElement): void {
    const name = target.dataset.yakuPop!;
    if (this.popFor === name && document.querySelector('.yk-pop')) return;
    this.hideYakuPop();
    this.popFor = name;
    const el = document.createElement('div');
    el.className = 'yk-pop';
    el.innerHTML = yakuPopHtml(name);
    document.body.appendChild(el);
    const r = target.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = r.bottom + 6 + h <= window.innerHeight - 8;
    el.style.left = `${left}px`;
    el.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - h - 6)}px`;
  }

  private hideYakuPop(): void {
    document.querySelectorAll('.yk-pop').forEach((e) => e.remove());
    this.popFor = null;
  }

  /** 待ったボタン（戻れないときは薄く表示） */
  private undoButtonHtml(g: Game): string {
    if (!g.rules.undo) return '';
    const ok = !this.overlay && g.canRewind(this.pending?.kind === 'turn');
    return `<button class="undo-btn" data-act="undo" ${ok ? '' : 'disabled'} aria-label="待った（1手前の自分の番に戻る）">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7L4 12l5 5M4.5 12H15a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>待った
    </button>`;
  }

  /** 狙っている役のおすすめの捨て牌（手番ごとに1回計算） */
  private aimTile(g: Game): Tile | null {
    const pend = this.pending;
    if (!this.aimYaku || !pend || pend.kind !== 'turn' || g.players[0].riichi) return null;
    if (this.aimCache?.pending !== pend || this.aimCache.aim !== this.aimYaku) {
      const tile = aimDiscard(g, this.aimYaku, pend.opts.discardable, remainCounts(g, 0, this.settings.assist.open));
      this.aimCache = { pending: pend, aim: this.aimYaku, tile };
    }
    return this.aimCache.tile;
  }

  /** 卓の左下の「◆狙い：◯◯」の札 */
  private aimTagHtml(g: Game): string {
    if (!this.aimYaku) return '';
    const need = yakuNeed(g, this.aimYaku, remainCounts(g, 0, this.settings.assist.open), String(this.settings.assist.open));
    const state = !Number.isFinite(need) ? '<span class="aim-ng">もう成立しません</span>'
      : need === 0 ? '<span class="aim-ok">完成！</span>' : `あと${need}枚`;
    return `<div class="aim-tag"><span>◆狙い：${yakuRuby(this.aimYaku)} ${state}</span><button data-act="yaku-aim" data-yaku="${this.aimYaku}" aria-label="狙いを解除">×</button></div>`;
  }

  /** 画面が広く、卓の横に役ナビを置く余裕があるか */
  private yakuSideMode(): boolean {
    const board = Math.min(window.innerWidth, window.innerHeight - 200, 640);
    return window.innerWidth >= board + 380;
  }

  private yakuHtml(g: Game, closable: boolean): string {
    return yakuGuideHtml(g, remainCounts(g, 0, this.settings.assist.open), this.yakuOpenItems, closable, this.aimYaku, String(this.settings.assist.open));
  }

  /** 卓の左上の、効果音のオン・オフ */
  private soundButtonHtml(): string {
    const on = this.settings.sound;
    const wave = on
      ? '<path d="M16 8.5a5 5 0 0 1 0 7M18.8 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      : '<path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
    return `<button class="sound-btn ${on ? 'sound-on' : 'sound-off'}" data-act="sound" aria-label="効果音を${on ? 'オフ' : 'オン'}にする" aria-pressed="${on}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/>${wave}</svg>
    </button>`;
  }

  /** おすすめ（手番・鳴き確認ごとにキャッシュ。カンニングを切り替えたら考え直す） */
  private hint(g: Game): Advice | null {
    const pend = this.pending;
    if (!pend) return null;
    const open = this.settings.assist.open;
    if (this.hintCache?.pending !== pend || this.hintCache.open !== open) {
      const advice = pend.kind === 'turn'
        ? adviseTurn(g, pend.opts, 0, open)
        : adviseCall(g, pend.tile, pend.from, pend.opts, 0, open);
      this.hintCache = { pending: pend, open, advice };
    }
    return this.hintCache.advice;
  }

  /** ヒントが勧める捨て牌（打牌以外を勧めるときは null） */
  private hintTile(g: Game): { tile: Tile; fold: boolean } | null {
    const adv = this.settings.assist.hint ? this.hint(g) : null;
    if (adv?.kind !== 'turn' || adv.action.type !== 'discard') return null;
    // リーチ牌を選んでいる間は、リーチを勧めているときだけ★を出す
    if (this.riichiMode && !adv.action.riichi) return null;
    return { tile: adv.action.tile, fold: adv.fold };
  }

  /** 勧めているボタンに★を付ける */
  private recBtn(on: boolean, label: string): { cls: string; label: string } {
    // ★はボタンの角に重ねて表示する（ボタンの幅が変わらないように）
    return { cls: on ? 'rec' : '', label };
  }

  private dangerBadge(v: number, mode: DangerMode, hitBy: number[]): string {
    if (mode === 'true') {
      if (hitBy.length === 0) return '<span class="b-safe">安</span>';
      const who = hitBy.map((s) => ['', '下', '対', '上'][s]).join('');
      return `<span class="b-hit">当${who}</span>`;
    }
    if (v < 0.005) return '<span class="b-safe">安</span>';
    const pct = Math.max(1, Math.round(v * 100));
    const cls = v < 0.04 ? 'b-low' : v < 0.09 ? 'b-mid' : 'b-high';
    return `<span class="${cls}">${pct}%</span>`;
  }

  /** 役・期待値の表示。専門用語にふりがなを付け、初心者向けの言い換えを添える */
  /** 捨てる牌ごとのくらべ。行をタップするとその牌を選ぶ（もう一度タップで捨てる） */
  private compareHtml(t: CompareTable): string {
    const tenpai = t.mode === 'tenpai';
    const title = tenpai
      ? `${T.tenpai}のとり方くらべ<small>（${furigana('和了率')}の高い順）</small>`
      : `${T.tenpai}の一歩手前<small>（${T.tenpai}になる牌が多い順）</small>`;
    const rows = t.rows.map((r) => {
      const sel = this.selected !== null && kindOf(this.selected) === kindOf(r.tile);
      const tiles = r.tiles.map((w) => `<span class="cmp-tile ${w.remain === 0 ? 'zero' : ''}">${tileHtml(w.kind * 4 + 3)}<small>${w.remain}枚</small></span>`).join('');
      const nums = tenpai
        ? `<span class="cmp-nums"><b>約${Math.round(r.winProb! * 100)}%</b><small>${r.points ? `約${fmt(r.points)}点` : furigana('役なし')}</small></span>`
        : `<span class="cmp-nums"><b>${r.total}枚</b></span>`;
      return `<button class="cmp-row ${sel ? 'sel' : ''}" data-act="tile" data-tile="${r.tile}">
          <span class="cmp-cut">${tileHtml(r.tile, { red: this.game?.isRed(r.tile) })}<small>を切る</small></span>
          <span class="cmp-waits">${tiles}</span>${nums}</button>`;
    }).join('');
    const head = tenpai ? `<span>${T.machi}と残り枚数</span><span>${furigana('和了率')}・点数</span>` : `<span>引くと${T.tenpai}になる牌と残り枚数</span><span>合計</span>`;
    return `<div class="compare"><div class="cmp-title">${title}</div><div class="cmp-head">${head}</div>${rows}</div>`;
  }

  private outlookHtml(g: Game, o: Outlook, head: string, ukeire?: number): string {
    let shanten: string;
    if (o.shanten < 0) shanten = `<b>${T.agari}の形</b>`;
    else if (o.shanten === 0) shanten = `<b>${T.tenpai}</b><span class="o-note">あと1枚で${T.agari}できる形</span>`;
    else shanten = `<b>${T.shanten(o.shanten)}</b><span class="o-note">${T.tenpai}まで あと${o.shanten}枚</span>`;
    const yaku = o.yaku.length ? o.yaku.map(yakuRuby).join('・') : `<span class="warn">${furigana('役')}がありません（このままでは${T.agari}できない）</span>`;
    let waits = '';
    if (o.waits.length) {
      waits = `<div class="waits"><span class="o-label">${T.machi}<small>（当たり牌）</small></span>${o.waits.map((w) => `
        <span class="wait">${tileHtml(w.kind * 4 + 3)}<small>残り${w.remain}枚<br>${w.ron || w.tsumo ? `${fmt(Math.max(w.ron, w.tsumo))}点` : '役なし'}</small></span>`).join('')}</div>`;
    }
    const riichiNote = o.assumeRiichi && o.shanten >= 0 ? '<small class="muted">（リーチした場合）</small>' : '';
    return `
      <div class="outlook">
        <div class="o-head">${head}${shanten}${this.settings.assist.open ? `<small class="o-open">${furigana('カンニング中：CPUの手牌も数えています')}</small>` : ''}</div>
        <div class="o-yaku"><span class="o-label">目指せる${furigana('役')}</span>${yaku}</div>
        <div class="o-nums">
          <span>${T.agari}時の点数 <b>${o.points ? `約${fmt(o.points)}点` : '—'}</b>${riichiNote}</span>
          <span>${furigana('和了率')} <b>約${Math.round(o.winProb * 100)}%</b><small>（あがれる確率）</small></span>
          <span>期待値 <b>約${fmt(Math.round(o.ev / 100) * 100)}点</b><small>（点数×${furigana('和了率')}）</small></span>
          ${ukeire !== undefined ? `<span>${T.ukeire} <b>${ukeire}枚</b><small>（引くとテンパイに近づく牌の残り）</small></span>` : ''}
        </div>
        ${waits}
      </div>`;
  }

  private assistHtml(g: Game): string {
    const a = this.settings.assist;
    const parts: string[] = [];
    const pend = this.pending?.kind === 'turn' ? this.pending : null;
    const p = g.players[0];


    if (a.outlook) {
      if (pend && this.selected !== null) {
        const info = discardInfo(g, this.selected, 0, a.open);
        parts.push(this.outlookHtml(g, info.outlook, `${kindRuby(kindOf(this.selected))}を切ると：`, info.ukeire));
      } else if (pend) {
        const adv = this.hint(g);
        const tile = adv?.kind === 'turn' && adv.action.type === 'discard' ? adv.action.tile : pend.opts.discardable[0];
        const info = discardInfo(g, tile, 0, a.open);
        parts.push(this.outlookHtml(g, info.outlook, '最善の打牌をした場合：', info.ukeire));
      } else if (p.hand.length % 3 === 1) {
        parts.push(this.outlookHtml(g, outlook(g, 0, undefined, remainCounts(g, 0, a.open)), 'いまの手：'));
      }
      // 捨てる牌ごとのくらべ（テンパイのとり方が複数・テンパイの一歩手前）
      if (pend && !this.riichiMode) {
        const table = compareDiscards(g, pend.opts.discardable, 0, a.open);
        if (table) parts.push(this.compareHtml(table));
      }
    }

    if (a.remain) {
      // 手牌公開中は、見えているCPUの手牌も差し引く
      const rem = remainCounts(g, 0, a.open);
      // 自分の待ち（テンパイのとき）と、役ナビで狙っている役に近づく牌を目立たせる
      const waits = new Set(this.myWaits(g));
      const aims = new Set(this.aimYaku ? aimUsefulKinds(g, this.aimYaku, rem) : []);
      const cell = (k: number) => `<div class="r-cell ${rem[k] === 0 ? 'zero' : ''} ${waits.has(k) ? 'r-wait' : ''} ${aims.has(k) ? 'r-aim' : ''}">${tileHtml(k * 4 + 3)}<span>${rem[k]}</span></div>`;
      // 1段目: 萬子・筒子、2段目: 索子・字牌
      const rows = [[0, 18], [18, 34]].map(([s, e]) =>
        `<div class="r-row">${Array.from({ length: e - s }, (_, i) => cell(s + i)).join('')}</div>`).join('');
      // ほかの補助情報より先（パネルの一番上）に出す
      const legend = (waits.size ? `<span class="lg-wait">${furigana('■和了牌')}</span>` : '') + (aims.size ? '<span class="lg-aim">■狙いの役に近づく牌</span>' : '');
      parts.unshift(`<div class="remain-grid"><div class="r-title">残り牌</div><div class="r-rows">${rows}${legend ? `<div class="r-legend">${legend}</div>` : ''}</div></div>`);
    }
    return parts.join('');
  }

  /** 自分の待ち（13枚でテンパイのとき。14枚なら選んでいる牌を捨てた後） */
  private myWaits(g: Game): Kind[] {
    const p = g.players[0];
    let hand = p.hand;
    if (hand.length % 3 === 2) {
      if (this.selected === null) return [];
      hand = hand.slice();
      hand.splice(hand.indexOf(this.selected), 1);
    }
    const counts = toCounts(hand);
    if (calcShanten(counts, p.melds.length) !== 0) return [];
    return getWaits(counts, p.melds.length);
  }

  private myHandHtml(g: Game): string {
    const p = g.players[0];
    const pend = this.pending?.kind === 'turn' ? this.pending : null;
    const allowed = pend ? (this.riichiMode ? pend.opts.riichiTiles : pend.opts.discardable) : [];
    const drawn = p.drawn;
    const tiles = p.hand.filter((t) => t !== drawn);
    const a = this.settings.assist;
    const danger = a.danger !== 'off' ? handDanger(g, a.danger) : null;
    const rec = pend ? this.hintTile(g) : null;
    const aimTile = pend && !this.riichiMode ? this.aimTile(g) : null;
    // ドラ（表示牌の次の牌）と赤ドラは金色に光らせる
    const doraKinds = new Set(g.doraIndicators.map((t) => doraFromIndicator(kindOf(t))));
    const one = (t: Tile, extra: string[] = []) => {
      const cls = [...extra];
      if (doraKinds.has(kindOf(t)) || g.isRed(t)) cls.push('is-dora');
      if (pend) cls.push(allowed.includes(t) ? 'can' : 'dim');
      if (this.selected === t) cls.push('selected');
      const badges: string[] = [];
      // 攻めのおすすめは★（金）、守備（安全な牌を優先）のおすすめは●（水色）
      if (rec && kindOf(rec.tile) === kindOf(t)) {
        badges.push(rec.fold ? '<span class="b-guard" title="守備のおすすめ">●</span>' : '<span class="b-star" title="攻めのおすすめ">★</span>');
      }
      const d = danger?.get(kindOf(t));
      if (aimTile !== null && kindOf(aimTile) === kindOf(t)) badges.push('<span class="b-aim" title="狙っている役のおすすめ">◆</span>');
      if (d) badges.push(this.dangerBadge(d.value, a.danger, d.hitBy));
      const tile = tileHtml(t, { red: g.isRed(t), classes: cls, attrs: { 'data-act': 'tile', 'data-tile': t } });
      return `<div class="slot${extra.includes('drawn') ? ' drawn-slot' : ''}"><div class="badges">${badges.join('')}</div>${tile}</div>`;
    };
    return tiles.map((t) => one(t)).join('') + (drawn !== null ? one(drawn, this.animDraw ? ['drawn', 'draw-in'] : ['drawn']) : '');
  }

  private controlsHtml(g: Game): string {
    const pend = this.pending;
    if (!pend) {
      const p = g.players[0];
      const waits = g.waitsOf(p);
      return waits.length ? `<div class="info">${T.machi}: ${waits.map(kindRuby).join(' ')}${g.isFuriten(p, waits) ? '（フリテン）' : ''}</div>` : '';
    }
    const b: string[] = [];
    const adv = this.settings.assist.hint ? this.hint(g) : null;
    if (pend.kind === 'turn') {
      const o = pend.opts;
      const act = adv?.kind === 'turn' ? adv.action : null;
      const btn = (on: boolean, base: string, attrs: string, label: string) => {
        const r = this.recBtn(on, label);
        return `<button class="${base} ${r.cls}" ${attrs}>${r.label}</button>`;
      };
      if (o.canTsumo) b.push(btn(act?.type === 'tsumo', 'win', 'data-act="tsumo"', 'ツモ'));
      if (o.riichiTiles.length) b.push(btn(act?.type === 'discard' && !!act.riichi, this.riichiMode ? 'on' : '', 'data-act="riichi"', 'リーチ'));
      for (const k of o.ankanKinds) b.push(btn(act?.type === 'ankan' && act.kind === k, '', `data-act="ankan" data-kind="${k}"`, `カン ${kindRuby(k)}`));
      for (const k of o.kakanKinds) b.push(btn(act?.type === 'kakan' && act.kind === k, '', `data-act="kakan" data-kind="${k}"`, `カン ${kindRuby(k)}`));
      if (o.canKyuushu) b.push(btn(act?.type === 'kyuushu', '', 'data-act="kyuushu"', furigana('九種九牌')));
      const hint = this.riichiMode ? 'リーチする牌を選んでください' : this.selected !== null ? 'もう一度タップで打牌' : '捨てる牌をタップ';
      return `<div class="ctl-buttons">${b.join('')}</div><div class="info">${hint}</div>`;
    }
    const o = pend.opts;
    const from = ['', '下家', '対面', '上家'][pend.from];
    const act = adv?.kind === 'call' ? adv.action : null;
    const same = (x: Tile[], y: Tile[]) => x.length === y.length && x.every((t) => y.includes(t));
    const btn = (on: boolean, base: string, attrs: string, label: string) => {
      const r = this.recBtn(on, label);
      return `<button class="${base} ${r.cls}" ${attrs}>${r.label}</button>`;
    };
    if (o.canRon) b.push(btn(act?.type === 'ron', 'win', 'data-act="ron"', 'ロン'));
    o.pon.forEach((v, i) => b.push(btn(act?.type === 'pon' && same(act.tiles, v), '', `data-act="pon" data-i="${i}"`, `ポン${o.pon.length > 1 ? this.miniTiles(g, v) : ''}`)));
    o.chi.forEach((v, i) => b.push(btn(act?.type === 'chi' && same(act.tiles, v), '', `data-act="chi" data-i="${i}"`, `チー${this.miniTiles(g, v)}`)));
    if (o.minkan) b.push(btn(act?.type === 'minkan', '', 'data-act="minkan"', 'カン'));
    b.push(btn(act?.type === 'pass', 'pass', 'data-act="pass"', 'スキップ'));
    return `<div class="ctl-buttons">${b.join('')}</div><div class="info">${furigana(from)}の ${kindRuby(kindOf(pend.tile))}</div>`;
  }

  private miniTiles(g: Game, tiles: Tile[]): string {
    return `<span class="mini">${tiles.map((t) => tileHtml(t, { red: g.isRed(t) })).join('')}</span>`;
  }

  // ------------------------------------------------------------------
  // 結果画面
  // ------------------------------------------------------------------

  private handBlock(
    g: Game, hand: Tile[], melds: RoundResult['wins'][number]['melds'], seat: number, winTile?: Tile,
    fx?: { doraKinds: Set<number> },
  ): string {
    const red = (t: Tile) => g.isRed(t);
    const sorted = hand.slice().sort((a, b) => a - b);
    let i = 0;
    const one = (t: Tile, extra: string[] = []) => {
      const cls = [...extra];
      if (fx) {
        cls.push('fx-in');
        if (fx.doraKinds.has(kindOf(t)) || red(t)) cls.push('glow-dora');
      }
      return tileHtml(t, { red: red(t), classes: cls, attrs: fx ? { style: `--i:${i++}` } : {} });
    };
    return `<div class="result-hand">
      ${sorted.map((t) => one(t)).join('')}
      ${winTile !== undefined ? `<span class="gap"></span>${one(winTile, ['win-tile'])}` : ''}
      ${melds.map((m) => meldHtml(m, seat, red)).join('')}
    </div>`;
  }

  /** 紙吹雪 */
  private confettiHtml(n: number): string {
    const colors = ['#f2b33d', '#e2483d', '#5ec8ff', '#63d38f', '#c58cff', '#fff'];
    return `<div class="confetti" aria-hidden="true">${Array.from({ length: n }, (_, i) =>
      `<i style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 0.8).toFixed(2)}s;animation-duration:${(1.6 + Math.random() * 1.2).toFixed(2)}s;--r:${Math.floor(Math.random() * 720 - 360)}deg"></i>`).join('')}</div>`;
  }

  /** 点数を0から数え上げる */
  private countUp(): void {
    this.root.querySelectorAll<HTMLElement>('.points .count').forEach((el) => {
      const to = Number(el.dataset.to);
      const block = el.closest<HTMLElement>('.win-block');
      const tiles = Number(block?.style.getPropertyValue('--tiles') || 14);
      const n = Number(block?.querySelector<HTMLElement>('.yaku')?.style.getPropertyValue('--n') || 1);
      const delay = tiles * 45 + n * 140 + 200;
      const dur = 900;
      const start = performance.now() + delay;
      el.textContent = '0';
      const step = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - start) / dur));
        el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - t, 3))));
        if (t < 1 && el.isConnected) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      // 画面が裏にあってアニメーションが止まっていても、最後は必ず正しい点数にする
      setTimeout(() => { el.textContent = fmt(to); }, delay + dur + 50);
    });
  }

  private resultHtml(g: Game, r: RoundResult): string {
    const names = g.players.map((p) => furigana(p.name));
    let body = '';
    if (r.type === 'win') {
      body = r.wins.map((w) => {
        const res = w.result;
        const how = w.from === null ? 'ツモ' : `ロン（${names[w.from]}から）`;
        const yaku = res.yaku.map((y) => `<li class="fx-in"><span>${yakuRuby(y.name)}</span><span>${y.yakuman ? furigana(y.yakuman > 1 ? `${y.yakuman}倍役満` : '役満') : `${y.han}${furigana('翻')}`}</span></li>`);
        if (res.dora) yaku.push(`<li class="fx-in"><span>ドラ</span><span>${res.dora}${furigana('翻')}</span></li>`);
        if (res.aka) yaku.push(`<li class="fx-in"><span>${furigana('赤ドラ')}</span><span>${res.aka}${furigana('翻')}</span></li>`);
        if (res.ura) yaku.push(`<li class="fx-in"><span>${furigana('裏ドラ')}</span><span>${res.ura}${furigana('翻')}</span></li>`);
        const head = res.yakuman ? res.limit : `${res.fu}符 ${res.han}翻${res.limit ? ` ${res.limit}` : ''}`;
        const showUra = g.players[w.seat].riichi;
        const doraKinds = new Set([...g.doraIndicators, ...(showUra ? r.uraIndicators : [])].map((t) => doraFromIndicator(kindOf(t))));
        const tileCount = w.hand.length + 1;
        const tier = res.yakuman ? 'yakuman' : ({ 満貫: 'mangan', 跳満: 'haneman', 倍満: 'baiman', 三倍満: 'sanbaiman', 数え役満: 'yakuman' } as Record<string, string>)[res.limit] ?? '';
        const big = !!tier && (w.seat === 0 || tier === 'yakuman');
        return `
          <div class="win-block ${tier === 'yakuman' ? 'yakuman-fx' : ''}" style="--tiles:${tileCount};--n:${yaku.length}">
            ${big ? this.confettiHtml(tier === 'yakuman' ? 60 : 36) : ''}
            <h3>${w.seat !== 0 ? this.faceHtml(g, w.seat, 'happy', 'res-face') : ''}${names[w.seat]} の ${how}</h3>
            ${this.handBlock(g, w.hand, w.melds, w.seat, w.winTile, { doraKinds })}
            <div class="dora-row">ドラ ${g.doraIndicators.map((t) => tileHtml(t, { red: g.isRed(t) })).join('')}
              ${showUra ? `　<ruby>裏<rt>うら</rt></ruby> ${r.uraIndicators.map((t) => tileHtml(t, { red: g.isRed(t) })).join('')}` : ''}</div>
            <ul class="yaku" style="--n:${yaku.length}">${yaku.map((li, i) => li.replace('class="fx-in"', `class="fx-in" style="--j:${i}"`)).join('')}</ul>
            ${tier ? `<div class="stamp tier-${tier}">${furigana(res.limit)}</div>` : ''}
            <div class="points">${furigana(head)}　<b class="count" data-to="${w.gain}">${fmt(w.gain)}</b><b>点</b></div>
          </div>`;
      }).join('');
    } else if (r.type === 'draw') {
      body = `<h3>${furigana('流局')}</h3>` + g.players.map((p, s) => `
        <div class="draw-row"><span class="${r.tenpai[s] ? 'tenpai' : 'noten'}">${r.tenpai[s] ? 'テンパイ' : 'ノーテン'}</span> ${names[s]}
        ${r.tenpai[s] ? this.handBlock(g, p.hand, p.melds, s) : ''}</div>`).join('');
    } else {
      body = `<h3>${furigana(`途中流局：${r.reason}`)}</h3>`;
    }
    const scores = g.players.map((p, s) => `
      <tr><td>${s !== 0 ? this.faceHtml(g, s, r.scoreDelta[s] > 0 ? 'happy' : r.scoreDelta[s] < 0 ? 'sad' : 'normal', 'row-face') : ''}${names[s]}</td><td class="num">${fmt(p.score)}</td>
      <td class="num ${r.scoreDelta[s] > 0 ? 'plus' : r.scoreDelta[s] < 0 ? 'minus' : ''}">${r.scoreDelta[s] ? signed(r.scoreDelta[s]) : ''}</td></tr>`).join('');
    return `
      <div class="result">
        <div class="result-title">${roundRuby(g.roundName)} ${g.honba}${furigana('本場')}</div>
        ${body}
        ${this.resultCommentHtml(g, r)}
        ${this.reviewHtml(r)}
        <table class="scores">${scores}</table>
        <button class="primary" data-act="next">次へ</button>
      </div>`;
  }

  private showFinal(st: FinalStanding[]): Promise<void> {
    const g = this.game!;
    const rows = st.map((x) => `
      <tr class="${x.seat === 0 ? 'me-row' : ''}"><td>${x.rank}位</td><td>${x.seat !== 0 ? this.faceHtml(g, x.seat, x.rank === 1 ? 'happy' : x.rank === 4 ? 'sad' : 'normal', 'row-face') : ''}${furigana(g.players[x.seat].name)}</td>
      <td class="num">${fmt(x.score)}</td><td class="num ${x.point >= 0 ? 'plus' : 'minus'}">${x.point > 0 ? '+' : ''}${x.point.toFixed(1)}</td></tr>`).join('');
    const mine = st.find((x) => x.seat === 0)!;
    const myRank = mine.rank;
    saveRecord({
      date: new Date().toISOString(),
      length: g.rules.gameLength,
      levels: g.players.slice(1).map((p) => p.level),
      rank: mine.rank,
      score: mine.score,
      point: mine.point,
      ...this.tally,
      ranks: [0, 1, 2, 3].map((s) => st.find((x) => x.seat === s)!.rank),
    });
    if (myRank === 1) sfx.win();
    trackEvent('game-finish', '対局終了');
    trackEvent(`rank-${myRank}`, `最終${myRank}位`);
    // 中級の卒業対局: 2位以内で卒業
    let midBanner = '';
    if (this.lessonGame === 'mid' && myRank <= 2) {
      const p = loadProgress();
      if (!p.midGrad) {
        p.midGrad = true;
        saveProgress(p);
        midBanner = `<div class="graduate-banner">${charaFor(9).face('happy')}<div><b>🎓 ${furiganaKids('中級コース卒業おめでとう！')}</b><p>${furiganaKids(`${myRank}位、見事じゃ！ 次は上級コースで、点数のしくみを学んでみるとよいぞ。`)}</p></div></div>`;
      }
    }
    const lp = loadProgress();
    const passed = this.lessonGame === 'mid' ? lp.midGrad : lp.graduated;
    return new Promise((resolve) => {
      this.overlay = {
        html: `
          <div class="result final">
            ${midBanner}
            <div class="result-title">対局終了</div>
            <h2 class="rank rank${myRank}">あなたは ${myRank}位</h2>
            <table class="scores">${rows}</table>
            ${this.finalCommentsHtml(g, st)}
            ${this.review.total ? `<div class="review"><b class="review-title">ふり返り</b><p>おすすめと同じ牌を切った割合 <b>${Math.round((this.review.match / this.review.total) * 100)}%</b>（${this.review.match} / ${this.review.total}回）</p></div>` : ''}
            <div class="btns">
              ${this.lessonGame
    ? `${passed ? '' : `<button class="primary" data-act="ls-graduate" data-c="${this.lessonGame}">もう一度卒業対局</button>`}<button class="${passed ? 'primary' : ''}" data-act="lesson">教室に戻る</button><button data-act="title">トップ画面へ</button>`
    : '<button class="primary" data-act="restart">同じ設定でもう一度</button><button data-act="title">設定に戻る</button>'}
            </div>
          </div>`,
        resolve,
      };
      this.render();
    });
  }
}

