// 出題する問題の供給源。
//  - 同梱の種データ(SEED_PROBLEMS)で即座に出題開始（オフラインでも常に問題がある）。
//  - 裏で Worker が新しい問題を自動生成し続け、用意でき次第そちらを優先して出題。

import type { GeneratedProblem } from '../engine/generator.ts';
import { SEED_PROBLEMS, type SeedProblem } from '../data/seedProblems.ts';

const BUFFER_TARGET = 4; // 各手数ごとに確保したい新規問題数

export class ProblemSource {
  private fresh = new Map<number, GeneratedProblem[]>(); // 生成済みの新鮮な問題
  private seedPools = new Map<number, SeedProblem[]>(); // 種データ（無限フォールバック）
  private seen = new Set<string>();
  private worker: Worker | null = null;
  private pending = new Map<number, number>(); // id -> n
  private reqId = 0;
  private moveCounts: number[] = [1, 3];

  constructor() {
    for (const n of [1, 3, 5]) {
      this.fresh.set(n, []);
      this.seedPools.set(n, []);
    }
    for (const p of SEED_PROBLEMS) {
      this.seedPools.get(p.moves)?.push(p);
      this.seen.add(p.sfen);
    }
    this.startWorker();
  }

  private startWorker(): void {
    try {
      this.worker = new Worker(new URL('../worker/genWorker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (e: MessageEvent<{ id: number; prob: GeneratedProblem | null }>) => {
        const { id, prob } = e.data;
        this.pending.delete(id);
        if (prob && !this.seen.has(prob.sfen)) {
          this.seen.add(prob.sfen);
          this.fresh.get(prob.moves)?.push(prob);
        }
        this.refill();
      };
    } catch {
      // Worker 非対応環境では種データのみで動作
      this.worker = null;
    }
  }

  setMoveCounts(mcs: number[]): void {
    this.moveCounts = mcs.length ? mcs : [1];
    this.refill();
  }

  private pendingFor(n: number): number {
    let c = 0;
    for (const v of this.pending.values()) if (v === n) c++;
    return c;
  }

  private refill(): void {
    if (!this.worker) return;
    for (const n of this.moveCounts) {
      const have = (this.fresh.get(n)?.length ?? 0) + this.pendingFor(n);
      for (let i = have; i < BUFFER_TARGET; i++) {
        const id = ++this.reqId;
        this.pending.set(id, n);
        this.worker.postMessage({ id, n });
      }
    }
  }

  // 出題する手数を選ぶ（設定された手数からランダム）
  private pickMoves(): number {
    const cands = this.moveCounts.filter((n) => [1, 3, 5].includes(n));
    return cands[Math.floor(Math.random() * cands.length)] ?? 1;
  }

  // 次の問題を返す（常に何か返る）。
  next(): GeneratedProblem {
    const n = this.pickMoves();
    const fresh = this.fresh.get(n);
    if (fresh && fresh.length > 0) {
      const prob = fresh.shift()!;
      this.refill();
      return prob;
    }
    // フォールバック: 種データからランダムに（無ければ他手数で代替）
    this.refill();
    return this.fromSeed(n) ?? this.fromAnySeed() ?? this.emergency();
  }

  private fromSeed(n: number): GeneratedProblem | null {
    const pool = this.seedPools.get(n);
    if (!pool || pool.length === 0) return null;
    const s = pool[Math.floor(Math.random() * pool.length)];
    return { id: `seed-${n}-${Math.random().toString(36).slice(2)}`, ...s };
  }

  private fromAnySeed(): GeneratedProblem | null {
    if (SEED_PROBLEMS.length === 0) return null;
    const s = SEED_PROBLEMS[Math.floor(Math.random() * SEED_PROBLEMS.length)];
    return { id: `seed-any-${Math.random().toString(36).slice(2)}`, ...s };
  }

  private emergency(): GeneratedProblem {
    // 種データが空でも落ちないための最終手段（理論上ここには来ない）
    return { id: 'empty', sfen: '', moves: 1, hasHand: false };
  }
}
