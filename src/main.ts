// アプリ起動・画面切り替え。上部に今日の進捗、下部にタブ（もんだい/きろく/せってい）。

import './style.css';
import { ProblemSource } from './ui/problemSource.ts';
import { SolveView } from './ui/solveView.ts';
import { StatsView } from './ui/statsView.ts';
import { SettingsView } from './ui/settingsView.ts';
import { getSettings, getStreak, getTodayRecord } from './store/store.ts';

type ViewName = 'solve' | 'stats' | 'settings';

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function main(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = '';

  // 上部バー
  const appbar = el('header', 'appbar');
  const title = el('div', 'appbar-title', '詰将棋ドリル');
  const progress = el('div', 'appbar-progress');
  appbar.appendChild(title);
  appbar.appendChild(progress);
  app.appendChild(appbar);

  // コンテンツ（各ビューのコンテナを保持して表示切り替え）
  const content = el('main', 'content');
  const solveEl = el('section', 'view');
  const statsEl = el('section', 'view');
  const settingsEl = el('section', 'view');
  content.appendChild(solveEl);
  content.appendChild(statsEl);
  content.appendChild(settingsEl);
  app.appendChild(content);

  // 下部タブ
  const tabbar = el('nav', 'tabbar');
  const tabs: { name: ViewName; label: string; icon: string }[] = [
    { name: 'solve', label: 'もんだい', icon: '♟' },
    { name: 'stats', label: 'きろく', icon: '📅' },
    { name: 'settings', label: 'せってい', icon: '⚙' },
  ];
  const tabButtons = new Map<ViewName, HTMLButtonElement>();
  for (const t of tabs) {
    const b = document.createElement('button');
    b.className = 'tab';
    b.innerHTML = `<span class="tab-icon">${t.icon}</span><span class="tab-label">${t.label}</span>`;
    b.addEventListener('click', () => show(t.name));
    tabbar.appendChild(b);
    tabButtons.set(t.name, b);
  }
  app.appendChild(tabbar);

  // 進捗バー更新
  function updateAppbar(): void {
    const s = getSettings();
    const rec = getTodayRecord();
    const streak = getStreak();
    const done = rec.solved >= s.dailyGoal;
    progress.innerHTML =
      `<span class="ap-today ${done ? 'ap-done' : ''}">きょう ${rec.solved}/${s.dailyGoal}</span>` +
      `<span class="ap-streak">🔥 ${streak}日</span>`;
  }

  // ビュー生成
  const source = new ProblemSource();
  source.setMoveCounts(getSettings().moveCounts);

  const solve = new SolveView(solveEl, { source, onProgress: updateAppbar });
  const stats = new StatsView(statsEl);
  const settings = new SettingsView(settingsEl, {
    onChange: (s) => {
      source.setMoveCounts(s.moveCounts);
      solve.refreshSettings();
      updateAppbar();
    },
  });

  solve.mount();
  stats.mount();
  settings.mount();

  let current: ViewName = 'solve';
  function show(name: ViewName): void {
    current = name;
    solveEl.classList.toggle('active', name === 'solve');
    statsEl.classList.toggle('active', name === 'stats');
    settingsEl.classList.toggle('active', name === 'settings');
    for (const [n, b] of tabButtons) b.classList.toggle('tab-on', n === name);
    if (name === 'solve') solve.onShow(); // 盤サイズを再計算
    if (name === 'stats') stats.render(); // 最新成績で再描画
    if (name === 'settings') settings.mount();
    updateAppbar();
    window.scrollTo(0, 0);
  }

  show(current);
  updateAppbar();

  // 開発時のみ: ブラウザ検証用にビューを公開（本番ビルドでは除去される）
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__shogi = { solve, show };
  }
}

main();
