# ひとり麻雀（mahjong-app）

CPU 3人と対局する4人打ちリーチ麻雀の Web アプリ。ブラウザだけで動く静的サイト（Vite + TypeScript、フレームワークなし）。

- 公開: https://tasuku2026.github.io/mahjong-app/ （`main` に push すると GitHub Actions で GitHub Pages に自動デプロイ）
- 利用者はスマホ中心。画面は 375×812 前後のスマホ幅で崩れないことを必ず確認する
- 依頼者は日本語で話す麻雀好きの非エンジニア。説明は日本語・専門用語は控えめに

## コマンド

```bash
npm install
npm run dev        # 開発サーバー (http://localhost:5173)
npm test           # vitest（役・点数・向聴数のテスト + CPU同士の自動対局）
npm run build      # 型チェック + dist/ 出力
npx vite-node scripts/strength.ts 40 1,4,7,10   # CPUレベル別の成績比較（数分かかる）
```

## 構成

- `src/core/` ルールエンジン: `tiles.ts`（牌ID 0..135 / 種類 0..33）、`shanten.ts`（向聴数・待ち・和了形判定）、`agari.ts`、`yaku.ts`（役・符・点数）、`game.ts`（対局進行。Agent/GameUI インターフェース経由で人間とCPUを同じ扱い）
- `src/ai/` CPU: `cpu.ts`（レベル1〜10 + 鬼(11)・神(12)。`decideTurn`/`decideCall` はヒント表示でも使う）、`danger.ts`（危険度）、`value.ts`（打点・和了率・期待値）、`yakuShanten.ts`（役ごとの向聴数）
- `src/ui/` 画面: `app.ts`（描画は毎回 innerHTML で作り直す方式）、`tileArt.ts`（牌のSVG図柄）、`assist.ts`（補助機能）、`help.ts`（？ボタンの説明文）、`yakuGuide.ts`（役ナビ）、`terms.ts`（ふりがな）、`characters.ts`（CPUキャラ12人のプロフィール・セリフ）、`charaArt.ts`（キャラの絵: ゆるくて丸いオリジナル絵柄。既存キャラのまねはしない）、`practice.ts`（何切る問題・点数計算の練習・役の図鑑）、`lessons.ts`（まーじゃん教室の画面と初級コース: 10レッスン＋卒業対局、進み具合は localStorage）、`lessonsMore.ts`（中級: 9レッスン＋卒業対局、上級: 6レッスン＋点数計算テスト）、`stats.ts`（戦績・localStorage）、`sound.ts`（WebAudio効果音）、`analytics.ts`（GoatCounter）

## 決まりごと

- 画面の文言・コード内コメントは日本語
- 画面に出す麻雀用語にはふりがなを付ける（`src/ui/terms.ts` の `furigana()` / `kindRuby()` を通す。新しい用語は用語集 GLOSSARY に追加）
- 設定項目を増やしたら `help.ts` に初心者向けの説明（？ボタン）も追加する
- CPU の思考を変えたら `scripts/strength.ts` でレベルの強さの順番が崩れていないか確認する
- 変更後は `npm test` と `npm run build` を通してから `main` に push する（push = 公開）
- 開発時のみ `window.__app` から App を操作できる（`settings.speed` を小さくすると自動対局が速い）
