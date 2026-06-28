// 利き判定（あるマスが指定色に攻撃されているか）と王手判定。
//
// 「対象マスから逆向きに探索する」方式。各駒種について、対象マスを攻撃しうる
// 位置にその駒があるかを調べる。盤が小さい(81)ので十分高速。

import {
  Color,
  BISHOP,
  GOLD,
  KING,
  KNIGHT,
  LANCE,
  PAWN,
  ROOK,
  SILVER,
  colOf,
  forward,
  onBoard,
  otherColor,
  rowOf,
  sq,
} from './types.ts';
import { Position, isPromoted, pieceColor, pieceType } from './board.ts';

// (r,c) の駒コードを返す。盤外は -1。空は 0。
function at(pos: Position, r: number, c: number): number {
  return onBoard(r, c) ? pos.board[sq(r, c)] : -1;
}

function isPiece(code: number, color: Color, type: number, promoted: boolean): boolean {
  return code > 0 && pieceColor(code) === color && pieceType(code) === type && isPromoted(code) === promoted;
}

// 金の動きをする駒か（金、または成った歩・香・桂・銀）
function movesAsGold(code: number, color: Color): boolean {
  if (code <= 0 || pieceColor(code) !== color) return false;
  const t = pieceType(code);
  if (t === GOLD && !isPromoted(code)) return true;
  if (isPromoted(code) && (t === PAWN || t === LANCE || t === KNIGHT || t === SILVER)) return true;
  return false;
}

const DIAG = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const ORTHO = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

// target が byColor の駒に攻撃されているか
export function isAttacked(pos: Position, target: number, byColor: Color): boolean {
  const tr = rowOf(target);
  const tc = colOf(target);
  const f = forward(byColor); // 前進方向の row 差分

  // 歩: (tr - f, tc) に byColor の不成歩
  if (isPiece(at(pos, tr - f, tc), byColor, PAWN, false)) return true;

  // 桂: (tr - 2f, tc ± 1)
  if (isPiece(at(pos, tr - 2 * f, tc - 1), byColor, KNIGHT, false)) return true;
  if (isPiece(at(pos, tr - 2 * f, tc + 1), byColor, KNIGHT, false)) return true;

  // 銀: S = target - step。step ∈ {(f,-1),(f,0),(f,1),(-f,-1),(-f,1)}
  const silverFrom = [
    [tr - f, tc + 1],
    [tr - f, tc],
    [tr - f, tc - 1],
    [tr + f, tc + 1],
    [tr + f, tc - 1],
  ];
  for (const [r, c] of silverFrom) {
    if (isPiece(at(pos, r, c), byColor, SILVER, false)) return true;
  }

  // 金（および成歩香桂銀）: step ∈ {(f,-1),(f,0),(f,1),(0,-1),(0,1),(-f,0)}
  const goldFrom = [
    [tr - f, tc + 1],
    [tr - f, tc],
    [tr - f, tc - 1],
    [tr, tc + 1],
    [tr, tc - 1],
    [tr + f, tc],
  ];
  for (const [r, c] of goldFrom) {
    if (movesAsGold(at(pos, r, c), byColor)) return true;
  }

  // 玉: 8 近傍
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      if (isPiece(at(pos, tr + dr, tc + dc), byColor, KING, false)) return true;
    }
  }

  // 香: target から後方(-f)へ走査し、最初の駒が byColor の不成香なら攻撃
  {
    let r = tr - f; // -f 方向の最初 (= 香がいる側)
    const c = tc;
    while (onBoard(r, c)) {
      const code = pos.board[sq(r, c)];
      if (code !== 0) {
        if (isPiece(code, byColor, LANCE, false)) return true;
        break;
      }
      r -= f;
    }
  }

  // 角・馬: 4 斜め方向に走査、最初の駒が byColor の角/馬なら攻撃
  for (const [dr, dc] of DIAG) {
    let r = tr + dr;
    let c = tc + dc;
    while (onBoard(r, c)) {
      const code = pos.board[sq(r, c)];
      if (code !== 0) {
        if (code > 0 && pieceColor(code) === byColor && pieceType(code) === BISHOP) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  // 飛・龍: 4 直交方向に走査、最初の駒が byColor の飛/龍なら攻撃
  for (const [dr, dc] of ORTHO) {
    let r = tr + dr;
    let c = tc + dc;
    while (onBoard(r, c)) {
      const code = pos.board[sq(r, c)];
      if (code !== 0) {
        if (code > 0 && pieceColor(code) === byColor && pieceType(code) === ROOK) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  // 馬の直交 1 マス利き: target の直交 4 近傍に byColor の馬
  for (const [dr, dc] of ORTHO) {
    const code = at(pos, tr + dr, tc + dc);
    if (code > 0 && pieceColor(code) === byColor && pieceType(code) === BISHOP && isPromoted(code)) return true;
  }
  // 龍の斜め 1 マス利き: target の斜め 4 近傍に byColor の龍
  for (const [dr, dc] of DIAG) {
    const code = at(pos, tr + dr, tc + dc);
    if (code > 0 && pieceColor(code) === byColor && pieceType(code) === ROOK && isPromoted(code)) return true;
  }

  return false;
}

// 指定色の玉が王手されているか（玉が盤上に無ければ false）
export function isInCheck(pos: Position, color: Color): boolean {
  const k = pos.kingSquare(color);
  if (k < 0) return false;
  return isAttacked(pos, k, otherColor(color));
}
