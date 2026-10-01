import { Tile, kindOf, kindName } from '../core/tiles';
import { tileSvg } from './tileArt';
import { Meld } from '../core/types';

export interface TileOpts {
  back?: boolean;
  sideways?: boolean;
  red?: boolean;
  classes?: string[];
  attrs?: Record<string, string | number>;
}

export function tileHtml(t: Tile, o: TileOpts = {}): string {
  const k = kindOf(t);
  const cls = ['tile'];
  if (o.back) cls.push('back');
  else if (o.red) cls.push('red');
  if (o.classes) cls.push(...o.classes);
  const attrs = Object.entries(o.attrs ?? {}).map(([a, v]) => ` ${a}="${v}"`).join('');
  const label = o.back ? '' : ` role="img" aria-label="${kindName(k)}${o.red ? '（赤）' : ''}"`;
  const inner = o.back ? '' : tileSvg(k, !!o.red);
  const el = `<div class="${cls.join(' ')}"${label}${o.sideways ? '' : attrs}>${inner}</div>`;
  return o.sideways ? `<div class="side"${attrs}>${el}</div>` : el;
}

/**
 * 副露の表示。鳴いた牌は相手の方向に横向きで置く。
 * seat: 副露した人, isRed: 赤ドラ判定
 */
export function meldHtml(m: Meld, seat: number, isRed: (t: Tile) => boolean): string {
  const tiles = m.tiles.slice();
  if (m.type === 'ankan') {
    return `<div class="meld">${tiles.map((t, i) => tileHtml(t, { back: i === 0 || i === 3, red: isRed(t) })).join('')}</div>`;
  }
  const called = m.calledTile!;
  const rest = tiles.filter((t) => t !== called);
  const rel = (m.from! - seat + 4) % 4; // 1:下家 2:対面 3:上家
  let order: { t: Tile; side: boolean }[];
  const others = rest.map((t) => ({ t, side: false }));
  const c = { t: called, side: true };
  if (m.type === 'kakan') {
    // 加槓: 横向きの牌の上にもう1枚（簡易表示として横向き2枚）
    const added = others.pop()!;
    const c2 = { t: added.t, side: true };
    if (rel === 3) order = [c, c2, ...others];
    else if (rel === 2) order = [others[0], c, c2, ...others.slice(1)];
    else order = [...others, c, c2];
  } else if (rel === 3) order = [c, ...others];
  else if (rel === 2) order = [others[0], c, ...others.slice(1)];
  else order = [...others, c];
  return `<div class="meld">${order.map((x) => tileHtml(x.t, { sideways: x.side, red: isRed(x.t) })).join('')}</div>`;
}
