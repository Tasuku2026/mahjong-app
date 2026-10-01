import { Agent, CallAction, CallOptions, Game, TurnAction, TurnOptions } from '../core/game';
import { Kind, Tile, kindOf, toCounts, isHonor, isTerminal, isSimple, isDragon, isYaochu, suitOf } from '../core/tiles';
import { calcShanten, containsWin, getWaits } from '../core/shanten';
import { meldIsOpen } from '../core/types';
import { dangerMap, exactHits, safeKinds, tenpaiProb, isDoraKind } from './danger';
import { outlook, tenpaiWaits } from './value';

export interface DiscardEval {
  tile: Tile;
  shanten: number;
  /** 有効牌の残り枚数 */
  ukeire: number;
}

/** 各打牌候補の向聴数と受け入れ枚数 */
export function evaluateDiscards(hand: Tile[], meldCount: number, unseen: number[], candidates: Tile[]): DiscardEval[] {
  const counts = toCounts(hand);
  const seen = new Set<Kind>();
  const out: DiscardEval[] = [];
  for (const t of candidates) {
    const k = kindOf(t);
    if (seen.has(k)) continue;
    seen.add(k);
    counts[k]--;
    const s = calcShanten(counts, meldCount);
    let ukeire = 0;
    for (let j = 0; j < 34; j++) {
      if (unseen[j] <= 0 || counts[j] >= 4) continue;
      counts[j]++;
      if (calcShanten(counts, meldCount) < s) ukeire += unseen[j];
      counts[j]--;
    }
    counts[k]++;
    out.push({ tile: t, shanten: s, ukeire });
  }
  return out;
}

/**
 * レベルごとの性格
 * - mistake: 打牌をランダムに選ぶ確率
 * - ukeire: 受け入れ枚数まで考えるか
 * - value: ドラ・赤・役牌など打点を意識するか
 * - defense: 0 なし / 1 リーチに現物でオリる / 2 筋・壁も使って危険度で判断 / 3 打点と危険度で押し引き
 * - calls: 0 でたらめ / 1 役牌のみ / 2 役が確保できる鳴き / 3 打点や状況も考える
 * - dama: 高い手はダマテンにする判断
 * - sight: 0 ふつう / 1 相手の手牌が見える（鬼） / 2 山も含めてすべて見える（神）
 */
export interface Profile {
  mistake: number;
  ukeire: boolean;
  value: boolean;
  defense: 0 | 1 | 2 | 3;
  calls: 0 | 1 | 2 | 3;
  dama: boolean;
  sight: 0 | 1 | 2;
}

/** 特別レベル */
export const LEVEL_ONI = 11;
export const LEVEL_KAMI = 12;

export function levelLabel(level: number): string {
  if (level === LEVEL_ONI) return '鬼';
  if (level === LEVEL_KAMI) return '神';
  return String(level);
}

export function profileFor(level: number): Profile {
  const sight = (level >= LEVEL_KAMI ? 2 : level >= LEVEL_ONI ? 1 : 0) as 0 | 1 | 2;
  const L = Math.max(1, Math.min(10, Math.round(level)));
  const mistake = [0.45, 0.32, 0.22, 0.14, 0.09, 0.06, 0.04, 0.02, 0.008, 0][L - 1];
  return {
    mistake,
    ukeire: L >= 3,
    value: L >= 5,
    defense: L <= 4 ? 0 : L <= 6 ? 1 : L <= 8 ? 2 : 3,
    calls: L <= 2 ? 0 : L <= 4 ? 1 : L <= 7 ? 2 : 3,
    dama: L >= 8,
    sight,
  };
}

/** 孤立牌の切りやすさ（大きいほど先に切る） */
function isolationScore(k: Kind, counts: number[], valuable: (k: Kind) => boolean): number {
  if (isHonor(k)) {
    if (counts[k] >= 2) return 0;
    return valuable(k) ? 2 : 3;
  }
  let score = isTerminal(k) ? 1.5 : (k % 9 === 1 || k % 9 === 7) ? 1 : 0.5;
  for (let d = -2; d <= 2; d++) {
    if (d === 0) continue;
    const j = k + d;
    if (j < 0 || j >= 27 || Math.floor(j / 9) !== Math.floor(k / 9)) continue;
    if (counts[j] > 0) score -= 0.4;
  }
  return score;
}

type Plan = 'free' | 'tanyao' | 'honitsu' | 'none';

export class CpuAgent implements Agent {
  readonly profile: Profile;

  constructor(public level: number) {
    this.profile = profileFor(level);
  }

  /** 山から引ける可能性のある枚数。鬼・神は相手の手牌にある牌も除く */
  private unseen(g: Game, seat: number): number[] {
    const v = g.visibleCounts(seat);
    if (this.profile.sight >= 1) {
      for (const p of g.players) if (p.seat !== seat) for (const t of p.hand) v[kindOf(t)]++;
    }
    return v.map((x) => Math.max(0, 4 - x));
  }

  private valuable(g: Game, seat: number) {
    return (k: Kind) => isDragon(k) || k === g.seatWind(seat) || k === g.roundWindKind;
  }

  /** 鳴いている手が、どの役を目指しているか */
  private plan(g: Game, seat: number): Plan {
    const p = g.players[seat];
    if (!p.melds.some(meldIsOpen)) return 'free';
    const valuable = this.valuable(g, seat);
    if (p.melds.some((m) => m.type !== 'chi' && valuable(kindOf(m.tiles[0])))) return 'free';
    const counts = toCounts(p.hand);
    if ([27, 28, 29, 30, 31, 32, 33].some((k) => valuable(k) && counts[k] >= 2)) return 'free';
    const meldKinds = p.melds.flatMap((m) => m.tiles.map(kindOf));
    if (g.rules.kuitan && meldKinds.every(isSimple)) return 'tanyao';
    const suits = new Set(meldKinds.filter((k) => !isHonor(k)).map(suitOf));
    if (suits.size <= 1) return 'honitsu';
    return 'none';
  }

  /** 最大の脅威（リーチ者など）の大きさ */
  private threat(g: Game, seat: number): number {
    let t = 0;
    for (let o = 0; o < 4; o++) if (o !== seat) t = Math.max(t, tenpaiProb(g, o));
    return t;
  }

  async turn(g: Game, seat: number, opts: TurnOptions): Promise<TurnAction> {
    await g.ui.delay(550);
    return this.decideTurn(g, seat, opts);
  }

  /** 手番の行動を決める（待ち時間なし。ヒント表示にも使う） */
  decideTurn(g: Game, seat: number, opts: TurnOptions): TurnAction {
    const p = g.players[seat];
    const pr = this.profile;
    if (opts.canTsumo) return { type: 'tsumo' };
    if (opts.canKyuushu) {
      const counts = toCounts(p.hand);
      let n = 0;
      for (let k = 0; k < 34; k++) if (isYaochu(k) && counts[k] > 0) n++;
      // 上級者は国士無双が狙えそうなら続行する
      if (!(pr.defense >= 2 && n >= 11)) return { type: 'kyuushu' };
    }
    if (p.riichi) {
      if (opts.ankanKinds.length > 0) return { type: 'ankan', kind: opts.ankanKinds[0] };
      return { type: 'discard', tile: opts.discardable[0] };
    }

    const counts = toCounts(p.hand);
    const curShanten = calcShanten(counts, p.melds.length);
    const threat = this.threat(g, seat);
    const defending = pr.sight === 0 && pr.defense > 0 && threat >= 0.55;

    // 暗槓・加槓: 向聴数が悪くならず、守備中でなければする
    if (!defending) {
      for (const k of opts.ankanKinds) {
        const c = counts.slice();
        c[k] = 0;
        if (calcShanten(c, p.melds.length + 1) <= curShanten) return { type: 'ankan', kind: k };
      }
      for (const k of opts.kakanKinds) {
        const c = counts.slice();
        c[k]--;
        if (calcShanten(c, p.melds.length) <= curShanten) return { type: 'kakan', kind: k };
      }
    }

    const { tile, fold } = this.decideDiscard(g, seat, opts.discardable);

    // 鬼・神: 決めた打牌（安全牌）のままリーチできるときだけリーチする
    if (pr.sight >= 1) {
      if (opts.riichiTiles.includes(tile) && !fold && this.sightRiichiOk(g, seat, tile)) {
        return { type: 'discard', tile, riichi: true };
      }
      return { type: 'discard', tile };
    }

    // リーチ判断
    if (opts.riichiTiles.length > 0 && !fold) {
      const r = this.chooseRiichi(g, seat, opts.riichiTiles);
      if (r !== null) return { type: 'discard', tile: r, riichi: true };
      // ダマを選んだ場合は、テンパイを維持する打牌
      const keep = opts.riichiTiles.includes(tile) ? tile : this.bestTenpaiDiscard(g, seat, opts.riichiTiles);
      return { type: 'discard', tile: keep };
    }
    return { type: 'discard', tile };
  }

  /** 打牌を決める。fold: オリを選んだか */
  decideDiscard(g: Game, seat: number, candidates: Tile[]): { tile: Tile; fold: boolean } {
    const p = g.players[seat];
    const pr = this.profile;
    const unseen = this.unseen(g, seat);
    const evals = evaluateDiscards(p.hand, p.melds.length, unseen, candidates);

    if (Math.random() < pr.mistake) {
      return { tile: evals[Math.floor(Math.random() * evals.length)].tile, fold: false };
    }

    const bestShanten = Math.min(...evals.map((e) => e.shanten));
    const threat = this.threat(g, seat);

    // ---- 鬼・神: 相手の手牌が見えるので、当たり牌だけを正確に避けて攻める ----
    let pool = evals;
    let sightFold = false;
    if (pr.sight >= 1) {
      const hits = exactHits(g, seat);
      const safe = evals.filter((e) => hits[kindOf(e.tile)].length === 0);
      if (safe.length > 0) pool = safe;
      else {
        // すべて当たり牌: 当たる人数が最も少ない牌
        pool = evals.slice().sort((a, b) => hits[kindOf(a.tile)].length - hits[kindOf(b.tile)].length).slice(0, 1);
        sightFold = true;
      }
      // 神: 山の並びから、最も早く和了できる打牌に絞る
      if (pr.sight >= 2 && !sightFold) {
        const fast = this.fastestByWall(g, seat, pool);
        if (fast.length > 0) pool = fast;
      }
    }

    // ---- 守備 ----
    if (pr.sight === 0 && pr.defense > 0 && threat >= (pr.defense === 1 ? 1 : 0.55)) {
      const fold = this.shouldFold(g, seat, evals, bestShanten);
      if (fold) {
        const danger = this.dangerFor(g, seat);
        evals.sort((a, b) => {
          const d = danger[kindOf(a.tile)] - danger[kindOf(b.tile)];
          if (Math.abs(d) > 1e-6) return d;
          if (a.shanten !== b.shanten) return a.shanten - b.shanten;
          return b.ukeire - a.ukeire;
        });
        return { tile: evals[0].tile, fold: true };
      }
    }

    // ---- 攻撃 ----
    const counts = toCounts(p.hand);
    const valuable = this.valuable(g, seat);
    const plan = this.plan(g, seat);
    const offPlan = (k: Kind): number => {
      if (plan === 'tanyao') return isYaochu(k) ? 1 : 0;
      if (plan === 'honitsu') {
        const meldSuit = p.melds.flatMap((m) => m.tiles.map(kindOf)).find((x) => !isHonor(x));
        const s = meldSuit !== undefined ? suitOf(meldSuit) : -1;
        return !isHonor(k) && s >= 0 && suitOf(k) !== s ? 1 : 0;
      }
      return 0;
    };
    // 相手の気配があるときは、同じ向聴数の中で危険度も考える（上級者）
    const danger = pr.sight === 0 && pr.defense >= 2 && threat >= 0.15 ? dangerMap(g, seat) : null;
    const score = (e: DiscardEval): number => {
      const k = kindOf(e.tile);
      let s = pr.ukeire ? e.ukeire : 0;
      if (pr.value) {
        if (isDoraKind(g, k)) s -= 4;
        if (g.isRed(e.tile)) s -= 4;
        if (isHonor(k) && valuable(k) && counts[k] === 2) s -= 6;
      }
      if (danger) s -= danger[k] * 250 * threat;
      return s;
    };
    pool.sort((a, b) => {
      if (a.shanten !== b.shanten) return a.shanten - b.shanten;
      const op = offPlan(kindOf(b.tile)) - offPlan(kindOf(a.tile));
      if (op !== 0) return op;
      const d = score(b) - score(a);
      if (Math.abs(d) > 1e-6) return d;
      const ka = kindOf(a.tile);
      const kb = kindOf(b.tile);
      return isolationScore(kb, counts, valuable) - isolationScore(ka, counts, valuable);
    });
    return { tile: pool[0].tile, fold: sightFold };
  }

  /**
   * 鬼: 待ちが山に残っていればリーチ。
   * 神: この先ツモる牌の中に待ち牌があればリーチ（リーチ後は手を変えられないため）
   */
  private sightRiichiOk(g: Game, seat: number, tile: Tile): boolean {
    const p = g.players[seat];
    const c = toCounts(p.hand);
    c[kindOf(tile)]--;
    const waits = getWaits(c, p.melds.length);
    if (this.profile.sight >= 2) {
      for (let i = g.live.length - 4; i >= 0; i -= 4) if (waits.includes(kindOf(g.live[i]))) return true;
      return false;
    }
    const unseen = this.unseen(g, seat);
    return waits.some((k) => unseen[k] > 0);
  }

  /**
   * 神: 自分がこの先ツモる牌（鳴きが入らなければ4枚ごと）を見て、
   * 最も早いツモで和了形が作れる打牌候補を返す（どれも和了できなければ空）
   */
  private fastestByWall(g: Game, seat: number, pool: DiscardEval[]): DiscardEval[] {
    const p = g.players[seat];
    const draws: Kind[] = [];
    for (let i = g.live.length - 4; i >= 0; i -= 4) draws.push(kindOf(g.live[i]));
    let best = Infinity;
    const steps = new Map<DiscardEval, number>();
    for (const e of pool) {
      const c = toCounts(p.hand);
      c[kindOf(e.tile)]--;
      let t = Infinity;
      for (let i = 0; i < draws.length && i < best; i++) {
        c[draws[i]]++;
        if (containsWin(c, p.melds.length)) {
          t = i;
          break;
        }
      }
      steps.set(e, t);
      best = Math.min(best, t);
    }
    if (best === Infinity) return [];
    return pool.filter((e) => steps.get(e) === best);
  }

  /** 危険度。レベル5〜6は現物だけを安全とみなす */
  private dangerFor(g: Game, seat: number): number[] {
    if (this.profile.defense >= 2) return dangerMap(g, seat);
    const out = new Array(34).fill(0);
    for (let o = 0; o < 4; o++) {
      if (o === seat || !g.players[o].riichi) continue;
      const safe = safeKinds(g, o);
      for (let k = 0; k < 34; k++) if (!safe.has(k)) out[k] += isHonor(k) ? 0.5 : 1;
    }
    return out;
  }

  private shouldFold(g: Game, seat: number, evals: DiscardEval[], bestShanten: number): boolean {
    const pr = this.profile;
    if (pr.defense === 1) return bestShanten >= 2;
    const p = g.players[seat];
    const best = evals.filter((e) => e.shanten === bestShanten).sort((a, b) => b.ukeire - a.ukeire)[0];
    const hand13 = p.hand.slice();
    hand13.splice(hand13.indexOf(best.tile), 1);
    const o = outlook(g, seat, hand13);
    if (pr.defense === 2) {
      if (bestShanten === 0) return o.points === 0 && p.melds.some(meldIsOpen); // 役なしテンパイはオリ
      if (bestShanten === 1) return o.points < 8000;
      return true;
    }
    // defense 3: 打点・和了率・巡目で押し引き
    const turnsLeft = Math.floor(g.live.length / 4);
    let push: boolean;
    if (bestShanten === 0) {
      const remain = o.waits.reduce((a, w) => a + (w.ron > 0 || w.tsumo > 0 ? w.remain : 0), 0);
      push = remain > 0 && (o.points >= 2000 || remain >= 4);
    } else if (bestShanten === 1) {
      push = turnsLeft >= 4 && (o.points >= 7700 || (o.points >= 3900 && best.ukeire >= 16 && turnsLeft >= 7));
    } else {
      push = false;
    }
    // オーラスで大きくリードしている子は無理をしない
    if (push && this.isComfortableLead(g, seat) && o.points < 8000) push = false;
    return !push;
  }

  private isComfortableLead(g: Game, seat: number): boolean {
    const maxWind = g.rules.gameLength === 'tonpu' ? 1 : 2;
    const allLast = g.roundWind >= maxWind - 1 && g.kyoku === 3;
    if (!allLast || seat === g.dealer) return false;
    const me = g.players[seat].score;
    const second = Math.max(...g.players.filter((q) => q.seat !== seat).map((q) => q.score));
    return me - second >= 12000;
  }

  /** リーチするならその打牌、ダマならnull */
  private chooseRiichi(g: Game, seat: number, riichiTiles: Tile[]): Tile | null {
    const p = g.players[seat];
    const pr = this.profile;
    const unseen = this.unseen(g, seat);
    let best: Tile | null = null;
    let bestScore = -1;
    for (const t of riichiTiles) {
      const hand13 = p.hand.slice();
      hand13.splice(hand13.indexOf(t), 1);
      const waits = getWaits(toCounts(hand13), p.melds.length);
      const remain = waits.reduce((a, k) => a + unseen[k], 0);
      let sc = remain;
      if (pr.value) {
        const wv = tenpaiWaits(g, seat, hand13, unseen, true);
        sc = wv.reduce((a, w) => a + w.remain * Math.max(w.ron, w.tsumo), 0) / 1000 + remain * 0.5;
      }
      if (sc > bestScore) {
        bestScore = sc;
        best = t;
      }
    }
    if (best === null) return null;
    if (pr.dama) {
      const hand13 = p.hand.slice();
      hand13.splice(hand13.indexOf(best), 1);
      const dama = tenpaiWaits(g, seat, hand13, unseen, false);
      const remain = dama.reduce((a, w) => a + w.remain, 0);
      if (remain === 0) return null; // 待ちが残っていない
      const damaYaku = dama.every((w) => w.ron > 0);
      const damaPts = dama.reduce((a, w) => Math.max(a, w.ron), 0);
      const lateGame = g.live.length < 10;
      if (damaYaku && (damaPts >= 7700 || lateGame)) return null;
    }
    return best;
  }

  private bestTenpaiDiscard(g: Game, seat: number, riichiTiles: Tile[]): Tile {
    const unseen = this.unseen(g, seat);
    const p = g.players[seat];
    const evals = evaluateDiscards(p.hand, p.melds.length, unseen, riichiTiles);
    evals.sort((a, b) => b.ukeire - a.ukeire);
    return evals[0].tile;
  }

  async call(g: Game, seat: number, tile: Tile, from: number, opts: CallOptions): Promise<CallAction> {
    return this.decideCall(g, seat, tile, from, opts);
  }

  /** 鳴き・ロンの判断（ヒント表示にも使う） */
  decideCall(g: Game, seat: number, tile: Tile, _from: number, opts: CallOptions): CallAction {
    if (opts.canRon) return { type: 'ron' };
    const pr = this.profile;
    const p = g.players[seat];
    const k = kindOf(tile);
    const valuable = this.valuable(g, seat);

    if (pr.calls === 0) {
      if (opts.pon.length && (valuable(k) || Math.random() < 0.3)) return { type: 'pon', tiles: opts.pon[0] };
      if (opts.chi.length && Math.random() < 0.2) return { type: 'chi', tiles: opts.chi[0] };
      return { type: 'pass' };
    }

    const curShanten = calcShanten(toCounts(p.hand), p.melds.length);
    const threat = this.threat(g, seat);
    // 神は鳴くとツモ順が変わるので鳴かない
    if (pr.sight >= 2) return { type: 'pass' };
    if (pr.sight === 0 && pr.defense >= 2 && threat >= 0.55 && curShanten >= 1) return { type: 'pass' };

    const shantenAfter = (used: Tile[]): number => {
      const rest = p.hand.slice();
      for (const t of used) rest.splice(rest.indexOf(t), 1);
      return calcShanten(toCounts(rest), p.melds.length + 1);
    };

    // 役牌のポン
    for (const used of opts.pon) {
      if (valuable(k) && shantenAfter(used) <= curShanten) return { type: 'pon', tiles: used };
    }
    if (pr.calls === 1) return { type: 'pass' };

    // 鳴いた後に役が残るか
    const yakuAfter = (used: Tile[]): boolean => {
      const rest = p.hand.filter((t) => !used.includes(t));
      const meldKinds = [...p.melds.flatMap((m) => m.tiles.map(kindOf)), k, ...used.map(kindOf)];
      if (p.melds.some((m) => m.type !== 'chi' && valuable(kindOf(m.tiles[0])))) return true;
      const restCounts = toCounts(rest);
      if ([27, 28, 29, 30, 31, 32, 33].some((x) => valuable(x) && restCounts[x] >= 2)) return true;
      // 喰いタン
      if (g.rules.kuitan && meldKinds.every(isSimple) && rest.filter((t) => isYaochu(kindOf(t))).length <= 2) return true;
      // 混一色・清一色
      const all = [...rest.map(kindOf), ...meldKinds];
      const suitCount = [0, 0, 0];
      for (const x of all) if (!isHonor(x)) suitCount[suitOf(x)]++;
      const main = suitCount.indexOf(Math.max(...suitCount));
      const off = suitCount.reduce((a, b, i) => (i === main ? a : a + b), 0);
      const meldsInSuit = meldKinds.every((x) => isHonor(x) || suitOf(x) === main);
      return meldsInSuit && off <= 2;
    };

    const accept = (used: Tile[]): boolean => {
      const after = shantenAfter(used);
      if (after >= curShanten) return false;
      if (!yakuAfter(used)) return false;
      if (pr.calls === 3) {
        const closed = !p.melds.some(meldIsOpen);
        // 門前でまだ遠い手は、安い鳴きを控える
        if (closed && after >= 2) {
          const pts = outlook(g, seat).points;
          if (pts < 2000) return false;
        }
      }
      return true;
    };

    for (const used of opts.pon) if (accept(used)) return { type: 'pon', tiles: used };
    for (const used of opts.chi) if (accept(used)) return { type: 'chi', tiles: used };
    return { type: 'pass' };
  }
}
