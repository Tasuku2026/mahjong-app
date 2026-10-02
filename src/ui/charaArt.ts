// キャラクターの絵（ゆるくて丸い、おもちのような形のオリジナルキャラ）
import type { Expr } from './characters';

const OL = '#5b4636'; // ふちどり
const W = 1.8; // ふちどりの太さ

/** おもちのような丸い顔（下がふっくら） */
const mochi = (fill: string) =>
  `<path d="M32 16 C47 16 57.5 25 57.5 38.5 C57.5 51 46.5 58.5 32 58.5 C17.5 58.5 6.5 51 6.5 38.5 C6.5 25 17 16 32 16 Z" fill="${fill}" stroke="${OL}" stroke-width="${W}"/>`;

/** 点の目（低めに、離して） */
function eyes(e: Expr, y = 38, dx = 9.5, color = OL): string {
  const xs = [32 - dx, 32 + dx];
  switch (e) {
    case 'happy':
      return xs.map((x) => `<path d="M${x - 2.8} ${y + 1} Q${x} ${y - 2.6} ${x + 2.8} ${y + 1}" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round"/>`).join('');
    case 'sad':
      return xs.map((x) => `<path d="M${x - 3} ${y - 1} Q${x} ${y + 1.8} ${x + 3} ${y - 1}" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round"/>`
        + `<path d="M${x} ${y + 2.5} C${x - 2.8} ${y + 7} ${x - 1.8} ${y + 10} ${x} ${y + 10} C${x + 1.8} ${y + 10} ${x + 2.8} ${y + 7} ${x} ${y + 2.5} Z" fill="#a8dcff" stroke="#7cc2f0" stroke-width=".8"/>`).join('');
    case 'surprised':
      return xs.map((x) => `<circle cx="${x}" cy="${y}" r="3.1" fill="${color}"/><circle cx="${x + 1}" cy="${y - 1.1}" r="1.2" fill="#fff"/><circle cx="${x - 1}" cy="${y + 1.2}" r=".5" fill="#fff"/>`).join('');
    default:
      return xs.map((x) => `<ellipse cx="${x}" cy="${y}" rx="2.2" ry="2.7" fill="${color}"/><circle cx="${x + .7}" cy="${y - 1}" r=".85" fill="#fff"/>`).join('');
  }
}

/** 小さな口 */
function mouth(e: Expr, y = 44): string {
  switch (e) {
    case 'happy':
      return `<path d="M29.2 ${y - .6} Q32 ${y + 4.4} 34.8 ${y - .6} Z" fill="#f4909c" stroke="${OL}" stroke-width="1.2" stroke-linejoin="round"/>`;
    case 'sad':
      return `<path d="M28.8 ${y + 1} q1.6 -1.6 3.2 0 q1.6 1.6 3.2 0" fill="none" stroke="${OL}" stroke-width="1.4" stroke-linecap="round"/>`;
    case 'surprised':
      return `<ellipse cx="32" cy="${y + .6}" rx="1.7" ry="2.1" fill="#f4909c" stroke="${OL}" stroke-width="1.1"/>`;
    default:
      return `<path d="M29.4 ${y} q1.3 1.7 2.6 0 q1.3 1.7 2.6 0" fill="none" stroke="${OL}" stroke-width="1.4" stroke-linecap="round"/>`;
  }
}

/** くちばし（ひよこ・ペンギン・ふくろう） */
function beak(e: Expr, y = 43, c = '#ffb04d'): string {
  if (e === 'happy' || e === 'surprised') {
    return `<path d="M29 ${y} Q32 ${y - 3} 35 ${y} Z" fill="${c}" stroke="${OL}" stroke-width="1"/><path d="M29.4 ${y + .6} Q32 ${y + 4.6} 34.6 ${y + .6} Z" fill="${c}" stroke="${OL}" stroke-width="1"/>`;
  }
  return `<path d="M29 ${y - .4} Q32 ${y - 2.6} 35 ${y - .4} Q32 ${y + 3.2} 29 ${y - .4} Z" fill="${c}" stroke="${OL}" stroke-width="1"/>`;
}

/** ほっぺ（ピンクの丸と、てれ線） */
function blush(y = 43.5, dx = 15, c = '#ffb3c4'): string {
  return [32 - dx, 32 + dx].map((x) => `<ellipse cx="${x}" cy="${y}" rx="4.3" ry="2.5" fill="${c}" opacity=".85"/>`
    + `<path d="M${x - 2.2} ${y + .9} l1.2 -1.9 M${x - .3} ${y + .9} l1.2 -1.9 M${x + 1.6} ${y + .9} l1.2 -1.9" stroke="#ff8fab" stroke-width=".8" stroke-linecap="round"/>`).join('');
}

const wrap = (body: string) => `<svg class="chara-svg" viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;

const ART: Record<number, (e: Expr) => string> = {
  // ぴよ（ひよこ）: レモン色のおもち、ちょこんとした冠羽
  1: (e) => wrap(`
    <path d="M30 17 q-2 -6 2.5 -7.5 q-1.5 3.5 1.5 5.5 q1 -4.5 4.5 -3.5 q-3 1.5 -2.5 5" fill="#ffe46b" stroke="${OL}" stroke-width="1.4" stroke-linejoin="round"/>
    ${mochi('#fff3a6')}
    <path d="M8.5 41 q-3 3 0 6 M55.5 41 q3 3 0 6" fill="none" stroke="${OL}" stroke-width="1.4" stroke-linecap="round"/>
    ${eyes(e)}${beak(e)}${blush()}`),

  // みけ（三毛ねこ）: 白に淡いオレンジとブラウンのぶち、首にすず
  2: (e) => wrap(`
    <path d="M12 26 Q11 10 15 9 Q20 10 26 19 Z" fill="#ffcf9e" stroke="${OL}" stroke-width="${W}" stroke-linejoin="round"/>
    <path d="M52 26 Q53 10 49 9 Q44 10 38 19 Z" fill="#fffaf4" stroke="${OL}" stroke-width="${W}" stroke-linejoin="round"/>
    <path d="M15.5 15 Q18 14 21 18.5 L16 22 Z" fill="#ffb8c6"/><path d="M48.5 15 Q46 14 43 18.5 L48 22 Z" fill="#ffb8c6"/>
    ${mochi('#fffaf4')}
    <path d="M9.5 30 Q14 19 26 17.5 Q22 25 23 31 Q15 32 9.5 30 Z" fill="#ffcf9e"/>
    <path d="M44 18.5 Q52 21 54 28 Q48 27 44 24 Z" fill="#c9a28a"/>
    ${eyes(e)}${mouth(e)}${blush()}
    <path d="M6 40 h6 M6 43.5 h6 M52 40 h6 M52 43.5 h6" stroke="${OL}" stroke-width=".9" stroke-linecap="round" opacity=".55"/>
    <circle cx="32" cy="58.5" r="3.6" fill="#ffd95e" stroke="${OL}" stroke-width="1.2"/><path d="M30.4 58.7 h3.2" stroke="${OL}" stroke-width=".9"/>`),

  // もち（うさぎ）: まっしろ、ながいお耳とお花
  3: (e) => wrap(`
    <path d="M20 20 C15 6 18 1 22.5 2 C27 3 27 10 26 19 Z" fill="#fff" stroke="${OL}" stroke-width="${W}"/>
    <path d="M44 20 C49 6 46 1 41.5 2 C37 3 37 10 38 19 Z" fill="#fff" stroke="${OL}" stroke-width="${W}"/>
    <path d="M21.5 17 C19 8 20.5 5 22.5 5.5 C24.5 6 24.5 10 24 17 Z" fill="#ffc6d3"/>
    <path d="M42.5 17 C45 8 43.5 5 41.5 5.5 C39.5 6 39.5 10 40 17 Z" fill="#ffc6d3"/>
    ${mochi('#ffffff')}
    <g transform="translate(45 20)"><circle r="2.4" cx="0" cy="-2.6" fill="#ffd1dc"/><circle r="2.4" cx="2.5" cy="-.8" fill="#ffd1dc"/><circle r="2.4" cx="1.6" cy="2.2" fill="#ffd1dc"/><circle r="2.4" cx="-1.6" cy="2.2" fill="#ffd1dc"/><circle r="2.4" cx="-2.5" cy="-.8" fill="#ffd1dc"/><circle r="1.6" fill="#ffe46b"/></g>
    ${eyes(e)}${mouth(e)}${blush()}`),

  // ぽんた（たぬき）: きなこ色、ふんわりたれ目のもよう、頭にはっぱ
  4: (e) => wrap(`
    <circle cx="15" cy="21" r="6.5" fill="#e8c69a" stroke="${OL}" stroke-width="${W}"/><circle cx="15" cy="21" r="3" fill="#b88c62"/>
    <circle cx="49" cy="21" r="6.5" fill="#e8c69a" stroke="${OL}" stroke-width="${W}"/><circle cx="49" cy="21" r="3" fill="#b88c62"/>
    ${mochi('#f3d7ae')}
    <ellipse cx="22.5" cy="39" rx="7" ry="5.6" fill="#caa47a" opacity=".75" transform="rotate(15 22.5 39)"/>
    <ellipse cx="41.5" cy="39" rx="7" ry="5.6" fill="#caa47a" opacity=".75" transform="rotate(-15 41.5 39)"/>
    <path d="M28 15 Q32 6 39 9 Q37 15 28 15 Z" fill="#a9dd8c" stroke="${OL}" stroke-width="1.2"/><path d="M29 14.5 L37 10" stroke="#6fae55" stroke-width=".9"/>
    ${eyes(e)}<ellipse cx="32" cy="42.6" rx="1.9" ry="1.3" fill="${OL}"/>${mouth(e, 45)}${blush(45, 16)}`),

  // ささ（パンダ）: しろくてまるい、たれ目のはんてん、笹の葉
  5: (e) => wrap(`
    <circle cx="14.5" cy="20.5" r="6.5" fill="#5d5865" stroke="${OL}" stroke-width="${W}"/>
    <circle cx="49.5" cy="20.5" r="6.5" fill="#5d5865" stroke="${OL}" stroke-width="${W}"/>
    ${mochi('#ffffff')}
    <ellipse cx="22.5" cy="38.5" rx="5.6" ry="6.6" fill="#5d5865" transform="rotate(28 22.5 38.5)"/>
    <ellipse cx="41.5" cy="38.5" rx="5.6" ry="6.6" fill="#5d5865" transform="rotate(-28 41.5 38.5)"/>
    ${eyes(e, 38, 9.5, '#ffffff')}
    <ellipse cx="32" cy="43" rx="2" ry="1.4" fill="${OL}"/>${mouth(e, 45.5)}${blush(46, 17)}
    <path d="M47 55 Q55 46 61 49 Q55 55 47 55 Z" fill="#a9dd8c" stroke="${OL}" stroke-width="1.1"/>`),

  // ぺんた（ペンギン）: そら色のずきんに、白いおかお
  6: (e) => wrap(`
    ${mochi('#b7d5f2')}
    <path d="M32 24 C22 24 14 30 14 40 C14 50 22 56 32 56 C42 56 50 50 50 40 C50 30 42 24 32 24 Z" fill="#ffffff"/>
    <path d="M32 16 q-1 -4 2 -6 q0 3 2 4" fill="none" stroke="${OL}" stroke-width="1.3" stroke-linecap="round"/>
    ${eyes(e, 38.5, 8.5)}${beak(e, 43.5, '#ffbe5c')}${blush(44.5, 14)}`),

  // こん（きつね）: アプリコット色、クリームのほっぺ、まろまゆ
  7: (e) => wrap(`
    <path d="M11 27 Q9 9 14 7 Q20 9 26 18 Z" fill="#ffc690" stroke="${OL}" stroke-width="${W}" stroke-linejoin="round"/>
    <path d="M53 27 Q55 9 50 7 Q44 9 38 18 Z" fill="#ffc690" stroke="${OL}" stroke-width="${W}" stroke-linejoin="round"/>
    <path d="M14 14 Q16 12 21 18 L15.5 22 Z" fill="#fff4e4"/><path d="M50 14 Q48 12 43 18 L48.5 22 Z" fill="#fff4e4"/>
    ${mochi('#ffd3a8')}
    <path d="M7.5 42 C12 40 18 42 22 46 C26 50 29 54 32 54 C35 54 38 50 42 46 C46 42 52 40 56.5 42 C55 51 45 58.5 32 58.5 C19 58.5 9 51 7.5 42 Z" fill="#fff4e4"/>
    <ellipse cx="22.5" cy="31" rx="1.6" ry="1.1" fill="#c98b5a"/><ellipse cx="41.5" cy="31" rx="1.6" ry="1.1" fill="#c98b5a"/>
    ${eyes(e)}<ellipse cx="32" cy="42.2" rx="1.7" ry="1.2" fill="${OL}"/>${mouth(e, 44.5)}${blush(45, 16)}`),

  // ゆき（しろくま）: まっしろ、ミント色のマフラー
  8: (e) => wrap(`
    <circle cx="15.5" cy="21" r="5.5" fill="#ffffff" stroke="${OL}" stroke-width="${W}"/><circle cx="15.5" cy="21" r="2.4" fill="#ffe0e6"/>
    <circle cx="48.5" cy="21" r="5.5" fill="#ffffff" stroke="${OL}" stroke-width="${W}"/><circle cx="48.5" cy="21" r="2.4" fill="#ffe0e6"/>
    ${mochi('#ffffff')}
    ${eyes(e, 37.5, 9)}<ellipse cx="32" cy="41.6" rx="2.3" ry="1.6" fill="${OL}"/>${mouth(e, 44)}${blush(43.5, 15, '#cfe4ff')}
    <path d="M9 50 Q32 60 55 50 L55.5 55 Q32 66 8.5 55 Z" fill="#a8e6d4" stroke="${OL}" stroke-width="1.3"/>
    <path d="M41 55 l2 8 l5 -1 l-2 -8 Z" fill="#8fd9c4" stroke="${OL}" stroke-width="1.1"/>`),

  // ほー博士（ふくろう）: いぶし銀の羽、白いまゆ毛とおひげ、金のモノクルと蝶ネクタイ
  9: (e) => {
    const disc = '#f3ebdc';
    // 目: ふだんは少しまぶたを下ろした、落ち着いた目
    const eye = (x: number) => `<ellipse cx="${x}" cy="38" rx="2.3" ry="2.6" fill="${OL}"/><circle cx="${x + .8}" cy="37.3" r=".8" fill="#fff"/>`
        + `<path d="M${x - 3.6} 36.4 Q${x} 34.6 ${x + 3.6} 36.4 L${x + 3.6} 34 L${x - 3.6} 34 Z" fill="${disc}"/>`
        + `<path d="M${x - 3.4} 36.5 Q${x} 34.8 ${x + 3.4} 36.5" fill="none" stroke="${OL}" stroke-width="1.2" stroke-linecap="round"/>`;
    const eyePair = e === 'normal' ? eye(22.5) + eye(41.5) : eyes(e, 38, 9.5);
    // まゆ毛: 外にはね上がった白い太まゆ（悲しいときは下がる）
    const brow = e === 'sad'
      ? `<path d="M15.5 30 Q22 30 28.5 27 Q22 33 15.5 32 Z M48.5 30 Q42 30 35.5 27 Q42 33 48.5 32 Z" fill="#fff" stroke="${OL}" stroke-width=".9" stroke-linejoin="round"/>`
      : `<path d="M14.5 28 Q21 25 28.5 30 Q21 28.5 15.5 31 Z M49.5 28 Q43 25 35.5 30 Q43 28.5 48.5 31 Z" fill="#fff" stroke="${OL}" stroke-width=".9" stroke-linejoin="round"/>`;
    return wrap(`
    <path d="M14 27 Q9 19 7.5 9.5 Q11.5 12.5 14 11.5 Q14.5 15.5 18 15 Q18.5 18.5 23.5 20.5 Z" fill="#8e7f70" stroke="${OL}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M50 27 Q55 19 56.5 9.5 Q52.5 12.5 50 11.5 Q49.5 15.5 46 15 Q45.5 18.5 40.5 20.5 Z" fill="#8e7f70" stroke="${OL}" stroke-width="1.4" stroke-linejoin="round"/>
    ${mochi('#a99b8b')}
    <path d="M32 26.5 C26 21.5 12.5 23 12.5 37 C12.5 47.5 22 51 32 48 C42 51 51.5 47.5 51.5 37 C51.5 23 38 21.5 32 26.5 Z" fill="${disc}"/>
    <path d="M28.5 21.5 l1.6 1.6 l1.6 -1.6 M32.3 21.5 l1.6 1.6 l1.6 -1.6" fill="none" stroke="#7d6f61" stroke-width="1" stroke-linecap="round"/>
    ${eyePair}${brow}
    <circle cx="41.5" cy="38" r="6.3" fill="#fff" fill-opacity=".18" stroke="#d6a632" stroke-width="1.7"/>
    <path d="M47.3 40.5 Q51 49 46 55.5" fill="none" stroke="#d6a632" stroke-width=".9" stroke-dasharray="1.4 .9"/>
    <path d="M32 45.5 Q27 50.5 21 47.5 Q25.5 46.5 29 44 Z M32 45.5 Q37 50.5 43 47.5 Q38.5 46.5 35 44 Z" fill="#fff" stroke="${OL}" stroke-width=".9" stroke-linejoin="round"/>
    ${beak(e, 44, '#e6a84a')}
    <ellipse cx="15.5" cy="45" rx="3.4" ry="1.9" fill="#f2a99a" opacity=".55"/><ellipse cx="48.5" cy="45" rx="3.4" ry="1.9" fill="#f2a99a" opacity=".55"/>
    <path d="M32 55.5 L23.5 51.5 L23.5 59.5 Z M32 55.5 L40.5 51.5 L40.5 59.5 Z" fill="#8c2f3c" stroke="${OL}" stroke-width="1.1" stroke-linejoin="round"/>
    <circle cx="32" cy="55.5" r="2" fill="#6d2230" stroke="${OL}" stroke-width=".9"/>`);
  },

  // とらきち（とら）: はちみつ色、ふんわりしましま
  10: (e) => wrap(`
    <circle cx="15" cy="21" r="6" fill="#ffd28a" stroke="${OL}" stroke-width="${W}"/><circle cx="15" cy="21" r="2.6" fill="#fff1d6"/>
    <circle cx="49" cy="21" r="6" fill="#ffd28a" stroke="${OL}" stroke-width="${W}"/><circle cx="49" cy="21" r="2.6" fill="#fff1d6"/>
    ${mochi('#ffd894')}
    <path d="M28 19 q4 3 8 0 M29.5 23.5 q2.5 2 5 0" fill="none" stroke="#c98c4f" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M8 34 q4 1 7 0 M8.5 39 q3.5 1 6 0 M56 34 q-4 1 -7 0 M55.5 39 q-3.5 1 -6 0" fill="none" stroke="#c98c4f" stroke-width="1.6" stroke-linecap="round"/>
    <ellipse cx="32" cy="46" rx="9.5" ry="6.5" fill="#fff4e0"/>
    ${eyes(e)}<path d="M30.2 42 h3.6 l-1.8 1.8 z" fill="#f08aa0" stroke="${OL}" stroke-width=".8" stroke-linejoin="round"/>${mouth(e, 45)}${blush(45, 17)}`),

  // おにまる（ちび鬼）: さくら色、ちいさなクリーム色のつの
  11: (e) => wrap(`
    <path d="M22 19 Q22 9 25 8 Q28 9 28 18 Z" fill="#ffe9a0" stroke="${OL}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M42 19 Q42 9 39 8 Q36 9 36 18 Z" fill="#ffe9a0" stroke="${OL}" stroke-width="1.4" stroke-linejoin="round"/>
    ${mochi('#ffc6cf')}
    <path d="M24 20 q8 -5 16 0 q-3 3 -8 2 q-5 1 -8 -2 z" fill="#7a5a78" opacity=".85"/>
    ${eyes(e)}${mouth(e)}
    ${e === 'normal' || e === 'happy' ? `<path d="M34 44.3 l.9 2 l.9 -2 z" fill="#fff" stroke="${OL}" stroke-width=".7" stroke-linejoin="round"/>` : ''}
    ${blush(43.5, 15, '#ff9fb4')}`),

  // ひかり（白い龍の子）: まっしろに水色のたてがみ、金のわっか
  12: (e) => wrap(`
    <ellipse cx="32" cy="7" rx="11" ry="3" fill="none" stroke="#ffd34d" stroke-width="2.2"/>
    <path d="M20 20 Q17 11 21 9 Q23 13 25 18 Z" fill="#fff0b3" stroke="${OL}" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M44 20 Q47 11 43 9 Q41 13 39 18 Z" fill="#fff0b3" stroke="${OL}" stroke-width="1.3" stroke-linejoin="round"/>
    ${mochi('#ffffff')}
    <path d="M23 18 Q27 13 32 16 Q37 13 41 18 Q37 22 32 20 Q27 22 23 18 Z" fill="#bfe3ff" stroke="${OL}" stroke-width="1.1"/>
    <path d="M7 42 q-5 -2 -4 -7 M57 42 q5 -2 4 -7" fill="none" stroke="#9fcbee" stroke-width="1.4" stroke-linecap="round"/>
    ${eyes(e, 38, 9.5, '#4a5f9c')}${mouth(e)}${blush(43.5, 15)}
    <circle cx="32" cy="27.5" r="1.6" fill="#ffd34d"/>`),
};

export function cuteFace(level: number, e: Expr): string {
  return (ART[level] ?? ART[5])(e);
}
