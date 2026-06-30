// 成績画面。過去1ヶ月以上のカレンダー（ヒートマップ）と集計を表示する。

import { getRecentDays, getStreak, getTodayRecord, getSettings, todayStr, totals, MOVE_COUNTS } from '../store/store.ts';

const WEEKS = 6; // 6週間（42日 = 1ヶ月以上）を表示
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function levelClass(solved: number): string {
  if (solved <= 0) return 'lv0';
  if (solved <= 2) return 'lv1';
  if (solved <= 4) return 'lv2';
  if (solved <= 7) return 'lv3';
  return 'lv4';
}

export class StatsView {
  private root: HTMLElement;
  constructor(root: HTMLElement) {
    this.root = root;
  }

  mount(): void {
    this.render();
  }

  render(): void {
    this.root.innerHTML = '';
    this.root.classList.add('stats');

    const settings = getSettings();
    const today = getTodayRecord();
    const streak = getStreak();
    const t = totals();

    // サマリーカード
    const summary = document.createElement('div');
    summary.className = 'stats-summary';
    summary.appendChild(this.card('きょう', `${today.solved} / ${settings.dailyGoal}`, '問'));
    summary.appendChild(this.card('連続', `${streak}`, '日'));
    summary.appendChild(this.card('累計', `${t.solved}`, '問'));
    summary.appendChild(this.card('がんばった日', `${t.days}`, '日'));
    this.root.appendChild(summary);

    // 今日の達成リング
    this.root.appendChild(this.progressRing(today.solved, settings.dailyGoal));

    // カレンダー（ヒートマップ）
    const calTitle = document.createElement('h3');
    calTitle.className = 'section-title';
    calTitle.textContent = 'カレンダー（過去6週間）';
    this.root.appendChild(calTitle);
    this.root.appendChild(this.calendar());

    // 手数別の集計（直近30日）
    this.root.appendChild(this.byMovesSection());

    // 凡例
    const legend = document.createElement('div');
    legend.className = 'heat-legend';
    legend.innerHTML =
      '<span>少ない</span>' +
      ['lv0', 'lv1', 'lv2', 'lv3', 'lv4'].map((c) => `<i class="heat ${c}"></i>`).join('') +
      '<span>多い</span>';
    this.root.appendChild(legend);
  }

  private card(label: string, value: string, unit: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'stat-card';
    el.innerHTML = `<div class="stat-label">${label}</div><div class="stat-value">${value}<span class="stat-unit">${unit}</span></div>`;
    return el;
  }

  private progressRing(value: number, goal: number): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'ring-wrap';
    const pct = goal > 0 ? Math.min(1, value / goal) : 0;
    const deg = Math.round(pct * 360);
    const ring = document.createElement('div');
    ring.className = 'ring';
    ring.style.background = `conic-gradient(var(--accent) ${deg}deg, var(--ring-bg) 0deg)`;
    const inner = document.createElement('div');
    inner.className = 'ring-inner';
    inner.innerHTML =
      value >= goal
        ? `<div class="ring-done">達成!</div><div class="ring-sub">${value}/${goal}</div>`
        : `<div class="ring-num">${value}/${goal}</div><div class="ring-sub">きょうの目標</div>`;
    ring.appendChild(inner);
    wrap.appendChild(ring);
    return wrap;
  }

  private calendar(): HTMLElement {
    const days = getRecentDays(WEEKS * 7 + 7);
    const map = new Map(days.map((r) => [r.date, r.solved]));

    const wrap = document.createElement('div');
    wrap.className = 'calendar';

    // 曜日見出し
    const header = document.createElement('div');
    header.className = 'cal-row cal-head';
    for (const w of WEEKDAYS) {
      const c = document.createElement('div');
      c.className = 'cal-weekday';
      c.textContent = w;
      header.appendChild(c);
    }
    wrap.appendChild(header);

    // 今週の日曜起点で、過去 WEEKS 週分
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() - (WEEKS - 1) * 7);
    const todayS = todayStr(now);

    for (let w = 0; w < WEEKS; w++) {
      const row = document.createElement('div');
      row.className = 'cal-row';
      for (let d = 0; d < 7; d++) {
        const cur = new Date(start);
        cur.setDate(start.getDate() + w * 7 + d);
        const ds = todayStr(cur);
        const solved = map.get(ds) ?? 0;
        const cell = document.createElement('div');
        cell.className = `cal-cell ${levelClass(solved)}`;
        if (ds === todayS) cell.classList.add('cal-today');
        if (cur > now) cell.classList.add('cal-future');
        cell.title = `${ds}: ${solved}問`;
        cell.textContent = String(cur.getDate());
        row.appendChild(cell);
      }
      wrap.appendChild(row);
    }
    return wrap;
  }

  private byMovesSection(): HTMLElement {
    const days = getRecentDays(30);
    const agg: Record<number, number> = {};
    for (const k of MOVE_COUNTS) agg[k] = 0;
    for (const r of days) {
      for (const k of MOVE_COUNTS) agg[k] += r.byMoves[k] ?? 0;
    }
    const wrap = document.createElement('div');
    wrap.className = 'bymoves';
    const title = document.createElement('h3');
    title.className = 'section-title';
    title.textContent = '手数べつ（直近30日）';
    wrap.appendChild(title);
    const max = Math.max(1, ...MOVE_COUNTS.map((k) => agg[k]));
    for (const k of MOVE_COUNTS) {
      const row = document.createElement('div');
      row.className = 'bymoves-row';
      const label = document.createElement('span');
      label.className = 'bymoves-label';
      label.textContent = `${k}手`;
      const bar = document.createElement('div');
      bar.className = 'bymoves-bar';
      const fill = document.createElement('div');
      fill.className = 'bymoves-fill';
      fill.style.width = `${(agg[k] / max) * 100}%`;
      bar.appendChild(fill);
      const val = document.createElement('span');
      val.className = 'bymoves-val';
      val.textContent = `${agg[k]}問`;
      row.appendChild(label);
      row.appendChild(bar);
      row.appendChild(val);
      wrap.appendChild(row);
    }
    return wrap;
  }
}
