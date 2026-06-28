import { describe, it, expect } from 'vitest';
import {
  BLACK,
  WHITE,
  PAWN,
  LANCE,
  KNIGHT,
  SILVER,
  GOLD,
  BISHOP,
  ROOK,
  KING,
  sq,
} from '../src/engine/types.ts';
import { Position, encode, place, serialize, deserialize, isPromoted, pieceType } from '../src/engine/board.ts';
import { isAttacked, isInCheck } from '../src/engine/attacks.ts';
import { generatePseudoMoves, applyMove, generateDefenderMoves } from '../src/engine/moves.ts';

function pos(): Position {
  return new Position(BLACK);
}

describe('利き判定 (isAttacked)', () => {
  it('金は前3方向・横・真後ろを利き、斜め後ろは利かない', () => {
    const p = pos();
    place(p, sq(4, 4), BLACK, GOLD);
    expect(isAttacked(p, sq(3, 4), BLACK)).toBe(true); // 前
    expect(isAttacked(p, sq(3, 3), BLACK)).toBe(true); // 前左
    expect(isAttacked(p, sq(4, 3), BLACK)).toBe(true); // 横
    expect(isAttacked(p, sq(5, 4), BLACK)).toBe(true); // 真後ろ
    expect(isAttacked(p, sq(5, 3), BLACK)).toBe(false); // 斜め後ろは×
  });

  it('桂は2つ前の左右を跳ねて利く', () => {
    const p = pos();
    place(p, sq(4, 4), BLACK, KNIGHT);
    expect(isAttacked(p, sq(2, 3), BLACK)).toBe(true);
    expect(isAttacked(p, sq(2, 5), BLACK)).toBe(true);
    expect(isAttacked(p, sq(2, 4), BLACK)).toBe(false);
    expect(isAttacked(p, sq(3, 4), BLACK)).toBe(false);
  });

  it('後手の歩は下向きに利く', () => {
    const p = pos();
    place(p, sq(4, 4), WHITE, PAWN);
    expect(isAttacked(p, sq(5, 4), WHITE)).toBe(true);
    expect(isAttacked(p, sq(3, 4), WHITE)).toBe(false);
  });

  it('香は前方を走り、間の駒で止まる', () => {
    const p = pos();
    place(p, sq(8, 4), BLACK, LANCE);
    expect(isAttacked(p, sq(0, 4), BLACK)).toBe(true);
    place(p, sq(4, 4), BLACK, PAWN); // 途中に味方
    expect(isAttacked(p, sq(0, 4), BLACK)).toBe(false);
    expect(isAttacked(p, sq(5, 4), BLACK)).toBe(true);
  });

  it('角は斜めを走る', () => {
    const p = pos();
    place(p, sq(4, 4), BLACK, BISHOP);
    expect(isAttacked(p, sq(0, 0), BLACK)).toBe(true);
    expect(isAttacked(p, sq(7, 7), BLACK)).toBe(true);
    expect(isAttacked(p, sq(4, 0), BLACK)).toBe(false);
  });

  it('飛は縦横を走る', () => {
    const p = pos();
    place(p, sq(4, 4), BLACK, ROOK);
    expect(isAttacked(p, sq(0, 4), BLACK)).toBe(true);
    expect(isAttacked(p, sq(4, 0), BLACK)).toBe(true);
    expect(isAttacked(p, sq(0, 0), BLACK)).toBe(false);
  });

  it('馬は斜め走り＋直交1マス、龍は縦横走り＋斜め1マス', () => {
    const p = pos();
    place(p, sq(4, 4), BLACK, BISHOP, true); // 馬
    expect(isAttacked(p, sq(4, 5), BLACK)).toBe(true); // 直交1マス
    expect(isAttacked(p, sq(2, 2), BLACK)).toBe(true); // 斜め走り
    const q = pos();
    place(q, sq(4, 4), BLACK, ROOK, true); // 龍
    expect(isAttacked(q, sq(3, 3), BLACK)).toBe(true); // 斜め1マス
    expect(isAttacked(q, sq(4, 0), BLACK)).toBe(true); // 横走り
  });
});

describe('指し手生成のルール', () => {
  it('二歩: 同じ筋に自分の歩があると歩は打てない', () => {
    const p = pos();
    place(p, sq(4, 4), BLACK, PAWN);
    p.hands[BLACK][PAWN] = 1;
    const moves = generatePseudoMoves(p, BLACK);
    const pawnDropsCol4 = moves.filter((m) => m.from === null && m.type === PAWN && (m.to % 9) === 4);
    expect(pawnDropsCol4.length).toBe(0);
    // 別の筋には打てる
    const pawnDropsCol3 = moves.filter((m) => m.from === null && m.type === PAWN && (m.to % 9) === 3);
    expect(pawnDropsCol3.length).toBeGreaterThan(0);
  });

  it('行きどころのない駒: 最終段の歩は不成で進めず、成る手のみ', () => {
    const p = pos();
    place(p, sq(1, 4), BLACK, PAWN);
    const moves = generatePseudoMoves(p, BLACK).filter((m) => m.from === sq(1, 4));
    expect(moves.length).toBe(1);
    expect(moves[0].to).toBe(sq(0, 4));
    expect(moves[0].promote).toBe(true);
  });

  it('桂は最終2段には打てない', () => {
    const p = pos();
    p.hands[BLACK][KNIGHT] = 1;
    const moves = generatePseudoMoves(p, BLACK).filter((m) => m.from === null && m.type === KNIGHT);
    const badRows = moves.filter((m) => Math.floor(m.to / 9) <= 1);
    expect(badRows.length).toBe(0);
  });

  it('成りゾーンでは成・不成の両方が生成される', () => {
    const p = pos();
    place(p, sq(3, 4), BLACK, SILVER);
    const moves = generatePseudoMoves(p, BLACK).filter((m) => m.from === sq(3, 4) && m.to === sq(2, 4));
    expect(moves.some((m) => m.promote)).toBe(true);
    expect(moves.some((m) => !m.promote)).toBe(true);
  });
});

describe('applyMove', () => {
  it('駒を取ると持ち駒に加わり、成りビットが立ち、手番が変わる', () => {
    const p = pos();
    place(p, sq(3, 4), BLACK, SILVER);
    place(p, sq(2, 4), WHITE, GOLD);
    const move = { from: sq(3, 4), to: sq(2, 4), type: SILVER, promote: true };
    const np = applyMove(p, move);
    expect(np.turn).toBe(WHITE);
    expect(np.hands[BLACK][GOLD]).toBe(1);
    const code = np.board[sq(2, 4)];
    expect(pieceType(code)).toBe(SILVER);
    expect(isPromoted(code)).toBe(true);
    expect(np.board[sq(3, 4)]).toBe(0);
  });
});

describe('王手・受けの合法手', () => {
  it('王手されている玉は逃げ・取り・合駒のみが合法', () => {
    const p = new Position(WHITE);
    place(p, sq(0, 4), WHITE, KING);
    place(p, sq(2, 4), BLACK, ROOK); // 縦に王手
    expect(isInCheck(p, WHITE)).toBe(true);
    const moves = generateDefenderMoves(p);
    // すべての合法手で王手が解消されている
    for (const m of moves) {
      const np = applyMove(p, m);
      expect(isInCheck(np, WHITE)).toBe(false);
    }
    expect(moves.length).toBeGreaterThan(0);
  });
});

describe('シリアライズ', () => {
  it('serialize/deserialize は元の局面を復元する', () => {
    const p = pos();
    place(p, sq(0, 8), WHITE, KING);
    place(p, sq(3, 7), BLACK, KNIGHT);
    p.hands[BLACK][GOLD] = 2;
    p.hands[WHITE][PAWN] = 0;
    const text = serialize(p);
    const q = deserialize(text);
    expect(serialize(q)).toBe(text);
    expect(q.board[sq(0, 8)]).toBe(encode(WHITE, KING, false));
    expect(q.hands[BLACK][GOLD]).toBe(2);
  });
});
