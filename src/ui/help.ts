/** スタート画面の「？」ボタンで表示する説明 */
export const HELP: Record<string, { title: string; body: string }> = {
  len: {
    title: '対局の長さ',
    body: `
      <p>何局遊ぶと1回の対局が終わるかを選びます。</p>
      <dl>
        <dt>東風戦（とんぷうせん）</dt>
        <dd>4人が1回ずつ親（ディーラー役）をしたら終わりです。最短4局で、目安は<b>10〜15分</b>。気軽に遊びたいときに。</dd>
        <dt>半荘戦（はんちゃんせん）</dt>
        <dd>親が2周するまで続きます。最短8局で、目安は<b>25〜40分</b>。一般的な麻雀の長さです。</dd>
      </dl>
      <p class="note">親が和了（あがり）またはテンパイで局を終えると、親はそのまま続投（連荘）するため、局数は増えることがあります。最後まで誰も30,000点に届かなかった場合は、延長戦（西入）になります。<br>誰かの持ち点が0点未満になると、その時点で終了します（トビ）。</p>`,
  },
  speed: {
    title: 'CPUの速さ',
    body: `
      <p>CPUが牌を切ったり、ポン・チーなどを宣言したりするまでの待ち時間です。</p>
      <dl>
        <dt>ゆっくり</dt><dd>相手が何を捨てたか、じっくり見たいときに。初めての方におすすめです。</dd>
        <dt>ふつう</dt><dd>標準の速さです。</dd>
        <dt>はやい</dt><dd>テンポよく進めたいときに。</dd>
      </dl>`,
  },
  level: {
    title: 'CPUの強さ',
    body: `
      <p>3人のCPUの強さを、それぞれ <b>レベル1（弱い）〜レベル10（強い）</b> から選べます。</p>
      <dl>
        <dt>レベル1〜3</dt><dd>入門向け。ミスが多く、あまり上手に手を進めません。</dd>
        <dt>レベル4〜6</dt><dd>中級。効率よく手を進めて、和了を目指します。</dd>
        <dt>レベル7〜10</dt><dd>上級。ミスが少なく、強い打ち方をします。</dd>
      </dl>
      <p><b>席の名前</b></p>
      <dl>
        <dt>下家（しもちゃ）</dt><dd>あなたの右隣。あなたの次に牌を引く人です。</dd>
        <dt>対面（といめん）</dt><dd>あなたの正面の人です。</dd>
        <dt>上家（かみちゃ）</dt><dd>あなたの左隣。あなたの直前に牌を捨てる人で、この人の捨て牌だけ「チー」ができます。</dd>
      </dl>`,
  },
  aka: {
    title: '赤ドラ',
    body: `
      <p>「5」の牌（五萬・5筒・5索）のうち、それぞれ1枚ずつが<b style="color:#ff6b6b">赤い牌</b>になっています。</p>
      <p>赤い牌は<b>ボーナス牌（ドラ）</b>で、和了（あがり）のときに手の中に持っていると、1枚につき点数が1段階（1翻）上がります。</p>
      <dl>
        <dt>あり（チェック）</dt><dd>点数が高くなりやすく、派手な展開になります。いまの麻雀では一般的です。</dd>
        <dt>なし</dt><dd>赤い牌がなくなり、ふつうの5として扱います。</dd>
      </dl>
      <p class="note">ドラは役ではないため、ドラだけでは和了できません。別に1つ以上の役が必要です。</p>`,
  },
  kuitan: {
    title: '喰いタン',
    body: `
      <p><b>タンヤオ（断幺九）</b>は、2〜8の数字の牌だけで手を作る、いちばん簡単な役です（1・9・字牌を使わない）。</p>
      <p>「喰いタン」は、他の人の捨て牌を<b>ポンやチーで取った（鳴いた）後でも</b>、タンヤオを役として認めるかどうかのルールです。</p>
      <dl>
        <dt>あり（チェック）</dt><dd>鳴いてもタンヤオで和了できます。和了しやすくなるので、初心者の方におすすめです。いまの麻雀では一般的です。</dd>
        <dt>なし</dt><dd>タンヤオは鳴かずに作った場合だけ役になります。</dd>
      </dl>`,
  },
};

export const helpButton = (key: string): string =>
  `<button type="button" class="help" data-act="help" data-help="${key}" aria-label="${HELP[key].title}の説明">?</button>`;

export const helpDialogHtml = (key: string): string => `
  <div class="overlay help-overlay" data-act="close-help">
    <div class="dialog help-dialog" role="dialog" aria-modal="true">
      <h2>${HELP[key].title}</h2>
      ${HELP[key].body}
      <button class="primary" data-act="close-help">閉じる</button>
    </div>
  </div>`;
