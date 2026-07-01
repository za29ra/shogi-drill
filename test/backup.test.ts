import { describe, it, expect } from 'vitest';
import { mergeHistory, parseBackup, type DayRecord } from '../src/store/store.ts';

function rec(date: string, solved: number, attempts: number): DayRecord {
  return { date, solved, attempts, firstTry: solved, byMoves: { 1: solved } };
}

describe('mergeHistory', () => {
  it('重複しない日付は両方残る（日付順）', () => {
    const a = [rec('2026-06-01', 2, 3)];
    const b = [rec('2026-06-03', 1, 1)];
    const m = mergeHistory(a, b);
    expect(m.map((r) => r.date)).toEqual(['2026-06-01', '2026-06-03']);
  });

  it('同じ日付は「解いた数が多い方」を採用（二重計上しない）', () => {
    const a = [rec('2026-06-01', 5, 6)];
    const b = [rec('2026-06-01', 3, 4)];
    const m = mergeHistory(a, b);
    expect(m).toHaveLength(1);
    expect(m[0].solved).toBe(5);
  });

  it('解いた数が同じなら出題数が多い方を採用', () => {
    const a = [rec('2026-06-01', 3, 4)];
    const b = [rec('2026-06-01', 3, 9)];
    const m = mergeHistory(a, b);
    expect(m[0].attempts).toBe(9);
  });
});

describe('parseBackup with hintUsed', () => {
  it('hintUsed を含むレコードを正しく取り込む', () => {
    const out = parseBackup({
      app: 'shogi-drill',
      history: [{ date: '2026-06-01', solved: 3, attempts: 4, firstTry: 1, hintUsed: 2, byMoves: { 1: 3 } }],
    });
    expect(out.history[0].hintUsed).toBe(2);
  });

  it('hintUsed が欠けている旧形式のレコードは 0 として扱う', () => {
    const out = parseBackup({ app: 'shogi-drill', history: [rec('2026-06-01', 2, 3)] });
    expect(out.history[0].hintUsed).toBe(0);
  });
});

describe('parseBackup', () => {
  it('正しいバックアップを正規化して返す', () => {
    const payload = {
      app: 'shogi-drill',
      version: 1,
      exportedAt: '2026-06-28T00:00:00.000Z',
      settings: { moveCounts: [1, 3, 5], dailyGoal: 7, sound: false, showGuide: true },
      history: [rec('2026-06-01', 2, 3)],
    };
    const out = parseBackup(payload);
    expect(out.app).toBe('shogi-drill');
    expect(out.history).toHaveLength(1);
    expect(out.settings.dailyGoal).toBe(7);
  });

  it('不正なファイルは例外を投げる', () => {
    expect(() => parseBackup({ foo: 'bar' })).toThrow();
    expect(() => parseBackup(null)).toThrow();
    expect(() => parseBackup('not json object')).toThrow();
  });

  it('壊れた履歴レコードは除外される', () => {
    const out = parseBackup({
      app: 'shogi-drill',
      history: [rec('2026-06-01', 2, 3), { date: 'bad' }, { nope: true }],
    });
    expect(out.history).toHaveLength(1);
  });
});
