// 将棋エンジンの基本型・定数
//
// 盤は 9x9 = 81 マスを一次元配列 index = row * 9 + col で表す。
//  - row 0 が最上段（段位 1）、row 8 が最下段（段位 9）。
//  - 先手（解答者 / sente）は上方向＝row が小さくなる向きに進む。
//  - 後手（受け方の玉 / gote）は下方向＝row が大きくなる向きに進む。
//  - col 0 が左端（筋 9）、col 8 が右端（筋 1）。

export type Color = 0 | 1;
export const BLACK: Color = 0; // 先手（攻め方・解答者）
export const WHITE: Color = 1; // 後手（受け方・玉側）

// 駒種のインデックス（持ち駒配列のインデックスにも使う / 玉は持ち駒にならない）
export type PieceType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const PAWN: PieceType = 0; // 歩
export const LANCE: PieceType = 1; // 香
export const KNIGHT: PieceType = 2; // 桂
export const SILVER: PieceType = 3; // 銀
export const GOLD: PieceType = 4; // 金
export const BISHOP: PieceType = 5; // 角
export const ROOK: PieceType = 6; // 飛
export const KING: PieceType = 7; // 玉

// 持ち駒として保持しうる駒種（玉以外）
export const HAND_TYPES: PieceType[] = [PAWN, LANCE, KNIGHT, SILVER, GOLD, BISHOP, ROOK];

// 成れる駒種かどうか
export function isPromotable(type: PieceType): boolean {
  return type !== GOLD && type !== KING;
}

export const ROWS = 9;
export const COLS = 9;
export const NSQ = 81;

export function sq(row: number, col: number): number {
  return row * COLS + col;
}
export function rowOf(square: number): number {
  return (square / COLS) | 0;
}
export function colOf(square: number): number {
  return square % COLS;
}
export function onBoard(row: number, col: number): boolean {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

export const otherColor = (c: Color): Color => (c === BLACK ? WHITE : BLACK);

// 先手から見た前方向の row 差分。先手は -1（上）、後手は +1（下）。
export const forward = (c: Color): number => (c === BLACK ? -1 : 1);

// 成りゾーン（敵陣 3 段）。先手は row 0,1,2、後手は row 6,7,8。
export function inPromotionZone(c: Color, square: number): boolean {
  const r = rowOf(square);
  return c === BLACK ? r <= 2 : r >= 6;
}

// 指し手。from が null の場合は持ち駒を打つ手。
export interface Move {
  from: number | null;
  to: number;
  type: PieceType; // 動かす駒 / 打つ駒の種類（成る前の種類）
  promote: boolean; // この手で成るか
}

export function isDrop(m: Move): boolean {
  return m.from === null;
}

export function movesEqual(a: Move, b: Move): boolean {
  return a.from === b.from && a.to === b.to && a.type === b.type && a.promote === b.promote;
}
