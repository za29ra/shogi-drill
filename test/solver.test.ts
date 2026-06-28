import { describe, it, expect } from 'vitest';
import { BLACK, WHITE, PAWN, KNIGHT, GOLD, KING, sq } from '../src/engine/types.ts';
import { Position, place } from '../src/engine/board.ts';
import {
  analyze,
  solveAttack,
  solutionMove,
  moveAchievesMate,
  principalLine,
  bestDefenderMove,
} from '../src/engine/solver.ts';
import { applyMove, generateDefenderMoves, generateAttackerChecks } from '../src/engine/moves.ts';

describe('1手詰めソルバー', () => {
  it('金打ちの1手詰めを正しく解く（唯一解）', () => {
    const p = new Position(BLACK);
    place(p, sq(0, 8), WHITE, KING); // 隅の玉
    place(p, sq(3, 7), BLACK, KNIGHT); // (1,8) を支える桂
    p.hands[BLACK][GOLD] = 1;

    const res = analyze(p, 1);
    expect(res.mate).toBe(true);
    expect(res.unique).toBe(true);
    expect(res.dist).toBe(1);

    const m = solutionMove(p, 1);
    expect(m).not.toBeNull();
    expect(m!.from).toBeNull(); // 打つ手
    expect(m!.type).toBe(GOLD);
    expect(m!.to).toBe(sq(1, 8));

    // 解の手は moveAchievesMate で真、王手だが詰まない手は偽
    expect(moveAchievesMate(p, m!, 1)).toBe(true);
  });
});

describe('打ち歩詰めの禁止', () => {
  it('歩を打つしか詰みがない局面は「詰みなし」と判定する', () => {
    const p = new Position(BLACK);
    place(p, sq(0, 8), WHITE, KING);
    place(p, sq(0, 6), BLACK, GOLD); // (0,7) を抑える
    place(p, sq(3, 6), BLACK, KNIGHT); // (1,7) を抑える
    place(p, sq(3, 7), BLACK, KNIGHT); // (1,8) を抑える（玉が歩を取れない）
    p.hands[BLACK][PAWN] = 1;

    // 歩を (1,8) に打てば形上は詰みだが打ち歩詰めで反則 → 詰みなし
    expect(solveAttack(p, 1)).toBe(Infinity);
    expect(analyze(p, 1).mate).toBe(false);
  });
});

describe('生成局面に対する整合性', () => {
  it('生成した3手詰めは主手順どおり進めると最後に受け方が詰む', async () => {
    const { mulberry32, generateProblem } = await import('../src/engine/generator.ts');
    const { deserialize } = await import('../src/engine/board.ts');
    const rng = mulberry32(12345);
    const prob = generateProblem(3, rng, { maxAttempts: 8000 });
    expect(prob).not.toBeNull();
    const pos = deserialize(prob!.sfen);

    const res = analyze(pos, 3);
    expect(res.mate).toBe(true);
    expect(res.unique).toBe(true);

    const line = principalLine(pos, 3);
    expect(line.length).toBe(3);

    // 主手順を最後まで適用すると受け方に合法手が無い（詰み）
    let cur = pos.clone();
    for (const mv of line) cur = applyMove(cur, mv);
    expect(cur.turn).toBe(WHITE);
    expect(generateDefenderMoves(cur).length).toBe(0);
  });

  it('生成した7手詰め（種データ）はちょうど7手・余詰なしで、主手順で詰む', async () => {
    const { deserialize } = await import('../src/engine/board.ts');
    // scripts/genSeed.ts が生成・検証済みの 7手詰め局面（固定SFEN・高速＆決定的）
    const sfen =
      '000000000000000018000000000000000215000000000000040515000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000 b 00:1,01:1';
    const pos = deserialize(sfen);

    const res = analyze(pos, 7);
    expect(res.mate).toBe(true);
    expect(res.unique).toBe(true);
    expect(res.dist).toBe(7);

    const line = principalLine(pos, 7);
    expect(line.length).toBe(7);
    let cur = pos.clone();
    for (const mv of line) cur = applyMove(cur, mv);
    expect(cur.turn).toBe(WHITE);
    expect(generateDefenderMoves(cur).length).toBe(0);
  });

  it('攻め方の手番では「詰みに繋がる手」が唯一である', async () => {
    const { mulberry32, generateProblem } = await import('../src/engine/generator.ts');
    const { deserialize } = await import('../src/engine/board.ts');
    const rng = mulberry32(999);
    const prob = generateProblem(3, rng, { maxAttempts: 8000 });
    const pos = deserialize(prob!.sfen);

    const checks = generateAttackerChecks(pos);
    const winning = checks.filter((m) => moveAchievesMate(pos, m, 3));
    expect(winning.length).toBe(1);

    // 受け方の最善応手を指した先でも、再び唯一の正解手がある
    const atk = winning[0];
    const afterAtk = applyMove(pos, atk);
    const def = bestDefenderMove(afterAtk, 2);
    expect(def).not.toBeNull();
    const afterDef = applyMove(afterAtk, def!);
    const checks2 = generateAttackerChecks(afterDef);
    const winning2 = checks2.filter((m) => moveAchievesMate(afterDef, m, 1));
    expect(winning2.length).toBe(1);
  });
});
