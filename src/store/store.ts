// localStorage による設定・成績の保存。サーバ不要・端末内のみ。

// 出題しうる手数の一覧（UI・問題供給・設定の検証で共有する単一の真実）。
// 7手はブラウザ動的生成の現実的な上限（種データを厚めに用意して体感を担保）。
export const MOVE_COUNTS = [1, 3, 5, 7] as const;

export interface Settings {
  moveCounts: number[]; // 出題する手数（1/3/5/7 の組み合わせ）
  dailyGoal: number; // 1日に解く問題数
  sound: boolean; // 効果音
  showGuide: boolean; // 駒の移動ガイド表示
}

// 1日の成績。byMoves は手数別の正解数。
export interface DayRecord {
  date: string; // 'YYYY-MM-DD'
  solved: number; // 解けた問題数
  attempts: number; // 出題数
  firstTry: number; // 一発正解数（ノーミス・ヒントなし）
  hintUsed?: number; // 解けた問題のうちヒントを使用した数
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
  s.moveCounts = s.moveCounts.filter((n) => (MOVE_COUNTS as readonly number[]).includes(n));
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

export function getDayRecord(date: string): DayRecord {
  const rec = getHistory().find((r) => r.date === date);
  return rec ?? { date, solved: 0, attempts: 0, firstTry: 0, hintUsed: 0, byMoves: {} };
}

export function getTodayRecord(): DayRecord {
  return getDayRecord(todayStr());
}

// 1問の結果を記録する。
export function recordResult(
  moves: number,
  solved: boolean,
  firstTry: boolean,
  hintUsed: boolean,
): DayRecord {
  const history = getHistory();
  const t = todayStr();
  let rec = history.find((r) => r.date === t);
  if (!rec) {
    rec = { date: t, solved: 0, attempts: 0, firstTry: 0, hintUsed: 0, byMoves: {} };
    history.push(rec);
  }
  rec.attempts += 1;
  if (solved) {
    rec.solved += 1;
    rec.byMoves[moves] = (rec.byMoves[moves] ?? 0) + 1;
    if (firstTry) rec.firstTry += 1;
    if (hintUsed) rec.hintUsed = (rec.hintUsed ?? 0) + 1;
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
    out.push(map.get(ds) ?? { date: ds, solved: 0, attempts: 0, firstTry: 0, hintUsed: 0, byMoves: {} });
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

// ===== バックアップ / 復元（iCloud Drive 等へのファイル書き出し・読み込み用） =====

export interface BackupPayload {
  app: 'shogi-drill';
  version: 1;
  exportedAt: string; // ISO 文字列
  settings: Settings;
  history: DayRecord[];
}

// バックアップ用のデータを作る
export function exportBackup(): BackupPayload {
  return {
    app: 'shogi-drill',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    history: getHistory(),
  };
}

// 2つの履歴を日付単位でマージする（純粋関数・テスト用に公開）。
// 同じ日付が両方にある場合は「解いた数が多い方（同数なら出題数が多い方）」を採用する。
// これにより、同じ端末で復元しても二重計上されず、別端末のデータも失わない。
export function mergeHistory(current: DayRecord[], incoming: DayRecord[]): DayRecord[] {
  const byDate = new Map<string, DayRecord>();
  for (const r of current) byDate.set(r.date, r);
  for (const r of incoming) {
    const cur = byDate.get(r.date);
    if (!cur || r.solved > cur.solved || (r.solved === cur.solved && r.attempts > cur.attempts)) {
      byDate.set(r.date, r);
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// バックアップ JSON の妥当性を検証して正規化する（不正なら例外）。
export function parseBackup(raw: unknown): BackupPayload {
  if (!raw || typeof raw !== 'object') throw new Error('invalid backup');
  const obj = raw as Record<string, unknown>;
  if (obj.app !== 'shogi-drill') throw new Error('not a shogi-drill backup');
  const history = Array.isArray(obj.history) ? (obj.history as DayRecord[]) : [];
  // 各レコードの最低限の形をチェック
  const cleanHistory: DayRecord[] = [];
  for (const r of history) {
    if (r && typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
      cleanHistory.push({
        date: r.date,
        solved: Number(r.solved) || 0,
        attempts: Number(r.attempts) || 0,
        firstTry: Number(r.firstTry) || 0,
        hintUsed: Number(r.hintUsed) || 0,
        byMoves: r.byMoves && typeof r.byMoves === 'object' ? r.byMoves : {},
      });
    }
  }
  const settings = (obj.settings && typeof obj.settings === 'object'
    ? (obj.settings as Settings)
    : DEFAULT_SETTINGS) as Settings;
  return {
    app: 'shogi-drill',
    version: 1,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    settings,
    history: cleanHistory,
  };
}

// バックアップを復元する（履歴はマージ、設定は取り込む）。反映した日数を返す。
export function importBackup(raw: unknown): { days: number; total: number } {
  const payload = parseBackup(raw);
  const merged = mergeHistory(getHistory(), payload.history);
  saveHistory(merged);
  // 取り込んだ設定で上書き（保存時に getSettings 側で妥当性を正規化）
  saveSettings({ ...DEFAULT_SETTINGS, ...payload.settings });
  return { days: payload.history.length, total: merged.length };
}
