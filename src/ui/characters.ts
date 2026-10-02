// CPUのキャラクター（レベルごとに1人）。絵はSVGで描く。

export type Expr = 'normal' | 'happy' | 'sad' | 'surprised';

/** しゃべる場面 */
export type Talk =
  | 'start' | 'idle' | 'riichi' | 'call' | 'tsumo' | 'ron' | 'dealIn'
  | 'reactRiichi' | 'praise' | 'draw' | 'first' | 'last';

export interface Chara {
  level: number;
  name: string;
  species: string;
  /** ひとこと（トップ画面・図鑑） */
  catchphrase: string;
  profile: string;
  lines: Record<Talk, string[]>;
  face: (e: Expr) => string;
}

// ---------------- 絵の部品 ----------------

const INK = '#3b2f2a';

/** 目（cx1, cx2 は左右の目の中心） */
function eyes(e: Expr, x1: number, x2: number, y: number, color = INK, r = 3.2): string {
  switch (e) {
    case 'happy':
      return [x1, x2].map((x) => `<path d="M${x - 4} ${y + 1.5} Q${x} ${y - 4} ${x + 4} ${y + 1.5}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>`).join('');
    case 'sad':
      return [x1, x2].map((x, i) => `<path d="M${x - 4} ${y - 0.5} Q${x} ${y + 3} ${x + 4} ${y - 0.5}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>`
        + (i === 0 ? `<path d="M${x - 2} ${y + 4} q-2 4 0 6 q2 -2 0 -6z" fill="#7cc6ff"/>` : '')).join('');
    case 'surprised':
      return [x1, x2].map((x) => `<circle cx="${x}" cy="${y}" r="${r + 1.6}" fill="#fff" stroke="${color}" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="${r - 0.6}" fill="${color}"/>`).join('');
    default:
      return [x1, x2].map((x) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/><circle cx="${x + 1.1}" cy="${y - 1.2}" r="${r * 0.35}" fill="#fff"/>`).join('');
  }
}

/** 口 */
function mouth(e: Expr, cx: number, cy: number, kind: 'w' | 'smile' = 'smile', color = INK): string {
  switch (e) {
    case 'happy':
      return `<path d="M${cx - 5} ${cy - 1} Q${cx} ${cy + 7} ${cx + 5} ${cy - 1} Z" fill="#e8636c" stroke="${color}" stroke-width="1.4" stroke-linejoin="round"/>`;
    case 'sad':
      return `<path d="M${cx - 4} ${cy + 2.5} Q${cx} ${cy - 2} ${cx + 4} ${cy + 2.5}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`;
    case 'surprised':
      return `<ellipse cx="${cx}" cy="${cy + 1}" rx="2.6" ry="3.2" fill="#e8636c" stroke="${color}" stroke-width="1.4"/>`;
    default:
      return kind === 'w'
        ? `<path d="M${cx - 4.5} ${cy} q2.25 3 4.5 0 q2.25 3 4.5 0" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`
        : `<path d="M${cx - 3.5} ${cy} Q${cx} ${cy + 3.5} ${cx + 3.5} ${cy}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`;
  }
}

const cheeks = (x1: number, x2: number, y: number, c = '#ff9db0') =>
  `<ellipse cx="${x1}" cy="${y}" rx="4" ry="2.6" fill="${c}" opacity=".55"/><ellipse cx="${x2}" cy="${y}" rx="4" ry="2.6" fill="${c}" opacity=".55"/>`;

const svg = (body: string) => `<svg class="chara-svg" viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;

// ---------------- 12人 ----------------

export const CHARAS: Chara[] = [
  {
    level: 1, name: 'ぴよ', species: 'ひよこ',
    catchphrase: 'まーじゃん、はじめてだぴよ！',
    profile: '生まれたての元気なひよこ。牌の絵がかわいいから、なんとなく切ってしまうぴよ。ミスも多いけど、いつでも全力。',
    lines: {
      start: ['よろしくおねがいしますぴよ！', 'がんばるぴよ〜！'],
      idle: ['どれを切ればいいぴよ…？', 'この牌、かわいいぴよ', 'ぴよぴよ…（考え中）'],
      riichi: ['リ、リーチだぴよ！', 'えいっ、リーチぴよ！'],
      call: ['それ、ほしいぴよ！', 'もらっちゃうぴよ！'],
      tsumo: ['ツモったぴよ〜！', 'やったぁ！ぴよ！'],
      ron: ['ロンぴよ！ほんとに？', 'あがれたぴよ〜！'],
      dealIn: ['ぴよ〜っ！？', 'うぅ…それだったぴよ…'],
      reactRiichi: ['ひゃっ、リーチぴよ！？', 'こ、こわいぴよ…'],
      praise: ['すごいぴよ〜！', 'おみごとぴよ！'],
      draw: ['ながれたぴよ', 'だれもあがらなかったぴよ'],
      first: ['いちばんだぴよ！ゆめみたい！'],
      last: ['つぎはがんばるぴよ…ぐすん'],
    },
    face: (e) => svg(`
      <path d="M28 10 q-2 -6 2 -7 q-1 4 3 5 q1 -5 5 -3 q-4 2 -3 6z" fill="#f7b928"/>
      <ellipse cx="32" cy="36" rx="23" ry="22" fill="#ffd94a"/>
      <ellipse cx="25" cy="27" rx="8" ry="5" fill="#fff3a6" opacity=".7"/>
      ${eyes(e, 24, 40, 33)}
      ${e === 'happy' ? '<path d="M27 40 L32 47 L37 40 Z" fill="#ff9a3c"/><path d="M28 40 L32 37 L36 40 Z" fill="#ff9a3c"/>'
        : e === 'surprised' ? '<path d="M28 39 L32 45 L36 39 Z" fill="#ff9a3c"/><path d="M28 39 L32 35 L36 39 Z" fill="#ff9a3c"/>'
          : '<path d="M28 39 L32 43.5 L36 39 Z" fill="#ff9a3c"/>'}
      ${cheeks(17, 47, 41)}
    `),
  },
  {
    level: 2, name: 'みけ', species: '三毛ねこ',
    catchphrase: 'きまぐれに打つにゃ〜',
    profile: 'ひなたぼっこが大好きな三毛ねこ。気分で牌を切るので、たまにびっくりするほど良い手ができるにゃ。',
    lines: {
      start: ['よろしくにゃ〜', 'あそんであげるにゃ'],
      idle: ['ふわぁ…ねむいにゃ', 'この牌、まるくてすきにゃ', 'どれでもいいにゃ〜'],
      riichi: ['リーチにゃ！', 'えいっ、リーチだにゃ'],
      call: ['いただきにゃ！', 'それ、ちょうだいにゃ'],
      tsumo: ['ツモったにゃ〜ん♪', 'にゃっふ〜！'],
      ron: ['ロンにゃ！', 'つかまえたにゃ！'],
      dealIn: ['にゃっ！？', 'ふにゃ…しっぽがしょんぼりにゃ'],
      reactRiichi: ['リーチ？こわいにゃ…', 'しっぽがぴーんとしたにゃ'],
      praise: ['やるにゃ〜', 'ほめてあげるにゃ'],
      draw: ['ながれたにゃ', 'おひるねしたいにゃ'],
      first: ['いちばんにゃ！ごほうびのおさかなほしいにゃ'],
      last: ['きょうはきぶんじゃなかったにゃ…'],
    },
    face: (e) => svg(`
      <path d="M9 22 L13 4 L27 15 Z" fill="#fff" stroke="#e8d9c6" stroke-width="1"/>
      <path d="M12 18 L14 8 L22 14 Z" fill="#f7a8b8"/>
      <path d="M55 22 L51 4 L37 15 Z" fill="#3a3330"/>
      <path d="M52 18 L50 8 L42 14 Z" fill="#f7a8b8"/>
      <ellipse cx="32" cy="36" rx="24" ry="21" fill="#fffaf3"/>
      <path d="M8 34 Q10 16 28 13 Q22 24 26 34 Q16 34 8 34Z" fill="#f2a24a"/>
      <path d="M40 13 Q54 16 56 30 Q47 26 40 22Z" fill="#3a3330"/>
      ${eyes(e, 23, 41, 34)}
      <path d="M30 40 L34 40 L32 42.5 Z" fill="#f08aa0"/>
      ${mouth(e, 32, 44, 'w')}
      <path d="M8 41 h9 M8 45 h9 M47 41 h9 M47 45 h9" stroke="#c9b8a6" stroke-width="1.2" stroke-linecap="round"/>
      ${cheeks(18, 46, 43)}
    `),
  },
  {
    level: 3, name: 'もち', species: 'うさぎ',
    catchphrase: 'ぴょんぴょん手を進めるよ',
    profile: 'おもちみたいにまっしろなうさぎ。牌効率を覚えたてで、手を進めるのが楽しくてしかたないぴょん。',
    lines: {
      start: ['よろしくぴょん！', 'きょうもぴょんぴょんいくよ'],
      idle: ['いい形になってきたぴょん', 'うけいれ…ってなんだっけぴょん', 'もぐもぐ…あ、わたしの番？'],
      riichi: ['リーチだぴょん！', 'ぴょーんとリーチ！'],
      call: ['もらうぴょん！', 'それ、いただくぴょん'],
      tsumo: ['ツモだぴょん！', 'はねるほどうれしいぴょん！'],
      ron: ['ロンだぴょん！', 'みみがぴーんとしたぴょん！'],
      dealIn: ['ぴょ…ぴょえ〜', 'おみみがしおしおぴょん…'],
      reactRiichi: ['リーチ！？きをつけるぴょん', 'どきどきするぴょん'],
      praise: ['すごいぴょん！', 'まねしたいぴょん！'],
      draw: ['ながれちゃったぴょん'],
      first: ['いちばんぴょん！おもちパーティーだぴょん！'],
      last: ['しょぼん…つぎはもっとはねるぴょん'],
    },
    face: (e) => svg(`
      <ellipse cx="22" cy="14" rx="6" ry="15" fill="#fff" stroke="#efe6ea" stroke-width="1" transform="rotate(-10 22 14)"/>
      <ellipse cx="22" cy="14" rx="3" ry="11" fill="#ffc2d1" transform="rotate(-10 22 14)"/>
      <ellipse cx="42" cy="14" rx="6" ry="15" fill="#fff" stroke="#efe6ea" stroke-width="1" transform="rotate(10 42 14)"/>
      <ellipse cx="42" cy="14" rx="3" ry="11" fill="#ffc2d1" transform="rotate(10 42 14)"/>
      <ellipse cx="32" cy="40" rx="23" ry="19" fill="#fff" stroke="#efe6ea" stroke-width="1"/>
      ${eyes(e, 24, 40, 38, '#c2185b')}
      <ellipse cx="32" cy="44" rx="2.2" ry="1.6" fill="#f08aa0"/>
      ${mouth(e, 32, 47, 'w')}
      ${cheeks(17, 47, 46)}
    `),
  },
  {
    level: 4, name: 'ぽんた', species: 'たぬき',
    catchphrase: 'ポンが大好きだぽん！',
    profile: 'はっぱを頭にのせたこだぬき。名前のとおりポンが大好き。役牌が2枚あると、そわそわが止まらないぽん。',
    lines: {
      start: ['よろしくだぽん！', 'ばけばけ〜、勝負だぽん'],
      idle: ['ポンしたいぽん…', 'はっぱがずれたぽん', 'いい牌こないかなぽん'],
      riichi: ['リーチだぽん！', 'ばけずにリーチだぽん'],
      call: ['ポンだぽん！！', 'まってましたぽん！'],
      tsumo: ['ツモだぽん！どろん！', 'やったぽん！'],
      ron: ['ロンだぽん！', 'つかまえたぽん！'],
      dealIn: ['ぽ、ぽんぽこりん…', 'ばけの皮がはがれたぽん…'],
      reactRiichi: ['リーチ！？ひっこむぽん', 'ばけてかくれるぽん'],
      praise: ['すごいぽん！', 'ばかされたみたいだぽん'],
      draw: ['ながれたぽん'],
      first: ['いちばんぽん！おなかをたたいておいわいぽん！'],
      last: ['ぽんぽこぽん…まけちゃったぽん'],
    },
    face: (e) => svg(`
      <circle cx="13" cy="17" r="8" fill="#8a5a34"/><circle cx="13" cy="17" r="4" fill="#4a2f1c"/>
      <circle cx="51" cy="17" r="8" fill="#8a5a34"/><circle cx="51" cy="17" r="4" fill="#4a2f1c"/>
      <ellipse cx="32" cy="36" rx="24" ry="21" fill="#b07a4a"/>
      <path d="M30 6 q8 -2 10 6 q-6 2 -10 -6z" fill="#5fae4e"/><path d="M30 6 l9 5" stroke="#3e7d33" stroke-width="1"/>
      <ellipse cx="22" cy="35" rx="9" ry="7" fill="#4a2f1c"/>
      <ellipse cx="42" cy="35" rx="9" ry="7" fill="#4a2f1c"/>
      <ellipse cx="32" cy="45" rx="11" ry="8" fill="#f1dcc0"/>
      ${eyes(e, 22, 42, 35, '#fff8ea', 2.8)}
      <ellipse cx="32" cy="42" rx="3" ry="2.2" fill="#2e1d12"/>
      ${mouth(e, 32, 46)}
      ${cheeks(15, 49, 45)}
    `),
  },
  {
    level: 5, name: 'ささ', species: 'パンダ',
    catchphrase: 'のんびり、でもしっかりだよぉ',
    profile: '笹をもぐもぐしながら打つパンダ。ドラや赤ドラは大事にとっておく、ちゃっかり屋さん。リーチされたら現物で逃げるよぉ。',
    lines: {
      start: ['よろしくねぇ〜', 'のんびりいこうねぇ'],
      idle: ['もぐもぐ…笹おいしいよぉ', 'ドラは大事にしようねぇ', 'うーん、のんびり考えるよぉ'],
      riichi: ['リーチだよぉ〜', 'そろそろリーチしちゃうよぉ'],
      call: ['それ、もらうねぇ', 'いただきまぁす'],
      tsumo: ['ツモだよぉ〜♪', 'わぁい、あがったよぉ'],
      ron: ['ロンだよぉ', 'それだったよぉ、ごめんねぇ'],
      dealIn: ['あぁ〜…やっちゃったよぉ', 'ささが…のどにつまったよぉ'],
      reactRiichi: ['リーチかぁ、現物にげるよぉ', 'あぶないあぶない…'],
      praise: ['すごいねぇ〜', 'ぱちぱちぱち〜'],
      draw: ['ながれたねぇ〜'],
      first: ['いちばんだよぉ！笹でかんぱいだよぉ'],
      last: ['ころころ…まけちゃったよぉ'],
    },
    face: (e) => svg(`
      <circle cx="13" cy="15" r="8.5" fill="#26262b"/>
      <circle cx="51" cy="15" r="8.5" fill="#26262b"/>
      <ellipse cx="32" cy="36" rx="25" ry="22" fill="#fff" stroke="#eee" stroke-width="1"/>
      <ellipse cx="22" cy="34" rx="7.5" ry="9" fill="#26262b" transform="rotate(25 22 34)"/>
      <ellipse cx="42" cy="34" rx="7.5" ry="9" fill="#26262b" transform="rotate(-25 42 34)"/>
      ${eyes(e, 22, 42, 33, '#fff', 2.6)}
      <ellipse cx="32" cy="43" rx="3.2" ry="2.2" fill="#26262b"/>
      ${mouth(e, 32, 47, 'w')}
      ${cheeks(14, 50, 45)}
      <path d="M50 52 q8 -10 11 -2 q-6 0 -11 2z" fill="#6cc04a"/>
    `),
  },
  {
    level: 6, name: 'ぺんた', species: 'ペンギン',
    catchphrase: '守りはまかせるペン！',
    profile: '氷の国からきたペンギン。リーチをかけられると、すぐに安全な牌を探す守りの名人ペン。ちょっぴりこわがり。',
    lines: {
      start: ['よろしくペン！', 'つめたく守るペン'],
      idle: ['安全な牌はどれペン…', 'すべらないように打つペン', 'こおりがたべたいペン'],
      riichi: ['リーチペン！', 'たまには攻めるペン！'],
      call: ['それほしいペン！', 'いただきペン'],
      tsumo: ['ツモったペン！', 'すいすい〜っとあがりペン'],
      ron: ['ロンペン！', 'つかまえたペン！'],
      dealIn: ['ペェェン…すべったペン', 'こおりがわれたペン…'],
      reactRiichi: ['リーチ！全力でオリるペン', '現物、現物…ペン'],
      praise: ['おみごとペン！', 'つよいペン…'],
      draw: ['ながれたペン。守りきったペン'],
      first: ['いちばんペン！氷のトロフィーだペン'],
      last: ['ペン…守りすぎたペン'],
    },
    face: (e) => svg(`
      <ellipse cx="32" cy="34" rx="25" ry="25" fill="#2c3e5c"/>
      <path d="M32 18 C20 18 14 28 16 40 C18 52 28 56 32 56 C36 56 46 52 48 40 C50 28 44 18 32 18 Z" fill="#fff"/>
      ${eyes(e, 25, 39, 32)}
      ${e === 'happy' ? '<path d="M27 40 L32 47 L37 40 Z" fill="#ffb02e"/><path d="M27 40 L32 36 L37 40 Z" fill="#ffb02e"/>'
        : e === 'surprised' ? '<path d="M28 39 L32 45 L36 39 Z" fill="#ffb02e"/><path d="M28 39 L32 35 L36 39 Z" fill="#ffb02e"/>'
          : '<path d="M27 38 L32 43 L37 38 Z" fill="#ffb02e"/>'}
      ${cheeks(20, 44, 41)}
      <path d="M6 6 h52" stroke="none"/>
    `),
  },
  {
    level: 7, name: 'こん', species: 'きつね',
    catchphrase: '筋と壁で化かしあいコン',
    profile: 'ちょっぴりいたずら好きなきつね。筋や壁を読んで危ない牌をよけるのが得意。高い手はこっそりダマにすることもあるコン。',
    lines: {
      start: ['よろしくコン。化かしあいだコン', 'ふふ、楽しくなりそうコン'],
      idle: ['この筋は通るかなコン…', '壁が見えるコン', 'しっぽで隠しておくコン'],
      riichi: ['リーチだコン！', 'ここは攻めるコン'],
      call: ['いただくコン', 'それは見逃さないコン'],
      tsumo: ['ツモだコン♪', '化かしてあがったコン'],
      ron: ['ロンだコン！ひっかかったコン', 'ふふ、それだったコン'],
      dealIn: ['コ、コーン…', '化かされたのはこっちだったコン…'],
      reactRiichi: ['リーチ？筋をたどるコン', 'ふむ、慎重にいくコン'],
      praise: ['なかなかやるコン', 'こっちが化かされたコン'],
      draw: ['ながれたコン'],
      first: ['いちばんコン。油あげで乾杯コン'],
      last: ['しっぽをまいて帰るコン…'],
    },
    face: (e) => svg(`
      <path d="M8 26 L12 2 L28 16 Z" fill="#f08a2c"/><path d="M11 21 L13 7 L22 15 Z" fill="#fff1df"/><path d="M12 2 l-1 7 l5 -3 z" fill="#3a2a22"/>
      <path d="M56 26 L52 2 L36 16 Z" fill="#f08a2c"/><path d="M53 21 L51 7 L42 15 Z" fill="#fff1df"/><path d="M52 2 l1 7 l-5 -3 z" fill="#3a2a22"/>
      <path d="M32 58 C14 58 6 44 8 30 C10 18 22 13 32 13 C42 13 54 18 56 30 C58 44 50 58 32 58 Z" fill="#f59a3a"/>
      <path d="M32 58 C22 58 14 50 14 42 C20 46 26 46 32 44 C38 46 44 46 50 42 C50 50 42 58 32 58 Z" fill="#fff6ea"/>
      ${e === 'normal' ? `<path d="M19 33 Q23 30 27 33" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M37 33 Q41 30 45 33" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>` : eyes(e, 23, 41, 33)}
      <ellipse cx="32" cy="44" rx="2.6" ry="1.9" fill="#3a2a22"/>
      ${mouth(e, 32, 48, 'w')}
      ${cheeks(17, 47, 41)}
    `),
  },
  {
    level: 8, name: 'ゆき', species: 'しろくま',
    catchphrase: '高い手は、だまって待ちます',
    profile: 'クールで物静かなしろくま。マフラーがお気に入り。高い手ができたらリーチせずにだまって待つ、大人の打ち方をします。',
    lines: {
      start: ['よろしくお願いします', '…勝負です'],
      idle: ['…', '静かに待ちます', 'このマフラー、あたたかいです'],
      riichi: ['リーチです', '…ここはリーチします'],
      call: ['いただきます', 'それ、頂戴します'],
      tsumo: ['ツモです。失礼します', '…あがりです'],
      ron: ['ロンです', '…それ、お待ちしていました'],
      dealIn: ['…不覚です', 'こおりつきました…'],
      reactRiichi: ['リーチですか。押し引きを考えます', '…了解です'],
      praise: ['お見事です', '…やりますね'],
      draw: ['流局ですね'],
      first: ['一位です。…少しうれしいです'],
      last: ['…今日は、雪がとけてしまいました'],
    },
    face: (e) => svg(`
      <circle cx="15" cy="16" r="7" fill="#f4f6f8" stroke="#dfe4ea" stroke-width="1"/><circle cx="15" cy="16" r="3.5" fill="#d9dee5"/>
      <circle cx="49" cy="16" r="7" fill="#f4f6f8" stroke="#dfe4ea" stroke-width="1"/><circle cx="49" cy="16" r="3.5" fill="#d9dee5"/>
      <ellipse cx="32" cy="34" rx="24" ry="21" fill="#f7f9fb" stroke="#dfe4ea" stroke-width="1"/>
      <ellipse cx="32" cy="41" rx="10" ry="7.5" fill="#fff"/>
      ${eyes(e, 23, 41, 31, '#222a33', 2.6)}
      <ellipse cx="32" cy="38" rx="3.4" ry="2.4" fill="#222a33"/>
      ${mouth(e, 32, 43)}
      ${cheeks(16, 48, 41, '#b6d4ff')}
      <path d="M10 52 Q32 62 54 52 L54 60 Q32 68 10 60 Z" fill="#4a90d9"/>
      <rect x="40" y="55" width="7" height="9" rx="2" fill="#3a78bd"/>
    `),
  },
  {
    level: 9, name: 'ほー博士', species: 'ふくろう',
    catchphrase: '押し引きの極意を教えてしんぜよう',
    profile: '丸めがねの物知りふくろう。点数と和了率と危険度をはかりにかけて、押すか引くかを決める押し引きの達人じゃ。',
    lines: {
      start: ['ホッホ、よろしく頼むぞい', 'さて、講義を始めようかの'],
      idle: ['期待値を計算中じゃ…', 'ホー…ここは押しどころかの', '若いもんには負けんぞい'],
      riichi: ['リーチじゃ！', 'ホッホ、ここは押しじゃ'],
      call: ['もらうぞい', 'それはありがたいの'],
      tsumo: ['ツモじゃ。計算どおりじゃ', 'ホッホッホ！'],
      ron: ['ロンじゃ！', 'その牌、待っておったぞい'],
      dealIn: ['ホ、ホー…読み違えたわい', 'めがねがずれたわい…'],
      reactRiichi: ['リーチか。押すか引くか…', 'ふむ、ここは引きじゃな'],
      praise: ['見事じゃ！', '良い判断じゃったの'],
      draw: ['流局じゃな'],
      first: ['一位じゃ。年の功じゃよ、ホッホ'],
      last: ['ホー…まだまだ修行が足りんわい'],
    },
    face: (e) => svg(`
      <path d="M10 18 L16 4 L24 14 Z" fill="#8b6143"/><path d="M54 18 L48 4 L40 14 Z" fill="#8b6143"/>
      <ellipse cx="32" cy="35" rx="24" ry="23" fill="#a87a55"/>
      <path d="M32 58 C20 58 14 50 14 42 L50 42 C50 50 44 58 32 58 Z" fill="#e9d2b0"/>
      <circle cx="22" cy="31" r="10" fill="#f6e8cf"/><circle cx="42" cy="31" r="10" fill="#f6e8cf"/>
      ${eyes(e, 22, 42, 31, '#2e2018', 3.6)}
      <circle cx="22" cy="31" r="10.5" fill="none" stroke="#3a3a3a" stroke-width="1.6"/>
      <circle cx="42" cy="31" r="10.5" fill="none" stroke="#3a3a3a" stroke-width="1.6"/>
      <path d="M32.5 31 h-1" stroke="#3a3a3a" stroke-width="1.6"/>
      ${e === 'happy' || e === 'surprised' ? '<path d="M28 40 L32 47 L36 40 Z" fill="#f2a43a"/><path d="M28 40 L32 37 L36 40 Z" fill="#f2a43a"/>' : '<path d="M28.5 39 L32 45 L35.5 39 Z" fill="#f2a43a"/>'}
      ${e === 'sad' ? '<path d="M14 44 q-2 4 0 6 q2 -2 0 -6z" fill="#7cc6ff"/>' : ''}
    `),
  },
  {
    level: 10, name: 'とらきち', species: 'とら',
    catchphrase: '最強の牙、見せてやるガオ！',
    profile: '森でいちばん強いとら。ミスをほとんどしない、まっすぐで豪快な打ち手。負けず嫌いだけど、強い相手にはちゃんと拍手するガオ。',
    lines: {
      start: ['よろしくガオ！手加減しないガオ', '本気でいくガオ！'],
      idle: ['ガルル…', '最善手はこれガオ', '牙をといでるガオ'],
      riichi: ['リーチガオ！！', 'かかってこいガオ！'],
      call: ['それはもらうガオ！', 'ガオッ、いただき！'],
      tsumo: ['ツモガオ！！', 'ガオーーー！'],
      ron: ['ロンガオ！', 'その牌、かみついたガオ！'],
      dealIn: ['ガ、ガオ…', 'くやしいガオ…！'],
      reactRiichi: ['リーチか…受けてたつガオ', '押すか引くか、見極めるガオ'],
      praise: ['やるガオ…！', 'おまえ、強いガオ'],
      draw: ['流局ガオ'],
      first: ['当然の一位ガオ！ガオーー！'],
      last: ['…次はぜったい勝つガオ'],
    },
    face: (e) => svg(`
      <circle cx="14" cy="15" r="7.5" fill="#f59a2c"/><circle cx="14" cy="15" r="3.5" fill="#fff1dc"/>
      <circle cx="50" cy="15" r="7.5" fill="#f59a2c"/><circle cx="50" cy="15" r="3.5" fill="#fff1dc"/>
      <ellipse cx="32" cy="35" rx="25" ry="22" fill="#f8a53a"/>
      <path d="M27 14 h10 M32 13 v7 M27.5 17 h9 M27 20.5 h10" stroke="#3a2a22" stroke-width="2" stroke-linecap="round"/>
      <path d="M8 30 l8 2 M8 36 l7 0 M56 30 l-8 2 M56 36 l-7 0" stroke="#3a2a22" stroke-width="2.4" stroke-linecap="round"/>
      <ellipse cx="32" cy="45" rx="13" ry="9" fill="#fff6ea"/>
      ${eyes(e, 23, 41, 32)}
      <path d="M29 40 h6 l-3 3z" fill="#e0607a"/>
      ${mouth(e, 32, 46, 'w')}
      ${e === 'happy' ? '<path d="M27 46 l1.5 3 l1.5 -3z M34 46 l1.5 3 l1.5 -3z" fill="#fff"/>' : ''}
      ${cheeks(16, 48, 42)}
    `),
  },
  {
    level: 11, name: 'おにまる', species: 'ちび鬼',
    catchphrase: 'みんなの手牌、まるみえだおに〜',
    profile: '節分がにがてな、ちっちゃな鬼の子。みんなの手牌がまるみえなので、当たり牌はぜったいに切らないおに。でも、ちょっとさみしがり。',
    lines: {
      start: ['ぐへへ、よろしくだおに〜', 'まるみえだおに〜'],
      idle: ['その手牌、見えてるおに♪', 'こんぼう、ぴかぴかにみがいたおに', 'ぐへへ…'],
      riichi: ['リーチだおに！', 'こわいだろ〜、リーチおに'],
      call: ['それもらうおに！', 'いただきおに〜'],
      tsumo: ['ツモだおに！ぐへへ！', 'おにのいきおいだおに！'],
      ron: ['ロンだおに！', 'みえてたおに〜'],
      dealIn: ['お、おにぃ…！？', 'ま、まめはやめておにぃ…'],
      reactRiichi: ['リーチ？当たり牌はわかってるおに', 'ぐへへ、よけるおに'],
      praise: ['お、おまえすごいおに…', 'みえてても負けたおに…'],
      draw: ['ながれたおに〜'],
      first: ['いちばんだおに！おにがしまでおまつりだおに！'],
      last: ['えーん、まめをぶつけられた気分おに…'],
    },
    face: (e) => svg(`
      <path d="M18 14 L21 1 L26 13 Z" fill="#ffd34d" stroke="#d9a400" stroke-width="1"/>
      <path d="M46 14 L43 1 L38 13 Z" fill="#ffd34d" stroke="#d9a400" stroke-width="1"/>
      <ellipse cx="32" cy="36" rx="24" ry="22" fill="#ff7f7f"/>
      <path d="M10 26 Q14 10 32 11 Q50 10 54 26 Q46 18 40 22 Q36 16 32 21 Q28 16 24 22 Q18 18 10 26 Z" fill="#3b2a3a"/>
      ${eyes(e, 23, 41, 34)}
      ${mouth(e, 32, 45)}
      ${e === 'happy' || e === 'normal' ? '<path d="M28 45 l1.5 3 l1.5 -3z" fill="#fff"/>' : ''}
      ${cheeks(16, 48, 43, '#ff5a7a')}
      <path d="M50 46 l10 -8 l3 3 l-10 8z" fill="#8a5a34"/><circle cx="61" cy="38" r="2" fill="#6b4226"/>
    `),
  },
  {
    level: 12, name: 'ひかり', species: '白い龍の子',
    catchphrase: '山の未来まで、ぜーんぶ見えておるぞ',
    profile: '雲の上からやってきた、白い龍の子どもの神さま。山に積まれた牌の順番まで見えているので、とっても強い。でも中身は甘えんぼうであるぞ。',
    lines: {
      start: ['ようこそ、よろしく頼むぞ', 'わらわの力、見せてやるのである'],
      idle: ['つぎに来る牌、知っておるぞ', 'ふふん、見えておる', 'くもの上はひまなのである'],
      riichi: ['リーチであるぞ！', 'この先の牌は見えておるぞ'],
      call: ['それはわらわがもらうぞ', 'いただくのである'],
      tsumo: ['ツモである！神のお告げどおりじゃ', 'えっへん、ツモであるぞ'],
      ron: ['ロンであるぞ！', 'それを待っておったのじゃ'],
      dealIn: ['な、なんと…！', 'か、神さまにも、たまにはあるのじゃ…'],
      reactRiichi: ['リーチか。ふむ、当たり牌はお見通しじゃ', 'ほう、よいリーチであるな'],
      praise: ['み、みごとである！', 'わらわを驚かせるとは…！'],
      draw: ['流局であるな'],
      first: ['当然の一位であるぞ！…ほめてもよいぞ？'],
      last: ['う、うそじゃ…神が負けるなんて…ぐすっ'],
    },
    face: (e) => svg(`
      <ellipse cx="32" cy="6" rx="13" ry="3.5" fill="none" stroke="#ffd34d" stroke-width="2.4"/>
      <path d="M17 16 q-6 -8 -2 -12 q2 6 7 8z" fill="#ffe08a"/><path d="M47 16 q6 -8 2 -12 q-2 6 -7 8z" fill="#ffe08a"/>
      <ellipse cx="32" cy="36" rx="24" ry="22" fill="#fbfcff" stroke="#d8e3f5" stroke-width="1.2"/>
      <path d="M20 14 q12 -6 24 0 q-6 4 -12 3 q-6 1 -12 -3z" fill="#c9e7ff"/>
      ${eyes(e, 23, 41, 34, '#3a5aa8')}
      <path d="M29 41 q3 2 6 0" fill="none" stroke="#9fb6dd" stroke-width="1.4" stroke-linecap="round"/>
      ${mouth(e, 32, 46)}
      <path d="M8 40 q-6 -4 -6 -10 M56 40 q6 -4 6 -10" fill="none" stroke="#9fb6dd" stroke-width="1.6" stroke-linecap="round"/>
      ${cheeks(16, 48, 43, '#ffb3c8')}
      <circle cx="32" cy="27" r="2" fill="#ffd34d"/>
    `),
  },
];

export function charaFor(level: number): Chara {
  return CHARAS.find((c) => c.level === level) ?? CHARAS[4];
}

export function pickLine(c: Chara, t: Talk): string {
  const list = c.lines[t];
  return list[Math.floor(Math.random() * list.length)];
}
