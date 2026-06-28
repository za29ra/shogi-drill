// 詰将棋ソルバー。
//  - 攻め方(BLACK)は最短で詰ます。受け方(WHITE)は最長に粘る。
//  - 「ちょうど N 手詰め」かつ「全攻め手番で最短詰めの手が一意（余詰なし）」を検証する。
//
// 設計上、受け方の持ち駒は空にして無駄合いを排除している（生成器がそう作る）。
// 距離は手数（plies, 奇数）で数える。詰みは攻め方手番から見て 1,3,5,... 手。

import { BLACK, Move, PAWN, WHITE, isDrop } from './types.ts';
import { Position } from './board.ts';
import { applyMove, generateAttackerChecks, generateDefenderMoves } from './moves.ts';

const INF = Infinity;

// トランスポジション表（同一局面の再探索を省く）。solveAttack/solveDefense は
// (局面, 残り手数) の純粋関数なのでキャッシュ可能。analyze() の間だけ有効化する。
let TT: Map<string, number> | null = null;

// 探索ノード数の上限。1問の検証が重すぎる（＝子ども向けに複雑すぎる）候補を
// 早めに打ち切って棄却するためのガード。analyze() の間だけ有効化する。
class SearchAbort extends Error {}
let NODES = 0;
let NODE_LIMIT = INF;

// 攻め方(BLACK)手番。limit 手以内の最短詰め手数を返す（不詰は INF）。
export function solveAttack(pos: Position, limit: number): number {
  if (limit <= 0) return INF;
  if (++NODES > NODE_LIMIT) throw new SearchAbort();
  let key = '';
  if (TT) {
    key = pos.hash() + '#a' + limit;
    const v = TT.get(key);
    if (v !== undefined) return v;
  }
  let best = INF;
  const checks = generateAttackerChecks(pos);
  for (const m of checks) {
    const child = applyMove(pos, m);
    const d = solveDefense(child, limit - 1);
    if (d === INF) continue;
    if (d === 0 && isDrop(m) && m.type === PAWN) continue; // 打ち歩詰めは反則
    const total = 1 + d;
    if (total < best) best = total;
    if (best === 1) break;
  }
  if (TT) TT.set(key, best);
  return best;
}

// 受け方(WHITE)手番（王手されている前提）。最長抵抗の手数を返す。逃れられるなら INF。
export function solveDefense(pos: Position, limit: number): number {
  if (++NODES > NODE_LIMIT) throw new SearchAbort();
  let key = '';
  if (TT) {
    key = pos.hash() + '#d' + limit;
    const v = TT.get(key);
    if (v !== undefined) return v;
  }
  const moves = generateDefenderMoves(pos);
  let result: number;
  if (moves.length === 0) {
    result = 0; // 受け方に合法手なし → 詰み
  } else if (limit <= 0) {
    result = INF; // これ以上追えない → 逃れ
  } else {
    let worst = 0;
    result = -1;
    for (const m of moves) {
      const child = applyMove(pos, m);
      const d = solveAttack(child, limit - 1);
      if (d === INF) {
        result = INF; // 一手でも逃れられれば不詰
        break;
      }
      const total = 1 + d;
      if (total > worst) worst = total;
    }
    if (result === -1) result = worst;
  }
  if (TT) TT.set(key, result);
  return result;
}

// 攻め方手番の局面で、ちょうど dist 手で詰む手が一意か（全続図で再帰検証）。
export function uniqueAttack(pos: Position, dist: number): boolean {
  const checks = generateAttackerChecks(pos);
  let optimalChild: Position | null = null;
  let count = 0;
  for (const m of checks) {
    const child = applyMove(pos, m);
    const d = solveDefense(child, dist - 1);
    if (d === INF) continue;
    if (d === 0 && isDrop(m) && m.type === PAWN) continue;
    if (1 + d === dist) {
      count++;
      if (count > 1) return false;
      optimalChild = child;
    }
  }
  if (count !== 1 || optimalChild === null) return false;
  if (dist === 1) return true;
  // 受け方の最善応手（抵抗 dist-1 を実現する手）すべてで、続く攻め手も一意であること
  const defMoves = generateDefenderMoves(optimalChild);
  for (const dm of defMoves) {
    const gchild = applyMove(optimalChild, dm);
    const ad = solveAttack(gchild, dist - 2);
    if (ad !== INF && 1 + ad === dist - 1) {
      if (!uniqueAttack(gchild, ad)) return false;
    }
  }
  return true;
}

export interface AnalyzeResult {
  mate: boolean; // ちょうど N 手で詰むか
  unique: boolean; // 余詰なし（全攻め手番で手が一意）か
  dist: number; // 実際の最短詰め手数（INF は不詰）
}

// 局面が「ちょうど N 手詰め・余詰なし」かを判定。
export function analyze(pos: Position, n: number): AnalyzeResult {
  // 深い探索（5手以上）でのみキャッシュ・ノード上限を有効化。
  const useTT = n >= 4;
  if (useTT) TT = new Map();
  NODES = 0;
  NODE_LIMIT = n >= 5 ? 20000 : INF;
  try {
    const dist = solveAttack(pos, n);
    if (dist !== n) return { mate: false, unique: false, dist };
    const unique = uniqueAttack(pos, n);
    return { mate: true, unique, dist };
  } catch (e) {
    if (e instanceof SearchAbort) return { mate: false, unique: false, dist: INF };
    throw e;
  } finally {
    if (useTT) TT = null;
    NODE_LIMIT = INF;
  }
}

// 攻め方の指し手 move が、ちょうど dist 手詰めを実現するか（解答の正誤判定に使用）。
export function moveAchievesMate(pos: Position, move: Move, dist: number): boolean {
  if (pos.turn !== BLACK) return false;
  // move が王手になる合法手かどうかは applyMove 後にチェック
  const child = applyMove(pos, move);
  const wk = child.kingSquare(WHITE);
  if (wk < 0) return false;
  // 王手でない手は不正解
  const checks = generateAttackerChecks(pos);
  if (!checks.some((c) => sameMove(c, move))) return false;
  const d = solveDefense(child, dist - 1);
  if (d === INF) return false;
  if (d === 0 && isDrop(move) && move.type === PAWN) return false; // 打ち歩詰め
  return 1 + d === dist;
}

function sameMove(a: Move, b: Move): boolean {
  return a.from === b.from && a.to === b.to && a.type === b.type && a.promote === b.promote;
}

// 攻め方手番の局面で、ちょうど dist 手で詰む唯一の手を返す（ヒント・解答表示用）。
export function solutionMove(pos: Position, dist: number): Move | null {
  const checks = generateAttackerChecks(pos);
  for (const m of checks) {
    const child = applyMove(pos, m);
    const d = solveDefense(child, dist - 1);
    if (d === INF) continue;
    if (d === 0 && isDrop(m) && m.type === PAWN) continue;
    if (1 + d === dist) return m;
  }
  return null;
}

// 受け方の最善応手（最長に粘る手）を返す。詰んでいれば null。
export function bestDefenderMove(pos: Position, limit: number): Move | null {
  const moves = generateDefenderMoves(pos);
  if (moves.length === 0) return null;
  let bestMove: Move | null = null;
  let bestVal = -1;
  for (const m of moves) {
    const child = applyMove(pos, m);
    const d = solveAttack(child, limit - 1);
    const val = d === INF ? Number.MAX_SAFE_INTEGER : d;
    if (val > bestVal) {
      bestVal = val;
      bestMove = m;
    }
  }
  return bestMove;
}

// 解答の主手順（攻め方の手と受け方の最善応手）を最後まで列挙する。
export function principalLine(pos: Position, n: number): Move[] {
  const line: Move[] = [];
  let cur = pos.clone();
  let remaining = n;
  while (remaining > 0) {
    const atk = solutionMove(cur, remaining);
    if (!atk) break;
    line.push(atk);
    cur = applyMove(cur, atk);
    remaining -= 1;
    if (remaining <= 0) break;
    const def = bestDefenderMove(cur, remaining);
    if (!def) break;
    line.push(def);
    cur = applyMove(cur, def);
    remaining -= 1;
  }
  return line;
}
