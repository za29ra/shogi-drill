import { describe, it, expect } from 'vitest';
import { mulberry32, generateProblem } from '../src/engine/generator.ts';
import { deserialize } from '../src/engine/board.ts';
import { analyze } from '../src/engine/solver.ts';

describe('問題生成', () => {
  it('1手・3手・5手の問題を生成でき、いずれもちょうどN手詰め・余詰なし', () => {
    const rng = mulberry32(2026);
    for (const n of [1, 3, 5]) {
      const prob = generateProblem(n, rng, { maxAttempts: 12000 });
      expect(prob, `${n}手の生成に失敗`).not.toBeNull();
      expect(prob!.moves).toBe(n);
      const res = analyze(deserialize(prob!.sfen), n);
      expect(res.mate).toBe(true);
      expect(res.unique).toBe(true);
      expect(res.dist).toBe(n);
    }
  });

  it('持ち駒あり・なしの両方が生成されうる', () => {
    const rng = mulberry32(77);
    const seen = new Set<string>();
    let withHand = 0;
    let withoutHand = 0;
    for (let i = 0; i < 30; i++) {
      const prob = generateProblem(3, rng, { maxAttempts: 8000, seen });
      if (!prob) continue;
      if (prob.hasHand) withHand++;
      else withoutHand++;
    }
    expect(withHand).toBeGreaterThan(0);
    expect(withoutHand).toBeGreaterThan(0);
  });

  it('生成問題はすべて重複しない（seen で排除）', () => {
    const rng = mulberry32(555);
    const seen = new Set<string>();
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const prob = generateProblem(1, rng, { maxAttempts: 8000, seen });
      if (!prob) continue;
      expect(ids.has(prob.sfen)).toBe(false);
      ids.add(prob.sfen);
    }
    expect(ids.size).toBeGreaterThan(3);
  });
});
