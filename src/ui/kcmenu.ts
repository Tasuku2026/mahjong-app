// KawaiiCloud Labs のアプリ一覧メニュー
// 雲のアイコン（data-kc-menu を付けたボタン）を押すと、アプリの一覧が縦に開く。
// アプリの名簿は https://kawaiicloud.pages.dev/apps.json から読む（読めないときは下の控えを使う）。
// 新しいアプリを作ったら、kawaiicloud-site の public/apps.json に1行足せば、全アプリのメニューに出る。
//
// ※ 同じファイルを kawaiicloud-site・iq-test-app・mahjong-app に置いている（元は kawaiicloud-site/src/kcmenu.ts）。
//   直すときは3つともそろえる。

export interface KcApp {
  id: string;
  name: string;
  desc: string;
  url: string;
  icon: string;
}

export const KC_SITE = 'https://kawaiicloud.pages.dev';

// 名簿が読めないときの控え
const FALLBACK: KcApp[] = [
  { id: 'iqtest', name: 'IQテスト', desc: '5種目でIQの目安と得意・不得意がわかる', url: 'https://kawaiicloud-iqtest.pages.dev/', icon: `${KC_SITE}/icons/iqtest.png?v=3` },
  { id: 'mahjong', name: 'ひとり麻雀', desc: 'CPU 3人と打つ4人打ちリーチ麻雀', url: 'https://kawaiicloud-mahjong.pages.dev/', icon: `${KC_SITE}/icons/mahjong.png?v=3` },
];

interface Options {
  /** 今いるアプリ（apps.json の id）。トップページは 'top' */
  current: string;
  /** true のあいだは開かない（テストや対局の途中など） */
  isLocked?: () => boolean;
  /** 開けないときに、アイコンの近くに出す一言 */
  lockedMessage?: string;
}

let apps: KcApp[] = FALLBACK;
let opts: Options = { current: '' };
let panel: HTMLElement | null = null;
let started = false;
let openWidth = 0; // 開いたときの画面の幅（スマホで高さだけ変わったときは閉じない）

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// 名簿の中身を確かめる（KawaiiCloud の pages.dev 以外へのリンクは載せない）
function valid(a: unknown): a is KcApp {
  if (!a || typeof a !== 'object') return false;
  const x = a as Record<string, unknown>;
  const okUrl = (u: unknown) => typeof u === 'string' && /^https:\/\/kawaiicloud(-[a-z0-9-]+)?\.pages\.dev\//.test(u);
  return ['id', 'name', 'desc'].every((k) => typeof x[k] === 'string') && okUrl(x.url) && okUrl(x.icon);
}

export function parseApps(data: unknown): KcApp[] | null {
  const list = (data as { apps?: unknown })?.apps;
  if (!Array.isArray(list)) return null;
  const ok = list.filter(valid);
  return ok.length ? ok : null;
}

async function loadApps(): Promise<void> {
  try {
    const res = await fetch(`${KC_SITE}/apps.json`, { cache: 'no-cache' });
    if (!res.ok) return;
    apps = parseApps(await res.json()) ?? apps;
  } catch {
    // 読めないときは控えのまま
  }
}

export function menuHtml(list: KcApp[], current: string): string {
  return `
    <div class="kc-head">KawaiiCloud Labs のアプリ</div>
    ${list
      .map((a) => {
        const cur = a.id === current;
        return `<a class="kc-item${cur ? ' kc-cur' : ''}" href="${esc(a.url)}" role="menuitem"${cur ? ' aria-current="page"' : ''}>
          <img src="${esc(a.icon)}" alt="" width="40" height="40">
          <span class="kc-text"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></span>
          ${cur ? '<em>今ここ</em>' : ''}
        </a>`;
      })
      .join('')}
    ${current === 'top' ? '' : `<a class="kc-top" href="${KC_SITE}/" role="menuitem">☁ KawaiiCloud のトップへ</a>`}`;
}

function close(): void {
  panel?.remove();
  panel = null;
  document.querySelectorAll('[data-kc-menu]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}

function open(btn: HTMLElement): void {
  close();
  panel = document.createElement('div');
  panel.className = 'kc-menu';
  panel.setAttribute('role', 'menu');
  panel.innerHTML = menuHtml(apps, opts.current);
  document.body.appendChild(panel);
  // アイコンのすぐ下に出す。画面からはみ出さないよう左右を詰める。ページと一緒に動く（スクロールしても閉じない）
  const r = btn.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const width = Math.min(320, vw - 16);
  panel.style.width = `${width}px`;
  panel.style.top = `${r.bottom + window.scrollY + 8}px`;
  panel.style.left = `${Math.max(8, Math.min(r.left, vw - width - 8)) + window.scrollX}px`;
  openWidth = window.innerWidth;
  btn.setAttribute('aria-expanded', 'true');
}

// 開けないときの一言（少しのあいだだけ出す）
function hint(btn: HTMLElement): void {
  if (!opts.lockedMessage) return;
  document.querySelector('.kc-hint')?.remove();
  const el = document.createElement('div');
  el.className = 'kc-hint';
  el.textContent = opts.lockedMessage;
  const r = btn.getBoundingClientRect();
  el.style.top = `${r.bottom + window.scrollY + 6}px`;
  el.style.left = `${Math.max(8, r.left) + window.scrollX}px`;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 1800);
}

/** メニューを使えるようにする（ページを開いたときに1回だけ呼ぶ） */
export function initKcMenu(o: Options): void {
  opts = o;
  if (started) return;
  started = true;
  injectStyle();
  void loadApps();
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>('[data-kc-menu]');
    if (btn) {
      e.preventDefault();
      if (panel) return close();
      if (opts.isLocked?.()) return hint(btn);
      return open(btn);
    }
    if (panel && !panel.contains(target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel) close();
  });
  // 画面の幅が変わったら位置がずれるので閉じる（スマホでアドレス欄が出入りして高さだけ変わったときは閉じない）
  window.addEventListener('resize', () => {
    if (panel && window.innerWidth !== openWidth) close();
  });
}

/** 今メニューを開いているか（開いているあいだ、アプリ側のキー操作を止めたいときに使う） */
export function kcMenuOpen(): boolean {
  return panel !== null;
}

// メニューの見た目（どのアプリでも同じにするため、ここで持つ）
function injectStyle(): void {
  const css = `
  .kc-menu { position: absolute; z-index: 1000; box-sizing: border-box; padding: 10px; border: 2px solid #FFD6E7; border-radius: 18px; background: #fff;
    box-shadow: 0 10px 30px rgba(90, 74, 99, 0.18); font-family: 'Hiragino Maru Gothic ProN', 'Yu Gothic UI', 'Hiragino Sans', Meiryo, sans-serif; color: #4A3F55;
    animation: kc-pop 0.16s ease-out; text-align: left; line-height: 1.4; }
  @keyframes kc-pop { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }
  .kc-head { padding: 2px 8px 8px; color: #B07A99; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; }
  .kc-item { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 12px; color: inherit; text-decoration: none; }
  .kc-item:hover { background: #FFF0F6; }
  .kc-item img { width: 40px; height: 40px; border-radius: 11px; flex: none; }
  .kc-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .kc-text b { font-size: 15px; }
  .kc-text small { color: #8A7F95; font-size: 12px; }
  .kc-item em { flex: none; padding: 2px 8px; border-radius: 10px; background: #FFD6E7; color: #B0457A; font-size: 11px; font-style: normal; font-weight: 700; }
  .kc-cur { background: #FFF7FA; }
  .kc-top { display: block; margin-top: 6px; padding: 9px 8px 4px; border-top: 1px dashed #F3C6DA; color: #B0457A; font-size: 13px; font-weight: 700; text-decoration: none; text-align: center; }
  .kc-top:hover { text-decoration: underline; }
  .kc-hint { position: absolute; z-index: 1000; padding: 6px 12px; border-radius: 12px; background: #5A4A63; color: #fff; font-size: 13px; pointer-events: none; }
  [data-kc-menu] { cursor: pointer; }`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}
