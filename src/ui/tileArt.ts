// 牌の図柄（SVG）。viewBox 60x80 の牌面に描く。
import { Kind } from '../core/tiles';

const BLUE = '#1d4f9a';
const GREEN = '#17734a';
const RED = '#c92a37';
const INK = '#1c2230';
const FONT = `'Shippori Mincho B1', 'Yu Mincho', 'Hiragino Mincho ProN', serif`;

type Pt = [number, number, string];

// ---------------- 筒子 ----------------

function circle(x: number, y: number, r: number, c: string): string {
  return `<g>
    <circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>
    <circle cx="${x}" cy="${y}" r="${r * 0.72}" fill="#fffdf6"/>
    <circle cx="${x}" cy="${y}" r="${r * 0.52}" fill="${c}" opacity=".9"/>
    <circle cx="${x}" cy="${y}" r="${r * 0.2}" fill="#fffdf6"/>
  </g>`;
}

function pinLayout(n: number): { pts: Pt[]; r: number } {
  const B = BLUE, G = GREEN, R = RED;
  switch (n) {
    case 2: return { r: 12, pts: [[30, 21, G], [30, 59, B]] };
    case 3: return { r: 10.5, pts: [[15, 15, B], [30, 40, R], [45, 65, G]] };
    case 4: return { r: 11, pts: [[17, 21, B], [43, 21, G], [17, 59, G], [43, 59, B]] };
    case 5: return { r: 9.5, pts: [[16, 16, B], [44, 16, G], [30, 40, R], [16, 64, G], [44, 64, B]] };
    case 6: return { r: 8.5, pts: [[18, 14, G], [42, 14, G], [18, 44, R], [42, 44, R], [18, 66, R], [42, 66, R]] };
    case 7: return {
      r: 7.5,
      pts: [[13, 11, G], [30, 18, G], [47, 25, G], [18, 47, R], [42, 47, R], [18, 67, R], [42, 67, R]],
    };
    case 8: return {
      r: 8,
      pts: [13, 31, 49, 67].flatMap((y) => [[18, y, B], [42, y, B]] as Pt[]),
    };
    default: return {
      r: 8.3,
      pts: [[16, B], [40, R], [64, G]].flatMap(([y, c]) => [13, 30, 47].map((x) => [x, y as number, c as string] as Pt)),
    };
  }
}

function pinzu(n: number, red: boolean): string {
  if (n === 1) {
    const c = red ? RED : GREEN;
    return `<g>
      <circle cx="30" cy="40" r="23" fill="${BLUE}"/>
      <circle cx="30" cy="40" r="19.5" fill="#fffdf6"/>
      ${Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return `<circle cx="${30 + Math.cos(a) * 15}" cy="${40 + Math.sin(a) * 15}" r="2.6" fill="${c}"/>`;
      }).join('')}
      <circle cx="30" cy="40" r="10" fill="${RED}"/>
      <circle cx="30" cy="40" r="6" fill="#fffdf6"/>
      <circle cx="30" cy="40" r="3" fill="${RED}"/>
    </g>`;
  }
  const { pts, r } = pinLayout(n);
  return pts.map(([x, y, c]) => circle(x, y, r, red ? RED : c)).join('');
}

// ---------------- 索子 ----------------

function stick(x: number, y: number, h: number, c: string, rot = 0, w = 8.5): string {
  const x0 = x - w / 2;
  const y0 = y - h / 2;
  return `<g transform="rotate(${rot} ${x} ${y})">
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${w / 2}" fill="${c}"/>
    <rect x="${x - w * 0.12}" y="${y0 + 2}" width="${w * 0.24}" height="${h - 4}" rx="${w * 0.12}" fill="#fffdf6" opacity=".55"/>
    <rect x="${x0 - 0.8}" y="${y - 1.1}" width="${w + 1.6}" height="2.2" rx="1.1" fill="${c}"/>
    <rect x="${x0 - 0.8}" y="${y0 - 0.2}" width="${w + 1.6}" height="2" rx="1" fill="${c}"/>
    <rect x="${x0 - 0.8}" y="${y0 + h - 1.8}" width="${w + 1.6}" height="2" rx="1" fill="${c}"/>
  </g>`;
}

function bird(red: boolean): string {
  const body = red ? RED : GREEN;
  return `<g>
    <path d="M30 12 C40 16 46 26 44 38 C43 48 36 56 30 60 C24 56 17 48 16 38 C14 26 20 16 30 12Z" fill="${body}"/>
    <path d="M30 20 C36 24 39 31 38 39 C37 46 34 51 30 54 C26 51 23 46 22 39 C21 31 24 24 30 20Z" fill="#fffdf6" opacity=".9"/>
    <path d="M30 26 C34 30 35 36 34 42 C33 46 31 49 30 50 C29 49 27 46 26 42 C25 36 26 30 30 26Z" fill="${BLUE}"/>
    <circle cx="30" cy="35" r="2.6" fill="#fffdf6"/>
    <circle cx="30" cy="35" r="1.3" fill="${INK}"/>
    <path d="M30 12 L27 6 L30 8 L33 5 Z" fill="${RED}"/>
    <path d="M30 60 C26 66 20 70 14 72 M30 60 C30 66 30 70 30 74 M30 60 C34 66 40 70 46 72"
      stroke="${body}" stroke-width="3" stroke-linecap="round" fill="none"/>
    <circle cx="14" cy="72" r="2.5" fill="${RED}"/><circle cx="30" cy="74" r="2.5" fill="${RED}"/><circle cx="46" cy="72" r="2.5" fill="${RED}"/>
  </g>`;
}

function souzu(n: number, red: boolean): string {
  if (n === 1) return bird(red);
  const G = red ? RED : GREEN;
  const R = RED;
  const B = red ? RED : BLUE;
  const H = 30;
  switch (n) {
    case 2: return stick(30, 21, H, G) + stick(30, 59, H, B);
    case 3: return stick(30, 21, H, B) + stick(17, 59, H, G) + stick(43, 59, H, G);
    case 4: return stick(17, 21, H, G) + stick(43, 21, H, B) + stick(17, 59, H, B) + stick(43, 59, H, G);
    case 5: return stick(14, 21, H, G) + stick(46, 21, H, B) + stick(30, 40, H, R) + stick(14, 59, H, B) + stick(46, 59, H, G);
    case 6: return [12, 30, 48].map((x) => stick(x, 21, H, G) + stick(x, 59, H, B)).join('');
    case 7: return stick(30, 13, 20, R) + [12, 30, 48].map((x) => stick(x, 40, 22, G) + stick(x, 66, 22, B)).join('');
    case 8: return (
      stick(10, 21, H, G, 0, 7.5) + stick(23, 21, H, G, 22, 7.5) + stick(37, 21, H, G, -22, 7.5) + stick(50, 21, H, G, 0, 7.5) +
      stick(10, 59, H, B, 0, 7.5) + stick(23, 59, H, B, -22, 7.5) + stick(37, 59, H, B, 22, 7.5) + stick(50, 59, H, B, 0, 7.5)
    );
    default: return [14, 40, 66].map((y, i) =>
      stick(12, y, 22, i === 1 ? B : G) + stick(30, y, 22, R) + stick(48, y, 22, i === 1 ? B : G)).join('');
  }
}

// ---------------- 萬子・字牌 ----------------

const KANJI_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

function manzu(n: number, red: boolean): string {
  return `
    <text x="30" y="35" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="30" fill="${red ? RED : INK}">${KANJI_NUM[n - 1]}</text>
    <text x="30" y="72" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="31" fill="${RED}">萬</text>`;
}

function honor(k: Kind): string {
  if (k === 31) {
    return `<rect x="11" y="12" width="38" height="56" rx="3" fill="none" stroke="${BLUE}" stroke-width="3.2"/>
      <rect x="16" y="17" width="28" height="46" rx="1.5" fill="none" stroke="${BLUE}" stroke-width="1.4"/>`;
  }
  const ch = ['東', '南', '西', '北', '', '發', '中'][k - 27];
  const color = k === 32 ? GREEN : k === 33 ? RED : INK;
  return `<text x="30" y="55" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="40" fill="${color}">${ch}</text>`;
}

// ---------------- 公開 ----------------

const cache = new Map<string, string>();

/** 牌面のSVG（キャッシュ付き） */
export function tileSvg(k: Kind, red: boolean): string {
  const key = `${k}${red ? 'r' : ''}`;
  let s = cache.get(key);
  if (s) return s;
  let body: string;
  if (k < 9) body = manzu(k + 1, red);
  else if (k < 18) body = pinzu(k - 8, red);
  else if (k < 27) body = souzu(k - 17, red);
  else body = honor(k);
  s = `<svg class="face" viewBox="0 0 60 80" aria-hidden="true">${body}</svg>`;
  cache.set(key, s);
  return s;
}
