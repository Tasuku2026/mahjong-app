# ひとり麻雀

CPU 3人と対局できる4人打ちリーチ麻雀のWebアプリです。ブラウザだけで動きます（スマホ対応）。

## 開発

```bash
npm install
npm run dev     # 開発サーバー
npm test        # テスト
npm run build   # dist/ に公開用ファイルを出力
```

`main` ブランチに push すると GitHub Actions で GitHub Pages に公開されます。

## CPUの強さの確認

```bash
npx vite-node scripts/strength.ts 40 1,4,7,10   # 東風戦40回でレベル別の成績を比較
```

## 構成

- `src/core/` ルールエンジン（牌、向聴数、役・点数計算、対局進行）
- `src/ai/` CPU の思考（cpu.ts: レベル別の打ち方、danger.ts: 危険度、value.ts: 打点・和了率）
- `src/ui/` 画面
