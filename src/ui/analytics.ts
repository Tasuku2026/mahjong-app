// アクセス解析（GoatCounter）。Cookie や個人を特定する情報は使わない。
// GOATCOUNTER_CODE に GoatCounter のサイトコード（https://<code>.goatcounter.com の <code>）を設定すると有効になる。

const GOATCOUNTER_CODE: string = 'tasuku-mahjong';

interface GoatCounter {
  count(vars: { path: string; title?: string; event?: boolean }): void;
}

declare global {
  interface Window {
    goatcounter?: GoatCounter & { no_onload?: boolean; allow_local?: boolean };
  }
}

const enabled = (): boolean => GOATCOUNTER_CODE !== '' && !import.meta.env.DEV;

/** 解析スクリプトを読み込み、ページ表示を1回記録する */
export function initAnalytics(): void {
  if (!enabled()) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
  document.head.appendChild(s);
}

/** イベントを記録する（例: 対局開始・終了）。読み込み前や無効時は何もしない */
export function trackEvent(name: string, title?: string): void {
  if (!enabled()) return;
  try {
    window.goatcounter?.count({ path: name, title: title ?? name, event: true });
  } catch {
    /* 解析の失敗はゲームに影響させない */
  }
}

export const analyticsEnabled = enabled;
