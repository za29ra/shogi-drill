// 詰将棋の自動生成。
//  - 玉と攻め方の駒をランダムに構築し、ソルバーで「ちょうど N 手詰め・余詰なし」を検証。
//  - 持ち駒あり/なしの両方を生成しうる（wantHand で制御）。
//  - 受け方の持ち駒は常に空（無駄合い回避）。

import {
  BISHOP,
  BLACK,
  Color,
  GOLD,
  KING,
  KNIGHT,
  LANCE,
  PAWN,
  PieceType,
  ROOK,
  SILVER,
  WHITE,
  colOf,
  onBoard,
  rowOf,
  sq,
} from './types.ts';
import { Position, encode, serialize } from './board.ts';
import { isInCheck } from './attacks.ts';
import { analyze } from './solver.ts';

export interface GeneratedProblem {
  id: string;
  sfen: string;
  moves: number;
  hasHand: boolean;
}

// 再現可能な擬似乱数（mulberry32）
export type Rng = () => number;
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randint(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}
function choice<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function shuffle<T>(arr: T[], rng: Rng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// 不成だと行きどころのない駒になる配置か
function deadUnpromoted(color: Color, type: PieceType, row: number): boolean {
  const last = color === BLACK ? 0 : 8;
  const last2 = color === BLACK ? 1 : 7;
  if (type === PAWN || type === LANCE) return row === last;
  if (type === KNIGHT) return row === last || row === last2;
  return false;
}

function nearSquares(center: number, radius: number): number[] {
  const cr = rowOf(center);
  const cc = colOf(center);
  const out: number[] = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = cr + dr;
      const c = cc + dc;
      if (onBoard(r, c)) out.push(sq(r, c));
    }
  }
  return out;
}

// 玉の位置。edgeBias が大きいほど端・隅に寄せる（短手数・長手数ほど逃げ場を減らす）。
function pickKingSquare(rng: Rng, edgeBias: number): number {
  let row: number;
  const rr = rng();
  if (rr < edgeBias) row = randint(rng, 0, 1);
  else if (rr < edgeBias + 0.3) row = randint(rng, 2, 3);
  else row = randint(rng, 0, 4);

  let col: number;
  const rc = rng();
  if (rc < edgeBias) col = choice(rng, [0, 8]);
  else if (rc < edgeBias + 0.25) col = choice(rng, [1, 7]);
  else col = randint(rng, 0, 8);

  return sq(row, col);
}

interface GenConfig {
  boardPool: PieceType[];
  handPool: PieceType[];
  blockPool: PieceType[];
  board: [number, number];
  hand: [number, number];
  block: [number, number];
  radius: number;
  edgeBias: number;
}

// 手数ごとの構築パラメータ。長手数ほど駒を弱め（飛角を控える）・端寄せ・壁駒多めにして、
// 「速い詰み」や「枝分かれ爆発」を避け、ちょうど N 手の手順が出やすくする。
const CONFIGS: Record<number, GenConfig> = {
  1: {
    boardPool: [GOLD, GOLD, SILVER, SILVER, KNIGHT, LANCE, PAWN, BISHOP, ROOK],
    handPool: [GOLD, SILVER, SILVER, KNIGHT, LANCE, PAWN, BISHOP, ROOK],
    blockPool: [PAWN, GOLD, SILVER],
    board: [1, 3],
    hand: [0, 1],
    block: [0, 2],
    radius: 3,
    edgeBias: 0.5,
  },
  3: {
    boardPool: [GOLD, GOLD, SILVER, SILVER, KNIGHT, LANCE, PAWN, BISHOP, ROOK],
    handPool: [GOLD, SILVER, SILVER, KNIGHT, LANCE, PAWN, BISHOP],
    blockPool: [PAWN, GOLD, SILVER],
    board: [1, 3],
    hand: [0, 2],
    block: [0, 2],
    radius: 3,
    edgeBias: 0.55,
  },
  5: {
    // 5手は飛角を盤上に置かず弱めの駒中心、端寄せ・壁駒多めで手数を伸ばす
    boardPool: [GOLD, SILVER, SILVER, KNIGHT, KNIGHT, LANCE, PAWN, GOLD],
    handPool: [GOLD, SILVER, SILVER, KNIGHT, LANCE, PAWN],
    blockPool: [PAWN, GOLD, SILVER],
    board: [2, 4],
    hand: [0, 2],
    block: [1, 2],
    radius: 2,
    edgeBias: 0.7,
  },
};

// 候補局面を構築する（検証はしない）。テスト・調整用に export。
export function buildCandidate(n: number, rng: Rng, wantHand: boolean): Position | null {
  const cfg = CONFIGS[n] ?? CONFIGS[3];
  const pos = new Position(BLACK);
  const kingSq = pickKingSquare(rng, cfg.edgeBias);
  pos.board[kingSq] = encode(WHITE, KING, false);

  const nBoard = randint(rng, cfg.board[0], cfg.board[1]);
  const nHand = wantHand ? Math.max(1, randint(rng, Math.max(1, cfg.hand[0]), cfg.hand[1])) : 0;
  const nBlock = randint(rng, cfg.block[0], cfg.block[1]);

  const near = nearSquares(kingSq, cfg.radius).filter((s) => pos.board[s] === 0);
  shuffle(near, rng);
  let idx = 0;

  // 攻め方の盤上駒
  let placed = 0;
  while (placed < nBoard && idx < near.length) {
    const s = near[idx++];
    const t = choice(rng, cfg.boardPool);
    if (deadUnpromoted(BLACK, t, rowOf(s))) continue;
    pos.board[s] = encode(BLACK, t, false);
    placed++;
  }
  if (placed === 0) return null;

  // 攻め方の持ち駒
  for (let i = 0; i < nHand; i++) {
    const t = choice(rng, cfg.handPool);
    pos.hands[BLACK][t] += 1;
  }

  // 受け方の壁駒
  let blocked = 0;
  while (blocked < nBlock && idx < near.length) {
    const s = near[idx++];
    if (pos.board[s] !== 0) continue;
    const t = choice(rng, cfg.blockPool);
    if (deadUnpromoted(WHITE, t, rowOf(s))) continue;
    pos.board[s] = encode(WHITE, t, false);
    blocked++;
  }

  // 開始局面で受け方が既に王手されているのは不自然なので除外
  if (isInCheck(pos, WHITE)) return null;
  return pos;
}

export interface GenerateOptions {
  maxAttempts?: number;
  seen?: Set<string>; // 既出の sfen（重複回避）
}

// N 手詰めの問題を 1 問生成（見つからなければ null）。
export function generateProblem(n: number, rng: Rng, opts: GenerateOptions = {}): GeneratedProblem | null {
  const maxAttempts = opts.maxAttempts ?? 6000;
  const seen = opts.seen;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const wantHand = rng() < 0.5;
    const pos = buildCandidate(n, rng, wantHand);
    if (!pos) continue;
    const res = analyze(pos, n);
    if (!res.mate || !res.unique) continue;
    const sfen = serialize(pos);
    if (seen && seen.has(sfen)) continue;
    if (seen) seen.add(sfen);
    return {
      id: `${n}-${hashStr(sfen)}`,
      sfen,
      moves: n,
      hasHand: pos.hasAnyHand(BLACK),
    };
  }
  return null;
}

function hashStr(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
