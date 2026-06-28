// 表示用の表記（筋段・駒文字・棋譜文字列）。

import { BLACK, Color, Move, PieceType, colOf, isDrop, rowOf } from './types.ts';
import { Position, isPromoted, pieceType } from './board.ts';

// col 0 = 筋9（左端）, col 8 = 筋1（右端）
export function fileOf(square: number): number {
  return 9 - colOf(square);
}
export function rankOf(square: number): number {
  return rowOf(square) + 1;
}

const ZEN = ['０', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
const KAN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export function squareText(square: number): string {
  return `${ZEN[fileOf(square)]}${KAN[rankOf(square)]}`;
}

// 駒の表示文字（成り・不成を区別）
const BASE_KANJI = ['歩', '香', '桂', '銀', '金', '角', '飛', '玉'];
const PROMOTED_KANJI: Record<number, string> = {
  0: 'と', // 歩→と
  1: '杏', // 香成
  2: '圭', // 桂成
  3: '全', // 銀成
  5: '馬', // 角→馬
  6: '龍', // 飛→龍
};

export function pieceKanji(type: PieceType, promoted: boolean): string {
  if (promoted && PROMOTED_KANJI[type] !== undefined) return PROMOTED_KANJI[type];
  return BASE_KANJI[type];
}

export function pieceKanjiFromCode(code: number): string {
  return pieceKanji(pieceType(code), isPromoted(code));
}

// 棋譜文字列（例: ▲５二金, ▲２四歩成, ▲５二金打）
export function moveToText(pos: Position, move: Move): string {
  const mark = pos.turn === BLACK ? '▲' : '△';
  const dest = squareText(move.to);
  const base = pieceKanji(move.type, false);
  if (isDrop(move)) {
    return `${mark}${dest}${base}打`;
  }
  const suffix = move.promote ? '成' : '';
  return `${mark}${dest}${base}${suffix}`;
}

export function colorName(c: Color): string {
  return c === BLACK ? '先手' : '後手';
}
