import {
  Agent, CallAction, CallOptions, FinalStanding, Game, GameUI, RoundResult, TurnAction, TurnOptions,
} from '../core/game';
import { Tile, kindOf, kindName, WIND_NAMES } from '../core/tiles';
import { DEFAULT_RULES, Rules } from '../core/types';
import { CpuAgent } from '../ai/cpu';
import { tileHtml, meldHtml } from './tileView';
import { helpButton, helpDialogHtml } from './help';

type Pending =
  | { kind: 'turn'; seat: number; opts: TurnOptions; resolve: (a: TurnAction) => void }
  | { kind: 'call'; seat: number; tile: Tile; from: number; opts: CallOptions; resolve: (a: CallAction) => void };

export interface Settings {
  rules: Rules;
  levels: [number, number, number];
  speed: number;
}

const SETTINGS_KEY = 'mahjong-settings-v1';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const fmt = (n: number) => n.toLocaleString('ja-JP');
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '±0');

function loadSettings(): Settings {
  const def: Settings = { rules: { ...DEFAULT_RULES }, levels: [5, 5, 5], speed: 1 };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return def;
    const s = JSON.parse(raw);
    return { ...def, ...s, rules: { ...def.rules, ...s.rules } };
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

  constructor(root: HTMLElement) {
    this.root = root;
    this.settings = loadSettings();
    root.addEventListener('click', (e) => this.onClick(e));
  }

  // ------------------------------------------------------------------
  // スタート画面
  // ------------------------------------------------------------------

  showStart(): void {
    this.game = null;
    const s = this.settings;
    const levelSelect = (i: number, label: string) => `
      <label class="row"><span>${label}</span>
        <select data-level="${i}">
          ${Array.from({ length: 10 }, (_, n) => `<option value="${n + 1}" ${s.levels[i] === n + 1 ? 'selected' : ''}>レベル ${n + 1}</option>`).join('')}
        </select>
      </label>`;
    this.root.innerHTML = `
      <div class="start">
        <h1>ひとり麻雀</h1>
        <p class="sub">CPU 3人と対局する4人打ちリーチ麻雀</p>
        <section class="card">
          <h2>対局</h2>
          <label class="row"><span>対局の長さ${helpButton('len')}</span>
            <select id="len">
              <option value="tonpu" ${s.rules.gameLength === 'tonpu' ? 'selected' : ''}>東風戦</option>
              <option value="hanchan" ${s.rules.gameLength === 'hanchan' ? 'selected' : ''}>半荘戦</option>
            </select>
          </label>
          <label class="row"><span>CPUの速さ${helpButton('speed')}</span>
            <select id="speed">
              <option value="1.6" ${s.speed === 1.6 ? 'selected' : ''}>ゆっくり</option>
              <option value="1" ${s.speed === 1 ? 'selected' : ''}>ふつう</option>
              <option value="0.5" ${s.speed === 0.5 ? 'selected' : ''}>はやい</option>
            </select>
          </label>
        </section>
        <section class="card">
          <h2>CPUの強さ${helpButton('level')}</h2>
          ${levelSelect(0, '下家（右）')}
          ${levelSelect(1, '対面（上）')}
          ${levelSelect(2, '上家（左）')}
        </section>
        <section class="card">
          <h2>ルール</h2>
          <label class="row"><span>赤ドラ${helpButton('aka')}</span><input type="checkbox" id="aka" ${s.rules.aka ? 'checked' : ''}></label>
          <label class="row"><span>喰いタン${helpButton('kuitan')}</span><input type="checkbox" id="kuitan" ${s.rules.kuitan ? 'checked' : ''}></label>
        </section>
        <button class="primary big" data-act="start">対局開始</button>
      </div>`;
  }

  private readStartForm(): void {
    const s = this.settings;
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    s.rules.gameLength = q<HTMLSelectElement>('#len').value as Rules['gameLength'];
    s.speed = Number(q<HTMLSelectElement>('#speed').value);
    s.rules.aka = q<HTMLInputElement>('#aka').checked;
    s.rules.kuitan = q<HTMLInputElement>('#kuitan').checked;
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
      { name: `下家 Lv${s.levels[0]}`, isHuman: false, level: s.levels[0] },
      { name: `対面 Lv${s.levels[1]}`, isHuman: false, level: s.levels[1] },
      { name: `上家 Lv${s.levels[2]}`, isHuman: false, level: s.levels[2] },
    ];
    const agents: Agent[] = [human, new CpuAgent(s.levels[0]), new CpuAgent(s.levels[1]), new CpuAgent(s.levels[2])];
    const g = new Game({ ...s.rules }, players, agents, this);
    this.game = g;
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
    this.bubbles.set(seat, text);
    this.render();
    await sleep(Math.max(500, 900 * this.settings.speed));
    this.bubbles.delete(seat);
    this.render();
  }

  showRoundResult(g: Game, r: RoundResult): Promise<void> {
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
      case 'help':
        // label 内のボタンなので、チェックボックスやセレクトが反応しないようにする
        e.preventDefault();
        this.root.querySelector('.help-overlay')?.remove();
        this.root.insertAdjacentHTML('beforeend', helpDialogHtml(el.dataset.help!));
        return;
      case 'close-help':
        // ダイアログ本文のタップでは閉じない（背景か閉じるボタンのみ）
        if (el.classList.contains('help-overlay') && e.target !== el) return;
        this.root.querySelector('.help-overlay')?.remove();
        return;
      case 'start':
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
    this.root.innerHTML = `
      <div class="game">
        <div class="board">
          ${this.centerHtml(g)}
          ${[0, 1, 2, 3].map((s) => this.seatHtml(g, s)).join('')}
        </div>
        <div class="controls">${this.controlsHtml(g)}</div>
        <div class="me">
          <div class="my-melds">${g.players[0].melds.map((m) => meldHtml(m, 0, red)).join('')}</div>
          <div class="my-hand">${this.myHandHtml(g)}</div>
        </div>
        ${this.overlay ? `<div class="overlay"><div class="dialog">${this.overlay.html}</div></div>` : ''}
      </div>`;
  }

  private centerHtml(g: Game): string {
    return `
      <div class="round-info">
        <div class="round">${g.roundName}<small>${g.honba}本場</small></div>
        <div class="label">ドラ表示牌</div>
        <div class="dora">${g.doraIndicators.map((t) => tileHtml(t, { red: g.isRed(t) })).join('')}${
          '<div class="tile back"></div>'.repeat(5 - g.doraCount)}</div>
      </div>
      <div class="center">
        <div class="remain">残り <b>${g.live.length}</b></div>
        ${g.kyoutaku > 0 ? `<div class="kyoutaku">供託 ${g.kyoutaku}</div>` : ''}
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
      if (g.lastDiscard && g.lastDiscard.seat === seat && g.lastDiscard.index === i) cls.push('last');
      if (r.tsumogiri) cls.push('tsumogiri');
      return tileHtml(r.tile, { sideways: r.riichi, red: red(r.tile), classes: cls });
    }).join('');
    let handArea = '';
    if (seat !== 0) {
      const backs = p.hand.map((t) => tileHtml(t, { back: true })).join('');
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
        ${bubble ? `<div class="bubble">${bubble}</div>` : ''}
      </div>`;
  }

  private myHandHtml(g: Game): string {
    const p = g.players[0];
    const pend = this.pending?.kind === 'turn' ? this.pending : null;
    const allowed = pend ? (this.riichiMode ? pend.opts.riichiTiles : pend.opts.discardable) : [];
    const drawn = p.drawn;
    const tiles = p.hand.filter((t) => t !== drawn);
    const one = (t: Tile, extra: string[] = []) => {
      const cls = [...extra];
      if (pend) cls.push(allowed.includes(t) ? 'can' : 'dim');
      if (this.selected === t) cls.push('selected');
      return tileHtml(t, { red: g.isRed(t), classes: cls, attrs: { 'data-act': 'tile', 'data-tile': t } });
    };
    return tiles.map((t) => one(t)).join('') + (drawn !== null ? one(drawn, ['drawn']) : '');
  }

  private controlsHtml(g: Game): string {
    const pend = this.pending;
    if (!pend) {
      const p = g.players[0];
      const waits = g.waitsOf(p);
      return waits.length ? `<div class="info">待ち: ${waits.map(kindName).join(' ')}${g.isFuriten(p, waits) ? '（フリテン）' : ''}</div>` : '';
    }
    const b: string[] = [];
    if (pend.kind === 'turn') {
      const o = pend.opts;
      if (o.canTsumo) b.push('<button class="win" data-act="tsumo">ツモ</button>');
      if (o.riichiTiles.length) b.push(`<button class="${this.riichiMode ? 'on' : ''}" data-act="riichi">リーチ</button>`);
      for (const k of o.ankanKinds) b.push(`<button data-act="ankan" data-kind="${k}">カン ${kindName(k)}</button>`);
      for (const k of o.kakanKinds) b.push(`<button data-act="kakan" data-kind="${k}">カン ${kindName(k)}</button>`);
      if (o.canKyuushu) b.push('<button data-act="kyuushu">九種九牌</button>');
      const hint = this.riichiMode ? 'リーチする牌を選んでください' : this.selected !== null ? 'もう一度タップで打牌' : '捨てる牌をタップ';
      return `${b.join('')}<div class="info">${hint}</div>`;
    }
    const o = pend.opts;
    const from = ['', '下家', '対面', '上家'][pend.from];
    if (o.canRon) b.push('<button class="win" data-act="ron">ロン</button>');
    o.pon.forEach((v, i) => b.push(`<button data-act="pon" data-i="${i}">ポン${o.pon.length > 1 ? this.miniTiles(g, v) : ''}</button>`));
    o.chi.forEach((v, i) => b.push(`<button data-act="chi" data-i="${i}">チー${this.miniTiles(g, v)}</button>`));
    if (o.minkan) b.push('<button data-act="minkan">カン</button>');
    b.push('<button class="pass" data-act="pass">スキップ</button>');
    return `<div class="info">${from}の ${kindName(kindOf(pend.tile))}</div>${b.join('')}`;
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
    const names = g.players.map((p) => p.name);
    let body = '';
    if (r.type === 'win') {
      body = r.wins.map((w) => {
        const res = w.result;
        const how = w.from === null ? 'ツモ' : `ロン（${names[w.from]}から）`;
        const yaku = res.yaku.map((y) => `<li><span>${y.name}</span><span>${y.yakuman ? (y.yakuman > 1 ? `${y.yakuman}倍役満` : '役満') : `${y.han}翻`}</span></li>`);
        if (res.dora) yaku.push(`<li><span>ドラ</span><span>${res.dora}翻</span></li>`);
        if (res.aka) yaku.push(`<li><span>赤ドラ</span><span>${res.aka}翻</span></li>`);
        if (res.ura) yaku.push(`<li><span>裏ドラ</span><span>${res.ura}翻</span></li>`);
        const head = res.yakuman ? res.limit : `${res.fu}符 ${res.han}翻${res.limit ? ` ${res.limit}` : ''}`;
        const showUra = g.players[w.seat].riichi;
        return `
          <div class="win-block">
            <h3>${names[w.seat]} の ${how}</h3>
            ${this.handBlock(g, w.hand, w.melds, w.seat, w.winTile)}
            <div class="dora-row">ドラ ${g.doraIndicators.map((t) => tileHtml(t, { red: g.isRed(t) })).join('')}
              ${showUra ? `　裏 ${r.uraIndicators.map((t) => tileHtml(t, { red: g.isRed(t) })).join('')}` : ''}</div>
            <ul class="yaku">${yaku.join('')}</ul>
            <div class="points">${head}　<b>${fmt(w.gain)}点</b></div>
          </div>`;
      }).join('');
    } else if (r.type === 'draw') {
      body = `<h3>流局</h3>` + g.players.map((p, s) => `
        <div class="draw-row"><span class="${r.tenpai[s] ? 'tenpai' : 'noten'}">${r.tenpai[s] ? 'テンパイ' : 'ノーテン'}</span> ${names[s]}
        ${r.tenpai[s] ? this.handBlock(g, p.hand, p.melds, s) : ''}</div>`).join('');
    } else {
      body = `<h3>途中流局：${r.reason}</h3>`;
    }
    const scores = g.players.map((p, s) => `
      <tr><td>${names[s]}</td><td class="num">${fmt(p.score)}</td>
      <td class="num ${r.scoreDelta[s] > 0 ? 'plus' : r.scoreDelta[s] < 0 ? 'minus' : ''}">${r.scoreDelta[s] ? signed(r.scoreDelta[s]) : ''}</td></tr>`).join('');
    return `
      <div class="result">
        <div class="result-title">${g.roundName} ${g.honba}本場</div>
        ${body}
        <table class="scores">${scores}</table>
        <button class="primary" data-act="next">次へ</button>
      </div>`;
  }

  private showFinal(st: FinalStanding[]): Promise<void> {
    const g = this.game!;
    const rows = st.map((x) => `
      <tr class="${x.seat === 0 ? 'me-row' : ''}"><td>${x.rank}位</td><td>${g.players[x.seat].name}</td>
      <td class="num">${fmt(x.score)}</td><td class="num ${x.point >= 0 ? 'plus' : 'minus'}">${x.point > 0 ? '+' : ''}${x.point.toFixed(1)}</td></tr>`).join('');
    const myRank = st.find((x) => x.seat === 0)!.rank;
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

