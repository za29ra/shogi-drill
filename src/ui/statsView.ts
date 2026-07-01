// 成績画面。過去1ヶ月以上のカレンダー（ヒートマップ）と集計を表示する。

import {
  getDayRecord,
  getRecentDays,
  getStreak,
  getTodayRecord,
  getSettings,
  todayStr,
  totals,
  MOVE_COUNTS,
  type DayRecord,
} from '../store/store.ts';

const WEEKS = 6; // 6週間（42日 = 1ヶ月以上）を表示
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// 解答カテゴリの色とラベル（一発正解／間違えたけど自力正解／ヒントを使って正解／答えを見た の順で固定）
const CATEGORY_COLORS = [
  { label: '一発正解（ノーミス）', color: 'var(--good)' },
  { label: '間違えたけど自力正解', color: 'var(--accent2)' },
  { label: 'ヒントを使って正解', color: 'var(--seg-hint)' },
  { label: '答えを見た', color: 'var(--ring-bg)' },
];

function levelClass(solved: number): string {
  if (solved <= 0) return 'lv0';
  if (solved <= 2) return 'lv1';
  if (solved <= 4) return 'lv2';
  if (solved <= 7) return 'lv3';
  return 'lv4';
}

export class StatsView {
  private root: HTMLElement;
  private selectedDate: string = todayStr();
  private activeTooltip: HTMLElement | null = null;
  private tooltipDismissHandler: (() => void) | null = null;
  private tooltipTimer: number | null = null;
  constructor(root: HTMLElement) {
    this.root = root;
  }

  mount(): void {
    this.render();
  }

  render(): void {
    this.dismissBarTooltip();
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

    // 選択した日の内訳
    this.root.appendChild(this.dayDetail());

    // 手数別の集計（直近30日）
    this.root.appendChild(this.byMovesSection(getRecentDays(30), '手数べつ（直近30日）'));

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
        if (ds === this.selectedDate) cell.classList.add('cal-selected');
        if (cur > now) cell.classList.add('cal-future');
        cell.title = `${ds}: ${solved}問`;
        cell.textContent = String(cur.getDate());
        if (cur <= now) {
          cell.addEventListener('click', () => {
            this.selectedDate = ds;
            this.render();
          });
        }
        row.appendChild(cell);
      }
      wrap.appendChild(row);
    }
    return wrap;
  }

  private dayDetail(): HTMLElement {
    const rec = getDayRecord(this.selectedDate);
    const [y, mo, d] = rec.date.split('-').map(Number);
    const wd = WEEKDAYS[new Date(y, mo - 1, d).getDay()];

    const wrap = document.createElement('div');
    wrap.className = 'day-detail';

    const title = document.createElement('h3');
    title.className = 'section-title';
    title.textContent = `${rec.date}（${wd}）の内訳`;
    wrap.appendChild(title);

    const card = document.createElement('div');
    card.className = 'day-detail-card';
    const total = document.createElement('div');
    total.className = 'day-detail-total';
    total.textContent = `出題 ${rec.attempts}問 / 解けた ${rec.solved}問`;
    card.appendChild(total);
    wrap.appendChild(card);

    wrap.appendChild(this.dayByMovesBreakdown(rec));
    return wrap;
  }

  // カテゴリ色の凡例（色とラベルのみ、件数は各バーのセグメントをタップして確認する）
  private categoryLegend(): HTMLElement {
    const legend = document.createElement('div');
    legend.className = 'day-legend';
    for (const seg of CATEGORY_COLORS) {
      const item = document.createElement('div');
      item.className = 'day-legend-item';
      item.innerHTML =
        `<i class="day-legend-swatch" style="background:${seg.color}"></i>` +
        `<span class="day-legend-label">${seg.label}</span>`;
      legend.appendChild(item);
    }
    return legend;
  }

  // 選択した日の手数別内訳を、4色の積み上げバーで表示する。
  // 各色セグメントはタップでツールチップ（件数・割合）を表示する。
  private dayByMovesBreakdown(rec: DayRecord): HTMLElement {
    this.dismissBarTooltip();

    const wrap = document.createElement('div');
    wrap.className = 'bymoves';
    const title = document.createElement('h3');
    title.className = 'section-title';
    title.textContent = `手数べつ（${rec.date}）`;
    wrap.appendChild(title);
    wrap.appendChild(this.categoryLegend());

    for (const k of MOVE_COUNTS) {
      const mv = rec.byMoves[k] ?? { attempts: 0, solved: 0, firstTry: 0, hintUsed: 0 };
      const hintUsed = mv.hintUsed;
      const wrongSolved = Math.max(0, mv.solved - mv.firstTry - hintUsed);
      const answerViewed = Math.max(0, mv.attempts - mv.solved);
      const segValues = [mv.firstTry, wrongSolved, hintUsed, answerViewed];

      const row = document.createElement('div');
      row.className = 'bymoves-row';
      const label = document.createElement('span');
      label.className = 'bymoves-label';
      label.textContent = `${k}手`;
      const bar = document.createElement('div');
      bar.className = 'bymoves-bar bymoves-bar-stacked';
      if (mv.attempts > 0) {
        CATEGORY_COLORS.forEach((cat, i) => {
          const value = segValues[i];
          if (value <= 0) return;
          const seg = document.createElement('div');
          seg.className = 'bar-seg';
          seg.style.width = `${(value / mv.attempts) * 100}%`;
          seg.style.background = cat.color;
          const pct = Math.round((value / mv.attempts) * 100);
          seg.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showBarTooltip(seg, `${cat.label}: ${value}問（${pct}%）`);
          });
          bar.appendChild(seg);
        });
      }
      const val = document.createElement('span');
      val.className = 'bymoves-val';
      val.textContent = `${mv.attempts}問`;
      row.appendChild(label);
      row.appendChild(bar);
      row.appendChild(val);
      wrap.appendChild(row);
    }
    return wrap;
  }

  private showBarTooltip(anchor: HTMLElement, text: string): void {
    this.dismissBarTooltip();
    const tip = document.createElement('div');
    tip.className = 'bar-tooltip';
    tip.textContent = text;
    document.body.appendChild(tip);
    const rect = anchor.getBoundingClientRect();
    tip.style.left = `${rect.left + rect.width / 2}px`;
    tip.style.top = `${rect.top}px`;
    this.activeTooltip = tip;
    this.tooltipDismissHandler = () => this.dismissBarTooltip();
    document.addEventListener('click', this.tooltipDismissHandler, { once: true });
    this.tooltipTimer = window.setTimeout(() => this.dismissBarTooltip(), 3000);
  }

  private dismissBarTooltip(): void {
    if (this.activeTooltip) {
      this.activeTooltip.remove();
      this.activeTooltip = null;
    }
    if (this.tooltipDismissHandler) {
      document.removeEventListener('click', this.tooltipDismissHandler);
      this.tooltipDismissHandler = null;
    }
    if (this.tooltipTimer !== null) {
      window.clearTimeout(this.tooltipTimer);
      this.tooltipTimer = null;
    }
  }

  private byMovesSection(days: DayRecord[], titleText: string): HTMLElement {
    const agg: Record<number, number> = {};
    for (const k of MOVE_COUNTS) agg[k] = 0;
    for (const r of days) {
      for (const k of MOVE_COUNTS) agg[k] += r.byMoves[k]?.solved ?? 0;
    }
    const wrap = document.createElement('div');
    wrap.className = 'bymoves';
    const title = document.createElement('h3');
    title.className = 'section-title';
    title.textContent = titleText;
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
