import {
  Tile, Kind, kindOf, toCounts, sortTiles, shuffle, isYaochu, isWind, isRedTile, EAST,
} from './tiles';
import { calcShanten, getWaits } from './shanten';
import { evaluateWin, WinResult, ronPoints, tsumoPoints } from './yaku';
import { Meld, Rules, meldIsOpen } from './types';

export interface RiverTile {
  tile: Tile;
  tsumogiri: boolean;
  /** リーチ宣言牌（横向き） */
  riichi: boolean;
  /** 他家に鳴かれた */
  called: boolean;
  /** 局内の通し番号（何番目の打牌か） */
  seq: number;
}

export interface PlayerState {
  seat: number;
  name: string;
  isHuman: boolean;
  level: number;
  score: number;
  /** 副露以外の手牌（ツモ牌を含む） */
  hand: Tile[];
  /** 直前にツモった牌 */
  drawn: Tile | null;
  melds: Meld[];
  river: RiverTile[];
  riichi: boolean;
  doubleRiichi: boolean;
  ippatsu: boolean;
  tempFuriten: boolean;
  riichiFuriten: boolean;
  discardCount: number;
  /** リーチ宣言牌の通し番号（リーチしていなければ -1） */
  riichiSeq: number;
  /** 鳴いた直後に切れない牌の種類（喰い替え禁止） */
  forbidden: Kind[];
}

export interface TurnOptions {
  canTsumo: boolean;
  tsumoResult: WinResult | null;
  /** リーチ宣言して切れる牌（空ならリーチ不可） */
  riichiTiles: Tile[];
  ankanKinds: Kind[];
  kakanKinds: Kind[];
  canKyuushu: boolean;
  /** 切ってよい牌 */
  discardable: Tile[];
}

export type TurnAction =
  | { type: 'discard'; tile: Tile; riichi?: boolean }
  | { type: 'tsumo' }
  | { type: 'ankan'; kind: Kind }
  | { type: 'kakan'; kind: Kind }
  | { type: 'kyuushu' };

export interface CallOptions {
  canRon: boolean;
  ronResult: WinResult | null;
  pon: Tile[][];
  chi: Tile[][];
  minkan: Tile[] | null;
}

export type CallAction =
  | { type: 'pass' }
  | { type: 'ron' }
  | { type: 'pon'; tiles: Tile[] }
  | { type: 'chi'; tiles: Tile[] }
  | { type: 'minkan' };

export const hasCallOption = (o: CallOptions): boolean =>
  o.canRon || o.pon.length > 0 || o.chi.length > 0 || o.minkan !== null;

export interface Agent {
  turn(g: Game, seat: number, opts: TurnOptions): Promise<TurnAction>;
  call(g: Game, seat: number, tile: Tile, from: number, opts: CallOptions): Promise<CallAction>;
}

export interface WinInfo {
  seat: number;
  /** 放銃者（ツモならnull） */
  from: number | null;
  result: WinResult;
  hand: Tile[];
  melds: Meld[];
  winTile: Tile;
  /** 本場・供託込みの獲得点 */
  gain: number;
}

export interface RoundResult {
  type: 'win' | 'draw' | 'abort';
  wins: WinInfo[];
  /** 流局時のテンパイ者 */
  tenpai: boolean[];
  reason: string;
  scoreDelta: number[];
  uraIndicators: Tile[];
}

export interface GameUI {
  update(): void;
  /** CPUの思考待ちなど */
  delay(ms: number): Promise<void>;
  announce(seat: number, text: string): Promise<void>;
  showRoundResult(g: Game, r: RoundResult): Promise<void>;
}

export interface FinalStanding {
  seat: number;
  score: number;
  rank: number;
  point: number;
}

const UMA = [30, 10, -10, -30];

export class Game {
  readonly rules: Rules;
  players: PlayerState[];
  agents: Agent[];
  ui: GameUI;

  /** 0:東場 1:南場 2:西場 */
  roundWind = 0;
  /** 局（0-3）。親の席 = (initialDealer + kyoku) % 4 */
  kyoku = 0;
  honba = 0;
  kyoutaku = 0;
  initialDealer: number;

  live: Tile[] = [];
  dead: Tile[] = [];
  doraCount = 1;
  kanCount = 0;
  /** 王牌から取った嶺上牌の枚数 */
  rinshanDrawn = 0;
  kanSeats: number[] = [];
  /** この局で鳴き（暗槓含む）が発生したか */
  callsHappened = false;
  current = 0;
  /** 直前の捨て牌（ハイライト用） */
  lastDiscard: { seat: number; index: number } | null = null;
  /** 局内の打牌数 */
  discardSeq = 0;
  ended = false;
  log: string[] = [];

  constructor(rules: Rules, players: { name: string; isHuman: boolean; level: number }[], agents: Agent[], ui: GameUI) {
    this.rules = rules;
    this.agents = agents;
    this.ui = ui;
    this.initialDealer = Math.floor(Math.random() * 4);
    this.players = players.map((p, seat) => ({
      seat, name: p.name, isHuman: p.isHuman, level: p.level, score: rules.startScore,
      hand: [], drawn: null, melds: [], river: [], riichi: false, doubleRiichi: false, ippatsu: false,
      tempFuriten: false, riichiFuriten: false, discardCount: 0, riichiSeq: -1, forbidden: [],
    }));
  }

  get dealer(): number {
    return (this.initialDealer + this.kyoku) % 4;
  }
  get roundWindKind(): Kind {
    return EAST + this.roundWind;
  }
  seatWind(seat: number): Kind {
    return EAST + ((seat - this.dealer + 4) % 4);
  }
  get doraIndicators(): Tile[] {
    return [4, 6, 8, 10, 12].slice(0, this.doraCount).map((i) => this.dead[i]);
  }
  get uraIndicators(): Tile[] {
    return [5, 7, 9, 11, 13].slice(0, this.doraCount).map((i) => this.dead[i]);
  }
  get roundName(): string {
    return `${['東', '南', '西', '北'][this.roundWind]}${this.kyoku + 1}局`;
  }

  // ------------------------------------------------------------------
  // 全体の流れ
  // ------------------------------------------------------------------

  async run(): Promise<FinalStanding[]> {
    while (!this.ended) {
      const r = await this.playRound();
      this.ui.update();
      await this.ui.showRoundResult(this, r);
      const before = { roundWind: this.roundWind, kyoku: this.kyoku, honba: this.honba };
      this.advance(r);
      // 終了時は最後の局の表示のままにする
      if (this.ended) Object.assign(this, before);
    }
    return this.standings();
  }

  standings(): FinalStanding[] {
    const order = [0, 1, 2, 3].sort((a, b) => {
      const d = this.players[b].score - this.players[a].score;
      if (d !== 0) return d;
      return ((a - this.initialDealer + 4) % 4) - ((b - this.initialDealer + 4) % 4);
    });
    const ret = this.rules.returnScore;
    const oka = ((ret - this.rules.startScore) * 4) / 1000;
    return order.map((seat, i) => {
      const score = this.players[seat].score;
      let point = (score - ret) / 1000 + UMA[i];
      if (i === 0) point += oka;
      return { seat, score, rank: i + 1, point: Math.round(point * 10) / 10 };
    });
  }

  private advance(r: RoundResult): void {
    const dealer = this.dealer;
    const renchan =
      r.type === 'abort' ||
      (r.type === 'draw' && r.tenpai[dealer]) ||
      (r.type === 'win' && r.wins.some((w) => w.seat === dealer));
    const maxWind = this.rules.gameLength === 'tonpu' ? 1 : 2;

    if (this.rules.tobi && this.players.some((p) => p.score < 0)) {
      this.ended = true;
      return;
    }
    const isLastOrLater = this.roundWind > maxWind - 1 || (this.roundWind === maxWind - 1 && this.kyoku === 3);
    const someoneReached = this.players.some((p) => p.score >= this.rules.returnScore);

    if (renchan) {
      this.honba++;
      if (isLastOrLater && this.rules.agariYame && r.type !== 'abort') {
        const top = this.standings()[0].seat;
        if (top === dealer && this.players[dealer].score >= this.rules.returnScore) {
          this.ended = true;
          return;
        }
      }
      if (this.roundWind >= maxWind && someoneReached) this.ended = true;
      return;
    }
    this.honba = r.type === 'win' ? 0 : this.honba + 1;
    this.kyoku++;
    if (this.kyoku === 4) {
      this.kyoku = 0;
      this.roundWind++;
    }
    if (this.roundWind >= maxWind) {
      // 規定の局が終わった: 誰かが返し点に達していれば終了、そうでなければ延長（1場まで）
      if (!this.rules.extension || someoneReached || this.roundWind >= maxWind + 1) this.ended = true;
    }
  }

  // ------------------------------------------------------------------
  // 1局
  // ------------------------------------------------------------------

  private setupRound(): void {
    const wall = shuffle(Array.from({ length: 136 }, (_, i) => i));
    this.dead = wall.slice(0, 14);
    this.live = wall.slice(14);
    this.doraCount = 1;
    this.kanCount = 0;
    this.rinshanDrawn = 0;
    this.kanSeats = [];
    this.callsHappened = false;
    this.lastDiscard = null;
    for (const p of this.players) {
      p.hand = [];
      p.drawn = null;
      p.melds = [];
      p.river = [];
      p.riichi = false;
      p.doubleRiichi = false;
      p.ippatsu = false;
      p.tempFuriten = false;
      p.riichiFuriten = false;
      p.discardCount = 0;
      p.forbidden = [];
      p.riichiSeq = -1;
    }
    this.discardSeq = 0;
    for (let i = 0; i < 13; i++) {
      for (let s = 0; s < 4; s++) this.players[(this.dealer + s) % 4].hand.push(this.live.pop()!);
    }
    for (const p of this.players) sortTiles(p.hand);
  }

  private async playRound(): Promise<RoundResult> {
    this.setupRound();
    let cur = this.dealer;
    let needDraw = true;
    let rinshan = false;
    this.ui.update();

    for (;;) {
      this.current = cur;
      const p = this.players[cur];
      if (needDraw) {
        if (!rinshan && this.live.length === 0) return this.exhaustiveDraw();
        const t = rinshan ? this.dead[this.rinshanDrawn++] : this.live.pop()!;
        p.hand.push(t);
        p.drawn = t;
        p.tempFuriten = false;
      } else {
        p.drawn = null;
      }
      this.ui.update();

      const firstDraw = needDraw && !rinshan && p.discardCount === 0 && !this.callsHappened;
      const opts = this.turnOptions(p, needDraw, rinshan, firstDraw);
      const act = await this.agents[cur].turn(this, cur, opts);

      if (act.type === 'tsumo' && opts.canTsumo && opts.tsumoResult) {
        await this.ui.announce(cur, 'ツモ');
        return this.settleWins([{ seat: cur, from: null, result: opts.tsumoResult, winTile: p.drawn! }]);
      }
      if (act.type === 'kyuushu' && opts.canKyuushu) {
        await this.ui.announce(cur, '九種九牌');
        return this.abort('九種九牌');
      }
      if ((act.type === 'ankan' && opts.ankanKinds.includes(act.kind)) ||
          (act.type === 'kakan' && opts.kakanKinds.includes(act.kind))) {
        await this.ui.announce(cur, 'カン');
        const kanTile = this.doKan(p, act.type, act.kind);
        this.ui.update();
        if (act.type === 'kakan') {
          // 槍槓
          const rons = await this.collectRons(cur, kanTile, true);
          if (rons.length > 0) return this.settleWins(rons);
        }
        this.doraCount++;
        needDraw = true;
        rinshan = true;
        continue;
      }

      // 打牌
      let tile = act.type === 'discard' ? act.tile : p.drawn ?? p.hand[p.hand.length - 1];
      let declareRiichi = act.type === 'discard' && !!act.riichi && opts.riichiTiles.includes(tile);
      if (!opts.discardable.includes(tile)) {
        tile = opts.discardable.includes(p.drawn ?? -1) ? p.drawn! : opts.discardable[0];
        declareRiichi = false;
      }
      if (declareRiichi) await this.ui.announce(cur, 'リーチ');
      const firstTurn = p.discardCount === 0 && !this.callsHappened;
      p.hand.splice(p.hand.indexOf(tile), 1);
      sortTiles(p.hand);
      p.river.push({ tile, tsumogiri: tile === p.drawn, riichi: declareRiichi, called: false, seq: this.discardSeq++ });
      p.drawn = null;
      p.discardCount++;
      p.forbidden = [];
      if (p.riichi) p.ippatsu = false;
      rinshan = false;
      this.lastDiscard = { seat: cur, index: p.river.length - 1 };
      this.ui.update();

      // ロン
      const rons = await this.collectRons(cur, tile, false);
      if (rons.length > 0) return this.settleWins(rons);

      // リーチ成立
      if (declareRiichi) {
        p.riichi = true;
        p.riichiSeq = p.river[p.river.length - 1].seq;
        p.doubleRiichi = firstTurn;
        p.ippatsu = true;
        p.score -= 1000;
        this.kyoutaku++;
        if (this.players.every((q) => q.riichi)) return this.abort('四家立直');
      }

      // 四風連打
      if (!this.callsHappened && this.players.every((q) => q.discardCount === 1 && q.river.length === 1)) {
        const k = kindOf(this.players[0].river[0].tile);
        if (isWind(k) && this.players.every((q) => kindOf(q.river[0].tile) === k)) return this.abort('四風連打');
      }

      // ポン・チー・明槓
      const call = await this.collectCalls(cur, tile);
      if (call) {
        const q = this.players[call.seat];
        p.river[p.river.length - 1].called = true;
        for (const pl of this.players) pl.ippatsu = false;
        this.callsHappened = true;
        const label = call.action.type === 'pon' ? 'ポン' : call.action.type === 'chi' ? 'チー' : 'カン';
        await this.ui.announce(call.seat, label);
        if (call.action.type === 'minkan') {
          const own = q.hand.filter((t) => kindOf(t) === kindOf(tile));
          q.hand = q.hand.filter((t) => kindOf(t) !== kindOf(tile));
          q.melds.push({ type: 'minkan', tiles: [...own, tile], calledTile: tile, from: cur });
          this.registerKan(call.seat);
          this.doraCount++;
          cur = call.seat;
          needDraw = true;
          rinshan = true;
        } else if (call.action.type === 'pon' || call.action.type === 'chi') {
          const used = call.action.tiles;
          for (const t of used) q.hand.splice(q.hand.indexOf(t), 1);
          q.melds.push({ type: call.action.type, tiles: sortTiles([...used, tile]), calledTile: tile, from: cur });
          q.forbidden = kuikaeKinds(call.action.type, kindOf(tile), used.map(kindOf));
          cur = call.seat;
          needDraw = false;
        }
        this.ui.update();
        continue;
      }

      if (this.kanCount >= 4 && new Set(this.kanSeats).size > 1) return this.abort('四開槓');
      if (this.live.length === 0) return this.exhaustiveDraw();
      cur = (cur + 1) % 4;
      needDraw = true;
    }
  }

  private registerKan(seat: number): void {
    this.kanCount++;
    this.kanSeats.push(seat);
    this.callsHappened = true;
    for (const pl of this.players) pl.ippatsu = false;
    // 王牌を14枚に保つため、山の最後から1枚減らす
    this.live.shift();
  }

  private doKan(p: PlayerState, type: 'ankan' | 'kakan', kind: Kind): Tile {
    if (type === 'ankan') {
      const tiles = p.hand.filter((t) => kindOf(t) === kind);
      p.hand = p.hand.filter((t) => kindOf(t) !== kind);
      p.melds.push({ type: 'ankan', tiles });
      this.registerKan(p.seat);
      return tiles[0];
    }
    const t = p.hand.find((x) => kindOf(x) === kind)!;
    p.hand.splice(p.hand.indexOf(t), 1);
    const m = p.melds.find((x) => x.type === 'pon' && kindOf(x.tiles[0]) === kind)!;
    m.type = 'kakan';
    m.tiles.push(t);
    this.registerKan(p.seat);
    return t;
  }

  // ------------------------------------------------------------------
  // 選択肢の計算
  // ------------------------------------------------------------------

  private winInput(p: PlayerState, hand: Tile[], winTile: Tile, tsumo: boolean, extra: Partial<Parameters<typeof evaluateWin>[0]>) {
    return {
      hand, melds: p.melds, winTile, tsumo,
      riichi: (p.riichi ? (p.doubleRiichi ? 2 : 1) : 0) as 0 | 1 | 2,
      ippatsu: p.ippatsu,
      seatWind: this.seatWind(p.seat), roundWind: this.roundWindKind,
      doraIndicators: this.doraIndicators, uraIndicators: this.uraIndicators,
      rules: this.rules, ...extra,
    };
  }

  turnOptions(p: PlayerState, drew: boolean, rinshan: boolean, firstDraw: boolean): TurnOptions {
    const counts = toCounts(p.hand);
    const meldCount = p.melds.length;
    const menzen = p.melds.every((m) => !meldIsOpen(m));
    let tsumoResult: WinResult | null = null;
    if (drew && p.drawn !== null && calcShanten(counts, meldCount) === -1) {
      tsumoResult = evaluateWin(this.winInput(p, p.hand, p.drawn, true, {
        haitei: !rinshan && this.live.length === 0,
        rinshan,
        tenhou: firstDraw && p.seat === this.dealer,
        chiihou: firstDraw && p.seat !== this.dealer,
      }));
    }

    const ankanKinds: Kind[] = [];
    const kakanKinds: Kind[] = [];
    const canKan = drew && this.live.length > 0 && this.kanCount < 4;
    if (canKan) {
      for (let k = 0; k < 34; k++) {
        if (counts[k] === 4) {
          if (!p.riichi) ankanKinds.push(k);
          else if (p.drawn !== null && kindOf(p.drawn) === k && this.riichiAnkanOk(p, k)) ankanKinds.push(k);
        }
      }
      if (!p.riichi) {
        for (const m of p.melds) {
          const k = kindOf(m.tiles[0]);
          if (m.type === 'pon' && counts[k] > 0) kakanKinds.push(k);
        }
      }
    }

    let discardable: Tile[];
    if (p.riichi && p.drawn !== null) discardable = [p.drawn];
    else {
      discardable = p.hand.filter((t) => !p.forbidden.includes(kindOf(t)));
      if (discardable.length === 0) discardable = p.hand.slice();
    }

    const riichiTiles: Tile[] = [];
    if (drew && menzen && !p.riichi && p.score >= 1000 && this.live.length >= 4) {
      for (const t of p.hand) {
        const c = counts.slice();
        c[kindOf(t)]--;
        if (calcShanten(c, meldCount) === 0) riichiTiles.push(t);
      }
    }

    let canKyuushu = false;
    if (firstDraw) {
      let n = 0;
      for (let k = 0; k < 34; k++) if (isYaochu(k) && counts[k] > 0) n++;
      canKyuushu = n >= 9;
    }

    return {
      canTsumo: tsumoResult !== null, tsumoResult, riichiTiles, ankanKinds, kakanKinds, canKyuushu, discardable,
    };
  }

  /** リーチ後の暗槓: 待ちが変わらない場合のみ */
  private riichiAnkanOk(p: PlayerState, k: Kind): boolean {
    const before = p.hand.slice();
    before.splice(before.indexOf(p.drawn!), 1);
    const w1 = getWaits(toCounts(before), p.melds.length);
    const c = toCounts(p.hand);
    c[k] = 0;
    const w2 = getWaits(c, p.melds.length + 1);
    return w1.length > 0 && w1.length === w2.length && w1.every((x, i) => x === w2[i]);
  }

  /** プレイヤーの現在の待ち（13枚形のとき） */
  waitsOf(p: PlayerState): Kind[] {
    if (p.hand.length % 3 !== 1) return [];
    return getWaits(toCounts(p.hand), p.melds.length);
  }

  isFuriten(p: PlayerState, waits: Kind[] = this.waitsOf(p)): boolean {
    if (p.tempFuriten || p.riichiFuriten) return true;
    return p.river.some((r) => waits.includes(kindOf(r.tile)));
  }

  callOptions(seat: number, tile: Tile, from: number, chankan: boolean): CallOptions {
    const p = this.players[seat];
    const k = kindOf(tile);
    const opts: CallOptions = { canRon: false, ronResult: null, pon: [], chi: [], minkan: null };
    const waits = this.waitsOf(p);
    if (waits.includes(k) && !this.isFuriten(p, waits)) {
      const r = evaluateWin(this.winInput(p, [...p.hand, tile], tile, false, {
        houtei: !chankan && this.live.length === 0,
        chankan,
      }));
      if (r) {
        opts.canRon = true;
        opts.ronResult = r;
      }
    }
    if (chankan || p.riichi || this.live.length === 0) return opts;

    const same = p.hand.filter((t) => kindOf(t) === k);
    if (same.length >= 2) opts.pon = variants([same, same]).filter((v) => v[0] !== v[1]);
    opts.pon = dedupeByRed(opts.pon);
    if (same.length === 3 && this.kanCount < 4) opts.minkan = same;

    if (seat === (from + 1) % 4 && k < 27) {
      const n = k % 9;
      const byKind = (kk: Kind) => p.hand.filter((t) => kindOf(t) === kk);
      const patterns: [number, number][] = [];
      if (n >= 2) patterns.push([k - 2, k - 1]);
      if (n >= 1 && n <= 7) patterns.push([k - 1, k + 1]);
      if (n <= 6) patterns.push([k + 1, k + 2]);
      for (const [a, b] of patterns) {
        const ta = byKind(a);
        const tb = byKind(b);
        if (ta.length && tb.length) opts.chi.push(...dedupeByRed(variants([ta, tb])));
      }
      // 喰い替えで切る牌がなくなる鳴きは除外
      opts.chi = opts.chi.filter((used) => {
        const forb = kuikaeKinds('chi', k, used.map(kindOf));
        const rest = p.hand.slice();
        for (const t of used) rest.splice(rest.indexOf(t), 1);
        return rest.some((t) => !forb.includes(kindOf(t)));
      });
    }
    return opts;
  }

  /** ロン宣言を集める（頭ハネなしのダブロン・トリロンあり） */
  private async collectRons(from: number, tile: Tile, chankan: boolean): Promise<{ seat: number; from: number; result: WinResult; winTile: Tile }[]> {
    const rons: { seat: number; from: number; result: WinResult; winTile: Tile }[] = [];
    for (let i = 1; i < 4; i++) {
      const seat = (from + i) % 4;
      const p = this.players[seat];
      const waits = this.waitsOf(p);
      if (!waits.includes(kindOf(tile))) continue;
      const opts = this.callOptions(seat, tile, from, chankan);
      let ron = false;
      if (opts.canRon) {
        const ronOnly: CallOptions = { ...opts, pon: [], chi: [], minkan: null };
        const a = await this.agents[seat].call(this, seat, tile, from, ronOnly);
        ron = a.type === 'ron';
      }
      if (ron && opts.ronResult) {
        rons.push({ seat, from, result: opts.ronResult, winTile: tile });
      } else {
        // 見逃し
        p.tempFuriten = true;
        if (p.riichi) p.riichiFuriten = true;
      }
    }
    for (const r of rons) await this.ui.announce(r.seat, 'ロン');
    return rons;
  }

  private async collectCalls(from: number, tile: Tile): Promise<{ seat: number; action: CallAction } | null> {
    const requests: { seat: number; action: CallAction }[] = [];
    for (let i = 1; i < 4; i++) {
      const seat = (from + i) % 4;
      const opts = this.callOptions(seat, tile, from, false);
      opts.canRon = false;
      opts.ronResult = null;
      if (!hasCallOption(opts)) continue;
      const a = await this.agents[seat].call(this, seat, tile, from, opts);
      if (a.type === 'pon' && opts.pon.some((v) => sameTiles(v, a.tiles))) requests.push({ seat, action: a });
      else if (a.type === 'chi' && opts.chi.some((v) => sameTiles(v, a.tiles))) requests.push({ seat, action: a });
      else if (a.type === 'minkan' && opts.minkan) requests.push({ seat, action: a });
    }
    return requests.find((r) => r.action.type !== 'chi') ?? requests[0] ?? null;
  }

  // ------------------------------------------------------------------
  // 精算
  // ------------------------------------------------------------------

  private settleWins(wins: { seat: number; from: number | null; result: WinResult; winTile: Tile }[]): RoundResult {
    const delta = [0, 0, 0, 0];
    const infos: WinInfo[] = [];
    wins.forEach((w, idx) => {
      const p = this.players[w.seat];
      const isDealer = w.seat === this.dealer;
      const first = idx === 0;
      const honba = first ? this.honba : 0;
      let gain = 0;
      if (w.from === null) {
        const pay = tsumoPoints(w.result.base, isDealer);
        for (let s = 0; s < 4; s++) {
          if (s === w.seat) continue;
          const v = (s === this.dealer ? pay.dealer : pay.other) + 100 * honba;
          delta[s] -= v;
          gain += v;
        }
      } else {
        const v = ronPoints(w.result.base, isDealer) + 300 * honba;
        delta[w.from] -= v;
        gain += v;
      }
      if (first) {
        gain += this.kyoutaku * 1000;
        this.kyoutaku = 0;
      }
      delta[w.seat] += gain;
      const hand = w.from === null ? p.hand.filter((t) => t !== w.winTile) : p.hand.slice();
      infos.push({ seat: w.seat, from: w.from, result: w.result, hand, melds: p.melds, winTile: w.winTile, gain });
    });
    for (let s = 0; s < 4; s++) this.players[s].score += delta[s];
    return { type: 'win', wins: infos, tenpai: [false, false, false, false], reason: '', scoreDelta: delta, uraIndicators: this.uraIndicators };
  }

  private exhaustiveDraw(): RoundResult {
    const tenpai = this.players.map((p) => calcShanten(toCounts(p.hand), p.melds.length) === 0);
    const n = tenpai.filter(Boolean).length;
    const delta = [0, 0, 0, 0];
    if (n > 0 && n < 4) {
      for (let s = 0; s < 4; s++) delta[s] = tenpai[s] ? 3000 / n : -3000 / (4 - n);
    }
    for (let s = 0; s < 4; s++) this.players[s].score += delta[s];
    return { type: 'draw', wins: [], tenpai, reason: '流局', scoreDelta: delta, uraIndicators: [] };
  }

  private abort(reason: string): RoundResult {
    return { type: 'abort', wins: [], tenpai: [false, false, false, false], reason, scoreDelta: [0, 0, 0, 0], uraIndicators: [] };
  }

  // ------------------------------------------------------------------
  // 情報
  // ------------------------------------------------------------------

  /** seat から見えている牌の枚数（種類別）: 全員の河・副露・ドラ表示牌・自分の手牌 */
  visibleCounts(seat: number): number[] {
    const c = new Array(34).fill(0);
    for (const p of this.players) {
      for (const r of p.river) if (!r.called) c[kindOf(r.tile)]++;
      for (const m of p.melds) for (const t of m.tiles) c[kindOf(t)]++;
    }
    for (const t of this.doraIndicators) c[kindOf(t)]++;
    for (const t of this.players[seat].hand) c[kindOf(t)]++;
    return c;
  }

  isRed(t: Tile): boolean {
    return this.rules.aka && isRedTile(t);
  }
}

/** 喰い替え禁止の牌種 */
export function kuikaeKinds(type: 'chi' | 'pon', k: Kind, used: Kind[]): Kind[] {
  if (type === 'pon') return [k];
  const lo = Math.min(...used);
  const hi = Math.max(...used);
  const out = [k];
  if (k < lo && hi % 9 < 8) out.push(hi + 1); // 例: 45で3をチーしたら6も禁止
  if (k > hi && lo % 9 > 0) out.push(lo - 1);
  return out;
}

function variants(lists: Tile[][]): Tile[][] {
  const out: Tile[][] = [];
  const rec = (i: number, cur: Tile[]) => {
    if (i === lists.length) {
      out.push(cur.slice());
      return;
    }
    for (const t of lists[i]) {
      if (cur.includes(t)) continue;
      cur.push(t);
      rec(i + 1, cur);
      cur.pop();
    }
  };
  rec(0, []);
  return out;
}

/** 赤の有無だけが違う組み合わせを1つにまとめる */
function dedupeByRed(list: Tile[][]): Tile[][] {
  const seen = new Set<string>();
  const out: Tile[][] = [];
  for (const v of list) {
    const key = v.map((t) => `${kindOf(t)}${isRedTile(t) ? 'r' : ''}`).sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function sameTiles(a: Tile[], b: Tile[]): boolean {
  return a.length === b.length && a.every((t) => b.includes(t));
}

