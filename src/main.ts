import './style.css';
import { App } from './ui/app';
import { initAnalytics } from './ui/analytics';

const app = new App(document.getElementById('app')!);
app.showStart();
initAnalytics();

// 開発中のみ: ブラウザのコンソールから動作確認できるようにする
if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;
