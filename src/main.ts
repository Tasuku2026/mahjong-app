import './style.css';
import { App } from './ui/app';
import { initAnalytics } from './ui/analytics';
import { importMoved } from './ui/moved';
import { initKcMenu } from './ui/kcmenu';

// 旧アドレスから引っ越してきたときは、先に保存データを取り込んでから始める（戦績・設定・教室の進み具合を引き継ぐ）
void importMoved().finally(() => {
  const app = new App(document.getElementById('app')!);
  app.showStart();
  initAnalytics();

  // 画面のいちばん上の細い帯にある雲のボタンから、KawaiiCloud Labs のほかのアプリへ移れる（対局中は帯ごと隠す: style.css の .kc-bar）
  document.getElementById('app')!.insertAdjacentHTML('beforebegin', '<div class="kc-bar"><button class="kc-btn" data-kc-menu aria-haspopup="menu" aria-expanded="false" aria-label="KawaiiCloud Labs のアプリ一覧を開く"><img src="./kawaiicloud.png?v=2" alt="" width="28" height="28"><span>KawaiiCloud</span><span class="kc-caret" aria-hidden="true">▾</span></button></div>');
  initKcMenu({ current: 'mahjong', isLocked: () => app.inGame(), lockedMessage: '対局中は開けません' });

  // 開発中のみ: ブラウザのコンソールから動作確認できるようにする
  if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;
});
