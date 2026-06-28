// localStorage による設定・成績の保存。サーバ不要・端末内のみ。

export interface Settings {
  moveCounts: number[]; // 出題する手数（1/3/5 の組み合わせ）
  dailyGoal: number; // 1日に解く問題数
  sound: boolean; // 効果音
  showGuide: boolean; // 駒の移動ガイド表示
}

// 1日の成績。byMoves は手数別の正解数。
export interface DayRecord {
  date: string; // 'YYYY-MM-DD'
  solved: number; // 解けた問題数
  attempts: number; // 出題数
  firstTry: number; // 一発正解数
  byMoves: Record<number, number>; // 手数別 解けた数
}

const SETTINGS_KEY = 'shogi-drill:settings:v1';
const HISTORY_KEY = 'shogi-drill:history:v1';
const KEEP_DAYS = 180; // 半年分保持（要件は1ヶ月以上）

export const DEFAULT_SETTINGS: Settings = {
  moveCounts: [1, 3],
  dailyGoal: 5,
  sound: true,
  showGuide: true,
};

export function todayStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

export function getSettings(): Settings {
  const s = readJSON<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS);
  // 妥当性の最低限の補正
  if (!Array.isArray(s.moveCounts) || s.moveCounts.length === 0) s.moveCounts = [1, 3];
  s.moveCounts = s.moveCounts.filter((n) => [1, 3, 5].includes(n));
  if (s.moveCounts.length === 0) s.moveCounts = [1];
  s.dailyGoal = Math.min(50, Math.max(1, Math.floor(s.dailyGoal) || 5));
  return s;
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function getHistory(): DayRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as DayRecord[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveHistory(history: DayRecord[]): void {
  // 古い記録を間引く
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const cutoffStr = todayStr(cutoff);
  const trimmed = history.filter((r) => r.date >= cutoffStr);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
}

export function getTodayRecord(): DayRecord {
  const t = todayStr();
  const rec = getHistory().find((r) => r.date === t);
  return rec ?? { date: t, solved: 0, attempts: 0, firstTry: 0, byMoves: {} };
}

// 1問の結果を記録する。
export function recordResult(moves: number, solved: boolean, firstTry: boolean): DayRecord {
  const history = getHistory();
  const t = todayStr();
  let rec = history.find((r) => r.date === t);
  if (!rec) {
    rec = { date: t, solved: 0, attempts: 0, firstTry: 0, byMoves: {} };
    history.push(rec);
  }
  rec.attempts += 1;
  if (solved) {
    rec.solved += 1;
    rec.byMoves[moves] = (rec.byMoves[moves] ?? 0) + 1;
    if (firstTry) rec.firstTry += 1;
  }
  saveHistory(history);
  return rec;
}

// 連続日数（今日または昨日を起点に、解いた日が連続している数）。
export function getStreak(): number {
  const solvedDates = new Set(getHistory().filter((r) => r.solved > 0).map((r) => r.date));
  let streak = 0;
  const d = new Date();
  // 今日まだ解いていなければ昨日を起点にする
  if (!solvedDates.has(todayStr(d))) d.setDate(d.getDate() - 1);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (solvedDates.has(todayStr(d))) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// 直近 days 日分の記録（古い順）。欠けている日は 0 埋めして返す。
export function getRecentDays(days: number): DayRecord[] {
  const map = new Map(getHistory().map((r) => [r.date, r]));
  const out: DayRecord[] = [];
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const ds = todayStr(d);
    out.push(map.get(ds) ?? { date: ds, solved: 0, attempts: 0, firstTry: 0, byMoves: {} });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function totals(): { solved: number; attempts: number; days: number } {
  const h = getHistory();
  return {
    solved: h.reduce((a, r) => a + r.solved, 0),
    attempts: h.reduce((a, r) => a + r.attempts, 0),
    days: h.filter((r) => r.solved > 0).length,
  };
}
