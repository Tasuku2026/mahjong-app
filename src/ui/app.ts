import {
  Agent, CallAction, CallOptions, FinalStanding, Game, GameUI, RoundResult, TurnAction, TurnOptions,
} from '../core/game';
import { Tile, kindOf, WIND_NAMES } from '../core/tiles';
import { DEFAULT_RULES, Rules } from '../core/types';
import { CpuAgent, LEVEL_KAMI, LEVEL_ONI, levelLabel } from '../ai/cpu';
import { tileHtml, meldHtml } from './tileView';
import { helpButton, helpDialogHtml } from './help';
import { T, furigana, kindRuby, roundRuby, yakuRuby } from './terms';
import { AssistSettings, DEFAULT_ASSIST, DangerMode, Advice, adviseCall, adviseTurn, discardInfo, handDanger, remainCounts } from './assist';
import { outlook, Outlook } from '../ai/value';
import { setSoundEnabled, sfx, unlockAudio } from './sound';
import { analyticsEnabled, trackEvent } from './analytics';
import { SPACE_DEBUG, centerFreeHtml, paintBoardFree, paintLowerFree } from './debugSpace';
import { GameRecord, RoundTally, clearRecords, emptyTally, levelBand, loadRecords, saveRecord, summarize } from './stats';

type Pending =
  | { kind: 'turn'; seat: number; opts: TurnOptions; resolve: (a: TurnAction) => void }
  | { kind: 'call'; seat: number; tile: Tile; from: number; opts: CallOptions; resolve: (a: CallAction) => void };

export interface Settings {
  rules: Rules;
  levels: [number, number, number];
  speed: number;
  assist: AssistSettings;
  sound: boolean;
}

type RuleKey = 'aka' | 'kuitan' | 'kiriage' | 'tobi' | 'agariYame' | 'extension';

const RULE_ROWS: [RuleKey, string][] = [
  ['aka', '赤ドラ'],
  ['kuitan', '喰いタン'],
  ['kiriage', '切り上げ満貫'],
  ['tobi', 'トビ終了'],
  ['agariYame', 'アガリやめ'],
  ['extension', '延長戦（西入・南入）'],
];

const SETTINGS_KEY = 'mahjong-settings-v1';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const fmt = (n: number) => n.toLocaleString('ja-JP');
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '±0');

function loadSettings(): Settings {
  const def: Settings = { rules: { ...DEFAULT_RULES }, levels: [5, 5, 5], speed: 1, assist: { ...DEFAULT_ASSIST }, sound: true };
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

class HumanAgent implements Agent {
  constructor(private app: App) {}

  async turn(g: Game, seat: number, opts: TurnOptions): Promise<TurnAction> {
    const p = g.players[seat];
    // リーチ後は和了・暗槓の選択肢がなければ自動でツモ切り
    if (p.riichi && !opts.canTsumo && opts.ankanKinds.length === 0) {
      await g.ui.delay(450);
      return { type: 'discard', tile: opts.discardable[0] };
    }
    return new Promise((resolve) => this.app.setPending({ kind: 'turn', seat, opts, resolve }));
  }

  call(_g: Game, seat: number, tile: Tile, from: number, opts: CallOptions): Promise<CallAction> {
    return new Promise((resolve) => this.app.setPending({ kind: 'call', seat, tile, from, opts, resolve }));
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
  private hintCache: { pending: Pending; advice: Advice } | null = null;
  /** この対局での自分の成績 */
  private tally: RoundTally = emptyTally();
  /** アニメーション済みの捨て牌・ツモ牌 */
  private animatedDiscard = '';
  private animatedDraw: Tile | null = null;
  private animDiscard = false;
  private animDraw = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.settings = loadSettings();
    setSoundEnabled(this.settings.sound);
    // ヘルプは root の外（body 直下）に出すため document で受ける
    document.addEventListener('click', (e) => this.onClick(e));
  }

  // ------------------------------------------------------------------
  // スタート画面
  // ------------------------------------------------------------------

  showStart(): void {
    this.game = null;
    const s = this.settings;
    const levelSelect = (i: number, label: string) => `
      <label class="row"><span>${furigana(label)}</span>
        <select data-level="${i}">
          ${Array.from({ length: 10 }, (_, n) => `<option value="${n + 1}" ${s.levels[i] === n + 1 ? 'selected' : ''}>レベル ${n + 1}</option>`).join('')}
          <option value="${LEVEL_ONI}" ${s.levels[i] === LEVEL_ONI ? 'selected' : ''}>レベル鬼</option>
          <option value="${LEVEL_KAMI}" ${s.levels[i] === LEVEL_KAMI ? 'selected' : ''}>レベル神</option>
        </select>
      </label>`;
    this.root.innerHTML = `
      <div class="start">
        <h1>ひとり麻雀</h1>
        <p class="sub">CPU 3人と対局する4人打ちリーチ麻雀</p>
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
        ${analyticsEnabled() ? '<p class="privacy">利用状況の把握のため、アクセス解析（GoatCounter）を使用しています。Cookieや個人を特定する情報は使用しません。</p>' : ''}
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
    this.root.querySelectorAll<HTMLSelectElement>('[data-level]').forEach((el) => {
      s.levels[Number(el.dataset.level)] = Number(el.value);
    });
    saveSettings(s);
  }

  async startGame(): Promise<void> {
    const s = this.settings;
    const human = new HumanAgent(this);
    const players = [
      { name: 'あなた', isHuman: true, level: 0 },
      { name: `下家 Lv${levelLabel(s.levels[0])}`, isHuman: false, level: s.levels[0] },
      { name: `対面 Lv${levelLabel(s.levels[1])}`, isHuman: false, level: s.levels[1] },
      { name: `上家 Lv${levelLabel(s.levels[2])}`, isHuman: false, level: s.levels[2] },
    ];
    const agents: Agent[] = [human, new CpuAgent(s.levels[0]), new CpuAgent(s.levels[1]), new CpuAgent(s.levels[2])];
    const g = new Game({ ...s.rules }, players, agents, this);
    this.game = g;
    this.tally = emptyTally();
    this.animatedDiscard = '';
    trackEvent('game-start', '対局開始');
    trackEvent(`length-${s.rules.gameLength}`, s.rules.gameLength === 'tonpu' ? '東風戦' : '半荘戦');
    for (const l of s.levels) trackEvent(`cpu-level-${levelLabel(l)}`, `CPUレベル${levelLabel(l)}`);
    const standings = await g.run();
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
      this.overlay = { html: this.resultHtml(g, r), resolve };
      this.render();
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
    this.pending = null;
    this.selected = null;
    this.riichiMode = false;
    p.resolve(a);
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
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const act = el.dataset.act!;
    const pend = this.pending;
    switch (act) {
      case 'toggle': {
        const key = el.dataset.key as 'remain' | 'hint' | 'outlook' | 'open';
        this.settings.assist[key] = !this.settings.assist[key];
        saveSettings(this.settings);
        this.render();
        return;
      }
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
      <div class="game">
        <div class="board-wrap ${SPACE_DEBUG ? 'space-debug' : ''}"><div class="board">
          ${this.centerHtml(g)}
          ${[0, 1, 2, 3].map((s) => this.seatHtml(g, s)).join('')}
          ${this.soundButtonHtml()}
          ${this.toolbarHtml()}
          ${SPACE_DEBUG ? centerFreeHtml() : ''}
        </div></div>
        <div class="controls">${this.controlsHtml(g)}</div>
        <div class="me">
          <div class="my-melds">${g.players[0].melds.map((m) => meldHtml(m, 0, red)).join('')}</div>
          <div class="my-hand has-badges">${this.myHandHtml(g)}</div>
        </div>
        <div class="assist">${this.assistHtml(g)}</div>
        ${this.overlay ? `<div class="overlay"><div class="dialog">${this.overlay.html}</div></div>` : ''}
      </div>`;
    const assist = this.root.querySelector('.assist');
    if (assist) assist.scrollTop = scroll;
    if (SPACE_DEBUG) {
      paintBoardFree(this.root);
      paintLowerFree(this.root);
    }
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
      `<button class="chip ${on ? 'on' : ''}" data-act="toggle" data-key="${key}" aria-pressed="${on}">${label}</button>`;
    const dangerLabel = { off: '危険度', est: '危険度：推定', true: '危険度：透視' }[a.danger];
    // 卓の右下の空いている角に縦1列で置く。？は右側のCPUの手牌と同じ列の一番下
    return `
      <div class="tools">
        ${chip('hint', 'ヒント', a.hint)}
        ${chip('outlook', furigana('役') + '・期待値', a.outlook)}
        <button class="chip ${a.danger !== 'off' ? 'on' : ''} ${a.danger === 'true' ? 'cheat' : ''}" data-act="danger">${dangerLabel}</button>
        ${chip('remain', '残り枚数', a.remain)}
        ${chip('open', furigana('手牌') + '公開', a.open)}
      </div>
      <div class="tools-help">${helpButton('assist')}</div>`;
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

  /** おすすめ（手番・鳴き確認ごとにキャッシュ） */
  private hint(g: Game): Advice | null {
    const pend = this.pending;
    if (!pend) return null;
    if (this.hintCache?.pending !== pend) {
      const advice = pend.kind === 'turn'
        ? adviseTurn(g, pend.opts)
        : adviseCall(g, pend.tile, pend.from, pend.opts);
      this.hintCache = { pending: pend, advice };
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
        <div class="o-head">${head}${shanten}</div>
        <div class="o-yaku"><span class="o-label">目指せる${furigana('役')}</span>${yaku}</div>
        <div class="o-nums">
          <span>${T.agari}時の点数 <b>${o.points ? `約${fmt(o.points)}点` : '—'}</b>${riichiNote}</span>
          <span>${furigana('和了率')} <b>約${Math.round(o.winProb * 100)}%</b><small>（あがれる確率）</small></span>
          <span>期待値 <b>約${fmt(Math.round(o.ev / 100) * 100)}点</b><small>（点数×${furigana('和了率')}）</small></span>
          ${ukeire !== undefined ? `<span>${T.ukeire} <b>${ukeire}枚</b><small>（手が進む牌の残り）</small></span>` : ''}
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
        const info = discardInfo(g, this.selected);
        parts.push(this.outlookHtml(g, info.outlook, `${kindRuby(kindOf(this.selected))}を切ると：`, info.ukeire));
      } else if (pend) {
        const adv = this.hint(g);
        const tile = adv?.kind === 'turn' && adv.action.type === 'discard' ? adv.action.tile : pend.opts.discardable[0];
        const info = discardInfo(g, tile);
        parts.push(this.outlookHtml(g, info.outlook, '最善の打牌をした場合：', info.ukeire));
      } else if (p.hand.length % 3 === 1) {
        parts.push(this.outlookHtml(g, outlook(g, 0), 'いまの手：'));
      }
    }

    if (a.remain) {
      const rem = remainCounts(g);
      const cell = (k: number) => `<div class="r-cell ${rem[k] === 0 ? 'zero' : ''}">${tileHtml(k * 4 + 3)}<span>${rem[k]}</span></div>`;
      // 1段目: 萬子・筒子、2段目: 索子・字牌
      const rows = [[0, 18], [18, 34]].map(([s, e]) =>
        `<div class="r-row">${Array.from({ length: e - s }, (_, i) => cell(s + i)).join('')}</div>`).join('');
      // ほかの補助情報より先（パネルの一番上）に出す
      parts.unshift(`<div class="remain-grid"><div class="muted small">残り枚数（あなたから見えていない枚数・暗い牌は0枚）</div>${rows}</div>`);
    }
    return parts.join('');
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
    const one = (t: Tile, extra: string[] = []) => {
      const cls = [...extra];
      if (pend) cls.push(allowed.includes(t) ? 'can' : 'dim');
      if (this.selected === t) cls.push('selected');
      const badges: string[] = [];
      // 攻めのおすすめは★（金）、守備（安全な牌を優先）のおすすめは●（水色）
      if (rec && kindOf(rec.tile) === kindOf(t)) {
        badges.push(rec.fold ? '<span class="b-guard" title="守備のおすすめ">●</span>' : '<span class="b-star" title="攻めのおすすめ">★</span>');
      }
      const d = danger?.get(kindOf(t));
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
      return `${b.join('')}<div class="info">${hint}</div>`;
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
    return `<div class="info">${furigana(from)}の ${kindRuby(kindOf(pend.tile))}</div>${b.join('')}`;
  }

  private miniTiles(g: Game, tiles: Tile[]): string {
    return `<span class="mini">${tiles.map((t) => tileHtml(t, { red: g.isRed(t) })).join('')}</span>`;
  }

  // ------------------------------------------------------------------
  // 結果画面
  // ------------------------------------------------------------------

  private handBlock(g: Game, hand: Tile[], melds: RoundResult['wins'][number]['melds'], seat: number, winTile?: Tile): string {
    const red = (t: Tile) => g.isRed(t);
    const sorted = hand.slice().sort((a, b) => a - b);
    return `<div class="result-hand">
      ${sorted.map((t) => tileHtml(t, { red: red(t) })).join('')}
      ${winTile !== undefined ? `<span class="gap"></span>${tileHtml(winTile, { red: red(winTile), classes: ['win-tile'] })}` : ''}
      ${melds.map((m) => meldHtml(m, seat, red)).join('')}
    </div>`;
  }

  private resultHtml(g: Game, r: RoundResult): string {
    const names = g.players.map((p) => furigana(p.name));
    let body = '';
    if (r.type === 'win') {
      body = r.wins.map((w) => {
        const res = w.result;
        const how = w.from === null ? 'ツモ' : `ロン（${names[w.from]}から）`;
        const yaku = res.yaku.map((y) => `<li><span>${yakuRuby(y.name)}</span><span>${y.yakuman ? furigana(y.yakuman > 1 ? `${y.yakuman}倍役満` : '役満') : `${y.han}${furigana('翻')}`}</span></li>`);
        if (res.dora) yaku.push(`<li><span>ドラ</span><span>${res.dora}${furigana('翻')}</span></li>`);
        if (res.aka) yaku.push(`<li><span>${furigana('赤ドラ')}</span><span>${res.aka}${furigana('翻')}</span></li>`);
        if (res.ura) yaku.push(`<li><span>${furigana('裏ドラ')}</span><span>${res.ura}${furigana('翻')}</span></li>`);
        const head = res.yakuman ? res.limit : `${res.fu}符 ${res.han}翻${res.limit ? ` ${res.limit}` : ''}`;
        const showUra = g.players[w.seat].riichi;
        return `
          <div class="win-block">
            <h3>${names[w.seat]} の ${how}</h3>
            ${this.handBlock(g, w.hand, w.melds, w.seat, w.winTile)}
            <div class="dora-row">ドラ ${g.doraIndicators.map((t) => tileHtml(t, { red: g.isRed(t) })).join('')}
              ${showUra ? `　<ruby>裏<rt>うら</rt></ruby> ${r.uraIndicators.map((t) => tileHtml(t, { red: g.isRed(t) })).join('')}` : ''}</div>
            <ul class="yaku">${yaku.join('')}</ul>
            <div class="points">${furigana(head)}　<b>${fmt(w.gain)}点</b></div>
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
      <tr><td>${names[s]}</td><td class="num">${fmt(p.score)}</td>
      <td class="num ${r.scoreDelta[s] > 0 ? 'plus' : r.scoreDelta[s] < 0 ? 'minus' : ''}">${r.scoreDelta[s] ? signed(r.scoreDelta[s]) : ''}</td></tr>`).join('');
    return `
      <div class="result">
        <div class="result-title">${roundRuby(g.roundName)} ${g.honba}${furigana('本場')}</div>
        ${body}
        <table class="scores">${scores}</table>
        <button class="primary" data-act="next">次へ</button>
      </div>`;
  }

  private showFinal(st: FinalStanding[]): Promise<void> {
    const g = this.game!;
    const rows = st.map((x) => `
      <tr class="${x.seat === 0 ? 'me-row' : ''}"><td>${x.rank}位</td><td>${furigana(g.players[x.seat].name)}</td>
      <td class="num">${fmt(x.score)}</td><td class="num ${x.point >= 0 ? 'plus' : 'minus'}">${x.point > 0 ? '+' : ''}${x.point.toFixed(1)}</td></tr>`).join('');
    const mine = st.find((x) => x.seat === 0)!;
    const myRank = mine.rank;
    saveRecord({
      date: new Date().toISOString(),
      length: g.rules.gameLength,
      levels: [...this.settings.levels],
      rank: mine.rank,
      score: mine.score,
      point: mine.point,
      ...this.tally,
    });
    if (myRank === 1) sfx.win();
    trackEvent('game-finish', '対局終了');
    trackEvent(`rank-${myRank}`, `最終${myRank}位`);
    return new Promise((resolve) => {
      this.overlay = {
        html: `
          <div class="result final">
            <div class="result-title">対局終了</div>
            <h2 class="rank rank${myRank}">あなたは ${myRank}位</h2>
            <table class="scores">${rows}</table>
            <div class="btns">
              <button class="primary" data-act="restart">同じ設定でもう一度</button>
              <button data-act="title">設定に戻る</button>
            </div>
          </div>`,
        resolve,
      };
      this.render();
    });
  }
}

