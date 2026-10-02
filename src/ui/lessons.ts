// まーじゃん教室: ルールをまったく知らない人向けのコース（ほー博士とぴよの会話で進む）
import { Tile, kindOf, parseTiles, isRedTile } from '../core/tiles';
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

/** 卒業対局の番号（レッスンの後ろ） */
const GRAD = 11;

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
      { t: 'talk', who: 'p', face: 'surprised', text: '白は、なにも書いてないぴよ？' },
      { t: 'talk', who: 'h', tiles: '5z', text: 'そうじゃ。青いわくだけで、字が書いていない牌が白じゃ。これも字牌の仲間じゃよ。' },
      { t: 'talk', who: 'h', tiles: '0m0p0s', text: 'それから、5の牌には赤いものもある。これは点数がふえる当たりの牌じゃ。くわしくはレッスン10で教えるぞ。' },
      { t: 'pick', text: 'クイズじゃ！3筒（まるが3つの牌）をタップしてみよう。', tiles: '3m7p3s3p5z', answer: '3p', explain: 'そのとおり！まるが3つで3筒じゃ。' },
      { t: 'pick', text: 'では1索はどれかな？（ヒント：鳥）', tiles: '1m9s1p1s', answer: '1s', explain: '正解！鳥の絵が1索じゃ。' },
      { t: 'pick', text: '白はどれじゃ？', tiles: '5m5z1z5s', answer: '5z', explain: 'お見事！字が書いていない牌が白じゃ。' },
      { t: 'talk', who: 'p', face: 'happy', text: 'ぜんぶわかったぴよ！' },
    ],
  },
  {
    id: 2, title: 'ゴールの形', sub: '和了（あがり）の形を知ろう',
    steps: [
      { t: 'talk', who: 'h', text: '麻雀のゴールは「和了」じゃ。和了るときは、手の中の14枚を、決まった形に組み合わせるんじゃよ。' },
      { t: 'talk', who: 'h', text: 'その形は「3枚の組が4つ」と「同じ牌2枚が1つ」。まずは組の作り方を見ていこう。' },
      { t: 'talk', who: 'h', tiles: '123m', text: 'ひとつめは順子。同じ種類で、数字が3つ続いたものじゃ。' },
      { t: 'talk', who: 'h', tiles: '555p', text: 'ふたつめは刻子。まったく同じ牌3枚じゃ。' },
      { t: 'talk', who: 'h', tiles: '77s', text: 'そして雀頭。同じ牌2枚のことじゃ。これは1つだけ作る。' },
      { t: 'talk', who: 'p', face: 'surprised', text: '東・南・西で、順子になるぴよ？' },
      { t: 'talk', who: 'h', tiles: '123z', text: 'ならんのじゃ。字牌には数字がないから、順子は作れない。字牌は、刻子か雀頭にするんじゃ。' },
      { t: 'talk', who: 'h', tiles: '123m 456p 234s 777s 55z', text: 'これが和了の形じゃ。123萬・456筒・234索・777索の4組と、白白の雀頭。' },
      { t: 'choice', text: '順子になっているのはどれじゃ？', options: [{ tiles: '135m' }, { tiles: '456p' }, { tiles: '1m2p3s' }], answer: 1, explain: '正解！456筒は同じ筒子で数字が続いておる。135は飛んでおるし、種類がちがうものも順子にはならんのじゃ。' },
      { t: 'talk', who: 'p', text: '形はわかったけど、実際にやってみたいぴよ。' },
      { t: 'group', text: 'では、この14枚を組に分けてみよう。3枚（または雀頭の2枚）をタップして選び、「組にする」を押すんじゃ。', tiles: '234m666p789s345s11z' },
      { t: 'talk', who: 'p', face: 'happy', text: 'パズルみたいで楽しいぴよ！' },
    ],
  },
  {
    id: 3, title: 'ゲームの流れ', sub: '引いて、捨てて、和了をめざす',
    steps: [
      { t: 'talk', who: 'h', text: '牌は、裏返しにして積んでおく。これを「山」というんじゃ。画面のまん中の「残り」が、山にある牌の数じゃよ。' },
      { t: 'talk', who: 'h', text: '麻雀は4人で、順番に「山から1枚引いて、いらない1枚を捨てる」をくり返すゲームじゃ。' },
      { t: 'talk', who: 'h', text: '牌を引くことをツモという。手牌はいつも13枚、引いたときだけ14枚になるぞ。' },
      { t: 'talk', who: 'h', text: 'こうして少しずつ手をよくして、和了の形ができたら勝ちじゃ。実際にやってみよう！' },
      {
        t: 'play', text: 'わしの言うとおりに、捨てる牌をタップしてみよう。', hand: '123m456p78s11s9p9m5z',
        script: [
          { draw: '9s', discard: '5z', say: '9索を引いた！78索とつながって順子になったぞ。使わない白を捨てよう。' },
          { draw: '9p', discard: '9m', say: '9筒を引いて、9筒が2枚になった。ひとりぼっちの9萬を捨てよう。' },
          { draw: '9p', say: 'もう1枚、9筒がきた！これで和了の形じゃ。「ツモ」を押そう！' },
        ],
      },
      { t: 'talk', who: 'p', face: 'happy', text: '和了れたぴよ〜！うれしいぴよ！' },
      { t: 'talk', who: 'h', text: '自分で引いた牌で和了ることも「ツモ」というんじゃ。「引く」ことも「引いて和了る」ことも、どちらもツモと呼ぶぞ。' },
      { t: 'talk', who: 'h', text: '本番では、ほかの3人も和了をめざしておるぞ。' },
    ],
  },
  {
    id: 4, title: '鳴いてみよう', sub: 'ポン・チーで人の捨て牌をもらう',
    steps: [
      { t: 'talk', who: 'p', text: '牌は、山から引くしかないぴよ？' },
      { t: 'talk', who: 'h', text: 'じつは、ほかの人が捨てた牌をもらって、組を作ることもできる。これを「鳴く」というんじゃ。鳴き方は2つあるぞ。' },
      { t: 'talk', who: 'h', tiles: '55z', text: 'ひとつめは「ポン」。同じ牌を2枚持っているとき、だれかが同じ牌を捨てたら、もらって刻子にできる。だれが捨てた牌でもOKじゃ。' },
      { t: 'talk', who: 'h', tiles: '46m', text: 'ふたつめは「チー」。左どなりの人（上家）が捨てた牌なら、順子も作れる。46萬を持っていれば、5萬をもらってチーじゃ。' },
      { t: 'talk', who: 'h', text: '鳴いたら、そのあと手から1枚捨てる。もらった組は、みんなに見えるように手の横に置くんじゃ。' },
      { t: 'talk', who: 'p', text: '鳴けるときは、いつも鳴かないとだめぴよ？' },
      { t: 'talk', who: 'h', text: '鳴くかどうかは自由じゃ。鳴けるときは画面にボタンが出るから、いらなければ「スキップ」を押せばよい。同じ牌4枚の「カン」もあるが、最初はスキップで大丈夫じゃ。' },
      { t: 'choice', text: '上家（左どなり）が5萬を捨てた。手に46萬がある。できるのは？', options: [{ text: 'ポン' }, { text: 'チー' }, { text: 'なにもできない' }], answer: 1, explain: '正解！上家の捨て牌で456萬の順子が作れるから、チーじゃ。' },
      { t: 'choice', text: '向かいの人（対面）が白を捨てた。手に白が2枚ある。できるのは？', options: [{ text: 'ポン' }, { text: 'チー' }], answer: 0, explain: '正解！同じ牌が3枚になるからポンじゃ。ポンは対面からでもできるぞ。' },
      { t: 'talk', who: 'p', face: 'happy', text: 'もらって組を作れるなんて、べんりぴよ！' },
    ],
  },
  {
    id: 5, title: 'テンパイと待ち', sub: 'あと1枚で和了の状態',
    steps: [
      { t: 'talk', who: 'h', text: 'あと1枚で和了できる状態を聴牌（テンパイ）という。その1枚のことを待ちというんじゃ。' },
      { t: 'talk', who: 'h', tiles: '123m 456p 789s 23s 55z', text: 'この手は23索がもう少し。1索か4索がくれば順子になって和了じゃ。待ちが2種類ある、とてもよい形じゃな。' },
      { t: 'choice', text: 'この手の待ちはどれじゃ？', tiles: '123m 456p 789s 46s 55z', options: [{ tiles: '5s' }, { tiles: '4s' }, { tiles: '7s' }], answer: 0, explain: '正解！46索のまん中、5索がくれば456索の順子になるぞ。' },
      { t: 'choice', text: 'では、この手の待ちは？', tiles: '123m 456p 789s 234s 5z', options: [{ tiles: '5z' }, { tiles: '2s' }, { tiles: '5s' }], answer: 0, explain: 'お見事！4つの組はもうできておるから、白がもう1枚くれば雀頭になって和了じゃ。' },
      { t: 'talk', who: 'p', text: '待ちの牌をほかの人が捨てたら、どうなるぴよ？' },
      { t: 'talk', who: 'h', text: 'それをもらって和了れるぞ。これを「ロン」という。自分で引いて和了るのが「ツモ」、人の捨て牌で和了るのが「ロン」。和了り方は2つあるんじゃ。' },
      { t: 'talk', who: 'h', text: '対局では、ロンやツモができるときは、ボタンが出て教えてくれるから安心じゃ。' },
      { t: 'talk', who: 'p', text: '待ちがわかると、どきどきするぴよ！' },
    ],
  },
  {
    id: 6, title: '役ってなに？', sub: '和了るために必要な条件',
    steps: [
      { t: 'talk', who: 'h', text: 'ここが大事じゃ。和了の形ができても、役が1つ以上ないと和了れないんじゃ。' },
      { t: 'talk', who: 'p', face: 'surprised', text: 'えっ！？形だけじゃだめぴよ！？' },
      { t: 'talk', who: 'h', text: '役はたくさんあるが、まずはこのレッスンで2つ、次のレッスンで2つ覚えれば十分じゃ。' },
      { t: 'talk', who: 'h', tiles: '234m 567p 345s 678s 55p', text: 'ひとつめは断幺九。2から8の数字だけで作る役じゃ。1・9・字牌を使わない。' },
      { t: 'talk', who: 'h', tiles: '555z 123m 456p 789s 11p', text: 'ふたつめは役牌。白・發・中のどれかを3枚そろえる役じゃ。' },
      { t: 'talk', who: 'p', face: 'surprised', text: '東・南・西・北を3枚そろえても、役にならないぴよ？' },
      { t: 'talk', who: 'h', tiles: '111z 222z 333z 444z', text: 'なる場合があるぞ。対局では、一人ひとりに「自分の風」が決まっておる。画面で、自分の点数の横に書いてある字じゃ。その風を3枚そろえると役牌になる。' },
      { t: 'talk', who: 'h', text: 'それから、画面の左上に「東1局」などと出ている、その最初の字の風も、みんなの役牌じゃ。それ以外の風は、3枚そろえても役にはならんぞ。くわしい流れはレッスン9で教えよう。' },
      { t: 'choice', text: '「東1局」で、自分の風は南。3枚そろえて役牌になるのはどれ？', options: [{ tiles: '2z' }, { tiles: '3z' }, { tiles: '4z' }], answer: 0, explain: '正解！自分の風の南は役牌じゃ。西・北は、今は役にならんぞ。東1局だから、東もみんなの役牌じゃ。' },
      { t: 'talk', who: 'h', text: '断幺九と役牌は、鳴いても役になるぞ。ポンやチーをした手でも和了れるんじゃ。' },
      { t: 'choice', text: 'この手を、人の捨て牌で和了ろうとしておる。和了れるかな？', tiles: '234m 567p 345s 678s 55p', options: [{ text: '和了れる（断幺九がある）' }, { text: '和了れない' }], answer: 0, explain: '正解！2〜8だけでできておるから、断幺九の役がついて和了れるぞ。' },
      { t: 'choice', text: 'では、この手は？（人の捨て牌で和了る）', tiles: '123m 456p 789s 111s 99p', options: [{ text: '和了れる' }, { text: '和了れない（役がない）' }], answer: 1, explain: 'そのとおり！形はできておるが、1や9があるから断幺九ではないし、役牌もない。でも、次のレッスンで習う「リーチ」をすれば和了れるようになるぞ。' },
      { t: 'talk', who: 'h', text: 'どの役を目指せばいいか迷ったら、対局中の「役ナビ」を見るとよいぞ。今の手で狙いやすい役を教えてくれる。' },
    ],
  },
  {
    id: 7, title: 'リーチをかけよう', sub: '鳴かない手のごほうび',
    steps: [
      { t: 'talk', who: 'h', text: '鳴かずに、自分で引いた牌だけでテンパイしたら「リーチ」と宣言できる。それだけで役になる、いちばんよく使う役じゃ。' },
      { t: 'talk', who: 'h', text: 'リーチするときは、1000点を場に出す。和了れば、ちゃんともどってくるぞ。' },
      { t: 'talk', who: 'p', face: 'surprised', text: 'リーチしたら、そのあとはどうするぴよ？' },
      { t: 'talk', who: 'h', text: 'リーチしたら、もう手は変えられない。引いた牌で和了れなければ、その牌をそのまま捨てていくんじゃ。' },
      { t: 'choice', text: 'リーチできるのはどっちの手？', options: [{ text: '鳴いていない手でテンパイ' }, { text: 'ポンした手でテンパイ' }], answer: 0, explain: '正解！リーチは、鳴いていない手だけの役じゃ。' },
      { t: 'choice', text: '鳴かずにこの形でテンパイした。でも役がない。どうする？', tiles: '123m 456p 789s 111s 9p', options: [{ text: 'リーチする' }, { text: 'このまま待つ' }], answer: 0, explain: '正解！リーチすれば役ができて、人の捨て牌でも和了れるようになるぞ。' },
      { t: 'talk', who: 'p', face: 'surprised', tiles: '123m 456p 789s 999p 11s', text: 'あれ？レッスン3で和了ったこの手は、リーチも断幺九も役牌もないのに和了れたぴよ？' },
      { t: 'talk', who: 'h', face: 'happy', tiles: '123m 456p 789s 999p 11s', text: 'よく気づいたのう！鳴かずに、自分で引いて和了ると、それだけで「門前清自摸和」という役になるんじゃ。' },
      { t: 'talk', who: 'p', face: 'happy', text: 'リーチ、かけてみたいぴよ！' },
    ],
  },
  {
    id: 8, title: '振り込まないコツ', sub: '守りのいちばん大事なこと',
    steps: [
      { t: 'talk', who: 'h', text: '自分の捨てた牌で、ほかの人にロンされることを放銃（振り込み）という。点数を払うのは、捨てたあなただけじゃ。' },
      { t: 'talk', who: 'p', face: 'sad', text: 'こわいぴよ…どうすればいいぴよ？' },
      { t: 'talk', who: 'h', text: '相手がリーチしたら、その相手が自分で捨てた牌は、ぜったいにロンされない。これを現物というんじゃ。' },
      { t: 'pick', text: 'リーチした人の捨て牌を見て、あなたの手牌から安全な牌をタップしよう。', shown: { label: 'リーチした人の捨て牌', tiles: '2m5p9s1z7m' }, tiles: '8m5p3s4z', answer: '5p', explain: '正解！5筒はリーチした人が自分で捨てておるから、ぜったいに安全じゃ。' },
      { t: 'talk', who: 'h', text: '対局中は「危険牌」ボタンで、どの牌が危ないかの目安が見られる。練習に使うとよいぞ。' },
    ],
  },
  {
    id: 9, title: '対局の進み方', sub: '局・親・東風戦・流局',
    steps: [
      { t: 'talk', who: 'h', text: 'みんな25000点を持って始める。和了ると、ほかの人から点数がもらえるんじゃ。' },
      { t: 'talk', who: 'h', text: 'だれかが和了るか、山がなくなるまでの1回の勝負を「局」という。' },
      { t: 'talk', who: 'h', text: '局ごとに、1人が「親」、ほかの3人が「子」になる。親は、和了ったときにもらえる点数が多いんじゃ。' },
      { t: 'talk', who: 'h', text: '親は、局ごとに順番に交代していく。4人が1回ずつ親をやって、4局で終わるのが「東風戦」。2回ずつ、8局やるのが「半荘戦」じゃ。' },
      { t: 'talk', who: 'p', face: 'surprised', text: '画面の「東1局」は、そのことぴよ？' },
      { t: 'talk', who: 'h', text: 'そのとおり！東1局、東2局…と進んでいく。親が和了ったときなどは、同じ局をもう1回やるぞ。そのときは「1本場」と出るんじゃ。' },
      { t: 'talk', who: 'h', text: '山がなくなって、だれも和了れなかったときは「流局」。テンパイしていない人が、テンパイしている人に点数を払うんじゃ。' },
      { t: 'talk', who: 'h', text: '最後に、点数がいちばん多い人の勝ちじゃ。' },
      { t: 'choice', text: '東風戦では、4人がそれぞれ何回ずつ親をやる？', options: [{ text: '1回ずつ' }, { text: '2回ずつ' }], answer: 0, explain: '正解！4人が1回ずつ親をやって、4局で終わるのが東風戦じゃ。2回ずつやる半荘戦は、そのぶん長いぞ。' },
      { t: 'talk', who: 'p', face: 'happy', text: '流れがわかったぴよ！' },
    ],
  },
  {
    id: 10, title: '点数とドラ', sub: '計算は覚えなくてOK',
    steps: [
      { t: 'talk', who: 'h', text: '点数は、役の数（翻）と手の形（符）で決まる。でも計算はアプリがやってくれるから、覚えなくて大丈夫じゃ。' },
      { t: 'talk', who: 'h', text: '目安だけ知っておこう。子なら、1翻でだいたい1000点。翻が多くなると「満貫」で8000点。いちばんすごい「役満」は32000点じゃ。' },
      { t: 'talk', who: 'h', text: '親が和了ると、点数が1.5倍になるぞ。' },
      { t: 'choice', text: '子が満貫で和了ると、何点もらえる？', options: [{ text: '3900点' }, { text: '8000点' }, { text: '32000点' }], answer: 1, explain: '正解！満貫は8000点。役満の32000点を和了ったら大喜びじゃ。' },
      { t: 'talk', who: 'h', text: 'もうひとつ、点数をふやす「ドラ」がある。ドラの牌を持って和了ると、1枚につき1翻ふえるんじゃ。' },
      { t: 'talk', who: 'h', tiles: '3m 4m', text: 'ドラは、画面の「ドラ表示牌」の次の数字の牌じゃ。表示牌が3萬なら、ドラは4萬。9の次は1にもどるぞ。' },
      { t: 'choice', text: 'ドラ表示牌が6筒のとき、ドラはどれ？', tiles: '6p', options: [{ tiles: '5p' }, { tiles: '6p' }, { tiles: '7p' }], answer: 2, explain: '正解！6の次で、7筒がドラじゃ。' },
      { t: 'talk', who: 'h', tiles: '0m0p0s', text: 'レッスン1で見た赤い5も、ドラと同じ当たりの牌じゃ。対局では、手の中のドラは金色に光るから、すぐわかるぞ。' },
      { t: 'talk', who: 'p', face: 'surprised', text: 'ドラがあれば、役がなくても和了れるぴよ？' },
      { t: 'talk', who: 'h', text: 'それはできんのじゃ。ドラは役ではない。役があって和了ったときに、点数がふえるおまけじゃよ。' },
      { t: 'talk', who: 'p', face: 'happy', text: 'これで、ぜんぶ習ったぴよ！' },
    ],
  },
  {
    id: GRAD, title: '卒業対局', sub: 'ぴよたちと実際に打ってみよう',
    steps: [
      { t: 'talk', who: 'h', text: 'よくがんばったのう。最後は卒業対局じゃ！' },
      { t: 'talk', who: 'p', face: 'happy', text: 'ぴよが3人で相手をするぴよ！手加減しないぴよ〜！' },
      { t: 'talk', who: 'h', text: '短い東風戦じゃ。「おすすめ」「見込み」「役ナビ」をオンにしておくから、困ったら見るとよい。1回でも和了ったら卒業じゃ！' },
      { t: 'talk', who: 'h', text: 'ボタンの横の「？」を押すと、使い方の説明が出るぞ。' },
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
    let done: number[] = p.done ?? [];
    // 並べ替え前の番号を今の番号に
    const v = p.v ?? 1;
    if (v < 2) done = done.map((id) => ({ 4: 5, 5: 6, 6: 4 } as Record<number, number>)[id] ?? id);
    if (v < 3) done = done.map((id) => ({ 7: 8, 8: 10 } as Record<number, number>)[id] ?? id);
    return { done, graduated: !!p.graduated, introShown: !!p.introShown };
  } catch {
    return { done: [], graduated: false, introShown: false };
  }
}

export function saveProgress(p: LessonProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...p, v: 3 }));
  } catch {
    /* 保存できなくても進められる */
  }
}

// ---------------------------------------------------------------
// 画面
// ---------------------------------------------------------------

/** 牌の列。空白で区切ると、組ごとに少しすき間を空けて並べる（例: '123m 456p 55z'） */
const tilesHtml = (s: string, cls = '') => s.trim().split(/\s+/)
  .map((part) => parseTiles(part).map((t) => tileHtml(t, { red: isRedTile(t), classes: cls ? [cls] : [] })).join(''))
  .join('<span class="ls-sep"></span>');

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
      const done = l.id === GRAD ? p.graduated : p.done.includes(l.id);
      return `
        <button class="ls-item ${done ? 'done' : ''}" data-act="ls-open" data-id="${l.id}">
          <span class="ls-no">${l.id === GRAD ? furigana('卒業') : `${l.id}`}</span>
          <span class="ls-text"><b>${furigana(l.title)}</b><small>${furigana(l.sub)}</small></span>
          <span class="ls-stamp">${done ? '<span class="stamp-ok">済</span>' : ''}</span>
        </button>`;
    }).join('');
    const next = LESSONS.find((l) => (l.id === GRAD ? !p.graduated : !p.done.includes(l.id)));
    this.root.innerHTML = `
      <div class="start lesson-menu">
        <h1>まーじゃん${furigana('教室')}</h1>
        <div class="ls-hero">${h.face('happy')}<p>${furigana('麻雀のルールを、ゼロから楽しく覚えよう！ 1つのレッスンは2〜3分じゃ。上から順番に進めるのがおすすめじゃぞ。')}</p></div>
        ${p.graduated ? `<p class="ls-graduated">🎓 ${furigana('卒業おめでとう！ もう立派な雀士じゃ')}</p>` : ''}
        <div class="ls-list">${items}</div>
        ${next ? `<button class="primary big" data-act="ls-open" data-id="${next.id}">${furigana(next.id === GRAD ? '卒業対局へ' : `レッスン${next.id}から始める`)}</button>` : ''}
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
          + `<div class="ls-tiles quiz">${parseTiles(s.tiles).map((t) => tileHtml(t, {
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
          <div class="ls-tiles row">${this.pool.map((t) => tileHtml(t, { classes: ['tap', ...(this.sel.has(t) ? ['sel'] : [])], attrs: { 'data-act': 'ls-sel', 'data-tile': t } })).join('')}</div>`;
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
          <div class="ls-title"><small>${furigana(l.id === GRAD ? '卒業' : `レッスン${l.id}`)}</small>${furigana(l.title)}</div>
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
          ${nextL ? `<button class="primary big" data-act="ls-open" data-id="${nextL.id}">${furigana(nextL.id === GRAD ? '卒業対局へ' : `次のレッスン（${nextL.title}）`)}</button>` : ''}
          <button class="big secondary" data-act="ls-menu">${furigana('教室に戻る')}</button>
        </div>
      </div>`;
  }
}
