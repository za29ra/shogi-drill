// 指し手生成（盤上移動＋持ち駒打ち）、指し手の適用、合法手フィルタ。

import {
  BISHOP,
  BLACK,
  Color,
  GOLD,
  HAND_TYPES,
  KING,
  KNIGHT,
  LANCE,
  Move,
  NSQ,
  PAWN,
  PieceType,
  ROOK,
  SILVER,
  WHITE,
  colOf,
  inPromotionZone,
  isDrop,
  onBoard,
  otherColor,
  rowOf,
  sq,
} from './types.ts';
import { EMPTY, Position, baseTypeForHand, encode, isPromoted, pieceColor, pieceType } from './board.ts';
import { isAttacked } from './attacks.ts';

// 駒の利き定義。steps は 1 マス移動（桂は跳ね）、slides は走り。
interface MovePattern {
  steps: number[][];
  slides: number[][];
}

// BLACK（先手, 前進 = row -1）視点の基本定義。WHITE は dr を反転。
const BLACK_GOLD = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, 0],
];
const BLACK_SILVER = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const KING_STEPS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];
const BLACK_KNIGHT = [
  [-2, -1],
  [-2, 1],
];
const BLACK_PAWN = [[-1, 0]];
const LANCE_DIR = [[-1, 0]];
const BISHOP_DIR = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const ROOK_DIR = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function flip(dirs: number[][]): number[][] {
  return dirs.map(([dr, dc]) => [-dr, dc]);
}

// 駒種・色・成り から利きパターンを返す
function pattern(color: Color, type: PieceType, promoted: boolean): MovePattern {
  const flipIf = (d: number[][]) => (color === BLACK ? d : flip(d));
  if (promoted) {
    switch (type) {
      case PAWN:
      case LANCE:
      case KNIGHT:
      case SILVER:
        return { steps: flipIf(BLACK_GOLD), slides: [] };
      case BISHOP: // 馬: 角の走り + 直交 1 マス
        return { steps: ROOK_DIR, slides: BISHOP_DIR };
      case ROOK: // 龍: 飛の走り + 斜め 1 マス
        return { steps: BISHOP_DIR, slides: ROOK_DIR };
    }
  }
  switch (type) {
    case PAWN:
      return { steps: flipIf(BLACK_PAWN), slides: [] };
    case LANCE:
      return { steps: [], slides: flipIf(LANCE_DIR) };
    case KNIGHT:
      return { steps: flipIf(BLACK_KNIGHT), slides: [] };
    case SILVER:
      return { steps: flipIf(BLACK_SILVER), slides: [] };
    case GOLD:
      return { steps: flipIf(BLACK_GOLD), slides: [] };
    case BISHOP:
      return { steps: [], slides: BISHOP_DIR };
    case ROOK:
      return { steps: [], slides: ROOK_DIR };
    case KING:
      return { steps: KING_STEPS, slides: [] };
  }
  return { steps: [], slides: [] };
}

// 行きどころのない駒になる着地か（不成だと二度と動けない）
function deadIfUnpromoted(color: Color, type: PieceType, toRow: number): boolean {
  const last = color === BLACK ? 0 : 8;
  const last2 = color === BLACK ? 1 : 7;
  if (type === PAWN || type === LANCE) return toRow === last;
  if (type === KNIGHT) return toRow === last || toRow === last2;
  return false;
}

// 打てない段か（歩香は最終段、桂は最終2段に打てない）
function cannotDrop(color: Color, type: PieceType, toRow: number): boolean {
  return deadIfUnpromoted(color, type, toRow);
}

// 二歩: 同じ筋(列)に自分の不成歩があるか
function hasOwnPawnInColumn(pos: Position, color: Color, col: number): boolean {
  const target = encode(color, PAWN, false);
  for (let r = 0; r < 9; r++) {
    if (pos.board[sq(r, col)] === target) return true;
  }
  return false;
}

// 盤上移動について、着地マスへの成り/不成の手を push する
function pushBoardMove(
  out: Move[],
  color: Color,
  type: PieceType,
  alreadyPromoted: boolean,
  from: number,
  to: number,
): void {
  const toRow = rowOf(to);
  if (alreadyPromoted) {
    out.push({ from, to, type, promote: false });
    return;
  }
  const canPromote =
    type !== GOLD && type !== KING && (inPromotionZone(color, from) || inPromotionZone(color, to));
  const mustPromote = deadIfUnpromoted(color, type, toRow);
  if (mustPromote) {
    out.push({ from, to, type, promote: true });
    return;
  }
  out.push({ from, to, type, promote: false });
  if (canPromote) out.push({ from, to, type, promote: true });
}

// 指定色の擬似合法手（自玉の安全性は考慮しない）を全列挙
export function generatePseudoMoves(pos: Position, color: Color): Move[] {
  const out: Move[] = [];
  const board = pos.board;

  for (let from = 0; from < NSQ; from++) {
    const code = board[from];
    if (code === EMPTY || pieceColor(code) !== color) continue;
    const type = pieceType(code);
    const promoted = isPromoted(code);
    const { steps, slides } = pattern(color, type, promoted);
    const fr = rowOf(from);
    const fc = colOf(from);

    for (const [dr, dc] of steps) {
      const r = fr + dr;
      const c = fc + dc;
      if (!onBoard(r, c)) continue;
      const to = sq(r, c);
      const dst = board[to];
      if (dst !== EMPTY && pieceColor(dst) === color) continue;
      pushBoardMove(out, color, type, promoted, from, to);
    }
    for (const [dr, dc] of slides) {
      let r = fr + dr;
      let c = fc + dc;
      while (onBoard(r, c)) {
        const to = sq(r, c);
        const dst = board[to];
        if (dst !== EMPTY && pieceColor(dst) === color) break;
        pushBoardMove(out, color, type, promoted, from, to);
        if (dst !== EMPTY) break; // 敵駒を取って止まる
        r += dr;
        c += dc;
      }
    }
  }

  // 持ち駒打ち
  for (const type of HAND_TYPES) {
    if (pos.hands[color][type] <= 0) continue;
    for (let to = 0; to < NSQ; to++) {
      if (board[to] !== EMPTY) continue;
      const toRow = rowOf(to);
      if (cannotDrop(color, type, toRow)) continue;
      if (type === PAWN && hasOwnPawnInColumn(pos, color, colOf(to))) continue; // 二歩
      out.push({ from: null, to, type, promote: false });
    }
  }

  return out;
}

// 指し手を適用した新しい局面を返す（元の局面は変更しない）
export function applyMove(pos: Position, move: Move): Position {
  const np = pos.clone();
  const color = pos.turn;
  if (isDrop(move)) {
    np.board[move.to] = encode(color, move.type, false);
    np.hands[color][move.type] -= 1;
  } else {
    const from = move.from!;
    const movingCode = np.board[from];
    const captured = np.board[move.to];
    if (captured !== EMPTY) {
      np.hands[color][baseTypeForHand(captured)] += 1;
    }
    np.board[from] = EMPTY;
    const nowPromoted = isPromoted(movingCode) || move.promote;
    np.board[move.to] = encode(color, move.type, nowPromoted);
  }
  np.turn = otherColor(color);
  return np;
}

// 指定色の合法手（着手後に自玉が王手されない手）。
// 攻め方(玉を省略している側)は玉が無いので常に合法。
export function generateLegalMoves(pos: Position, color: Color): Move[] {
  const pseudo = generatePseudoMoves(pos, color);
  const legal: Move[] = [];
  for (const m of pseudo) {
    const np = applyMove(pos, m);
    if (!kingInCheck(np, color)) legal.push(m);
  }
  return legal;
}

function kingInCheck(pos: Position, color: Color): boolean {
  const k = pos.kingSquare(color);
  if (k < 0) return false;
  return isAttacked(pos, k, otherColor(color));
}

// 攻め方(BLACK)の「王手になる」合法手のみを列挙
export function generateAttackerChecks(pos: Position): Move[] {
  const pseudo = generatePseudoMoves(pos, BLACK);
  const checks: Move[] = [];
  for (const m of pseudo) {
    const np = applyMove(pos, m);
    const wk = np.kingSquare(WHITE);
    if (wk >= 0 && isAttacked(np, wk, BLACK)) checks.push(m);
  }
  return checks;
}

// 受け方(WHITE)の合法手（王手回避）。
export function generateDefenderMoves(pos: Position): Move[] {
  return generateLegalMoves(pos, WHITE);
}
