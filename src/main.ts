import './style.css';
import { App } from './ui/app';
import { initAnalytics } from './ui/analytics';
import { importMoved } from './ui/moved';

// 旧アドレスから引っ越してきたときは、先に保存データを取り込んでから始める（戦績・設定・教室の進み具合を引き継ぐ）
void importMoved().finally(() => {
  const app = new App(document.getElementById('app')!);
  app.showStart();
  initAnalytics();

  // 開発中のみ: ブラウザのコンソールから動作確認できるようにする
  if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;
});
