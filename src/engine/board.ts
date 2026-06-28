// 盤面・持ち駒の表現と、駒コードのエンコード/デコード。
//
// 駒コード（Int8）: 0 = 空。それ以外は
//   code = 1 + typeIndex + (promoted ? 8 : 0) + (color ? 16 : 0)
// で 1..32 に収める。Int8Array にそのまま格納できるので clone がただのコピーで済み高速。

import {
  BLACK,
  Color,
  HAND_TYPES,
  KING,
  NSQ,
  PieceType,
  WHITE,
  isPromotable,
} from './types.ts';

export const EMPTY = 0;

export function encode(color: Color, type: PieceType, promoted: boolean): number {
  return 1 + type + (promoted ? 8 : 0) + (color ? 16 : 0);
}

export function pieceColor(code: number): Color {
  return ((code - 1) >= 16 ? WHITE : BLACK) as Color;
}
export function pieceType(code: number): PieceType {
  return (((code - 1) % 16) % 8) as PieceType;
}
export function isPromoted(code: number): boolean {
  return ((code - 1) % 16) >= 8;
}

// 駒を取ったときに持ち駒へ加える種類（成りは戻し、種類のみ）
export function baseTypeForHand(code: number): PieceType {
  return pieceType(code);
}

export class Position {
  board: Int8Array; // 81 マス
  // 持ち駒の枚数。hands[color][typeIndex]（typeIndex は HAND_TYPES の駒種、玉は無し）
  hands: [Int8Array, Int8Array];
  turn: Color;

  constructor(turn: Color = BLACK) {
    this.board = new Int8Array(NSQ);
    this.hands = [new Int8Array(7), new Int8Array(7)];
    this.turn = turn;
  }

  clone(): Position {
    const p = new Position(this.turn);
    p.board.set(this.board);
    p.hands[0].set(this.hands[0]);
    p.hands[1].set(this.hands[1]);
    return p;
  }

  get(square: number): number {
    return this.board[square];
  }
  set(square: number, code: number): void {
    this.board[square] = code;
  }

  hand(color: Color, type: PieceType): number {
    return this.hands[color][type];
  }
  addHand(color: Color, type: PieceType, n = 1): void {
    this.hands[color][type] += n;
  }
  removeHand(color: Color, type: PieceType, n = 1): void {
    this.hands[color][type] -= n;
  }
  hasAnyHand(color: Color): boolean {
    const h = this.hands[color];
    for (let i = 0; i < 7; i++) if (h[i] > 0) return true;
    return false;
  }

  // 指定色の玉のマスを返す（無ければ -1）
  kingSquare(color: Color): number {
    const target = encode(color, KING, false);
    for (let i = 0; i < NSQ; i++) if (this.board[i] === target) return i;
    return -1;
  }

  // 局面の一意キー（盤＋持ち駒＋手番）。トランスポジション表や重複検出に使用。
  hash(): string {
    // 盤を base36 的にまとめる
    let s = '';
    for (let i = 0; i < NSQ; i++) s += this.board[i].toString(36) + ',';
    s += '|';
    for (let c = 0 as Color; c <= 1; c = (c + 1) as Color) {
      for (const t of HAND_TYPES) s += this.hands[c][t] + ',';
    }
    s += '|' + this.turn;
    return s;
  }
}

// SFEN 風の簡易シリアライズ（問題データの保存・テスト用）。
// 形式: "<board rows separated by /> <turn b|w> <hands>"
// 盤の各マスは駒コードを 16進2桁、空は "00"。持ち駒は "色種:枚数" をカンマ区切り。
export function serialize(pos: Position): string {
  let board = '';
  for (let i = 0; i < NSQ; i++) {
    board += pos.board[i].toString(16).padStart(2, '0');
  }
  const turn = pos.turn === BLACK ? 'b' : 'w';
  const handParts: string[] = [];
  for (let c = 0 as Color; c <= 1; c = (c + 1) as Color) {
    for (const t of HAND_TYPES) {
      const n = pos.hands[c][t];
      if (n > 0) handParts.push(`${c}${t}:${n}`);
    }
  }
  return `${board} ${turn} ${handParts.join(',') || '-'}`;
}

export function deserialize(text: string): Position {
  const [board, turn, hands] = text.trim().split(' ');
  const pos = new Position(turn === 'b' ? BLACK : WHITE);
  for (let i = 0; i < NSQ; i++) {
    pos.board[i] = parseInt(board.slice(i * 2, i * 2 + 2), 16);
  }
  if (hands && hands !== '-') {
    for (const part of hands.split(',')) {
      const [ct, n] = part.split(':');
      const c = Number(ct[0]) as Color;
      const t = Number(ct[1]) as PieceType;
      pos.hands[c][t] = Number(n);
    }
  }
  return pos;
}

// 便利関数: 盤に駒を置く（テスト・生成用）
export function place(pos: Position, square: number, color: Color, type: PieceType, promoted = false): void {
  if (promoted && !isPromotable(type)) promoted = false;
  pos.board[square] = encode(color, type, promoted);
}
