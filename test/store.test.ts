import { describe, it, expect, beforeEach } from 'vitest';

// store.ts は素の localStorage を直接参照するため、Node 環境用に簡易スタブを用意する。
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  clear(): void {
    this.data.clear();
  }
}
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();

import { getDayRecord, getTodayRecord, recordResult, todayStr } from '../src/store/store.ts';

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage.clear();
});

describe('recordResult', () => {
  it('答えを見た場合は不正解として1回だけ加算する', () => {
    recordResult(3, false, false, false);
    const rec = getTodayRecord();
    expect(rec.attempts).toBe(1);
    expect(rec.solved).toBe(0);
  });

  it('ヒントを使って解いた場合、hintUsed を加算し firstTry には数えない', () => {
    recordResult(3, true, false, true);
    const rec = getTodayRecord();
    expect(rec.solved).toBe(1);
    expect(rec.hintUsed).toBe(1);
    expect(rec.firstTry).toBe(0);
  });

  it('ノーミス・ヒントなしで解いた場合は firstTry に加算する', () => {
    recordResult(1, true, true, false);
    const rec = getTodayRecord();
    expect(rec.solved).toBe(1);
    expect(rec.firstTry).toBe(1);
    expect(rec.hintUsed ?? 0).toBe(0);
  });

  it('同日に複数回呼ぶと集計が積み上がる', () => {
    recordResult(1, true, true, false); // 一発正解
    recordResult(3, true, false, true); // ヒント使用
    recordResult(5, false, false, false); // 答えを見た
    const rec = getTodayRecord();
    expect(rec.attempts).toBe(3);
    expect(rec.solved).toBe(2);
    expect(rec.firstTry).toBe(1);
    expect(rec.hintUsed).toBe(1);
    expect(rec.byMoves[1]).toBe(1);
    expect(rec.byMoves[3]).toBe(1);
  });
});

describe('getDayRecord', () => {
  it('記録の無い日付はゼロ値のレコードを返す', () => {
    const rec = getDayRecord('2000-01-01');
    expect(rec).toEqual({
      date: '2000-01-01',
      solved: 0,
      attempts: 0,
      firstTry: 0,
      hintUsed: 0,
      byMoves: {},
    });
  });

  it('記録のある日付は実際のデータを返す', () => {
    recordResult(1, true, true, false);
    const rec = getDayRecord(todayStr());
    expect(rec.solved).toBe(1);
  });
});
