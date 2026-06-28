// 出題画面。問題を表示し、子どもが指した手を即時にソルバーで正誤判定する。
// 正解なら受け方（相手）の最善手を自動で指し、詰みまで進める。

import { Move } from '../engine/types.ts';
import { Position, deserialize } from '../engine/board.ts';
import { applyMove } from '../engine/moves.ts';
import {
  bestDefenderMove,
  moveAchievesMate,
  principalLine,
  solutionMove,
} from '../engine/solver.ts';
import { moveToText } from '../engine/notation.ts';
import { BoardView } from './boardView.ts';
import { ProblemSource } from './problemSource.ts';
import type { GeneratedProblem } from '../engine/generator.ts';
import { getSettings, getTodayRecord, recordResult } from '../store/store.ts';
import { playCorrect, playFinish, playMove, playWrong } from './sound.ts';

export interface SolveViewDeps {
  source: ProblemSource;
  onProgress: () => void; // 成績更新時にアプリバーを更新
}

export class SolveView {
  private root: HTMLElement;
  private deps: SolveViewDeps;
  private board!: BoardView;
  private msgEl!: HTMLElement;
  private metaEl!: HTMLElement;
  private kifuEl!: HTMLElement;

  private problem!: GeneratedProblem;
  private pos!: Position;
  private remaining = 0;
  private wrong = false;
  private finished = false;
  private recorded = false;
  private busy = false;
  private kifu: string[] = [];

  constructor(root: HTMLElement, deps: SolveViewDeps) {
    this.root = root;
    this.deps = deps;
  }

  mount(): void {
    this.root.innerHTML = '';
    this.root.classList.add('solve');

    const head = document.createElement('div');
    head.className = 'solve-head';
    this.metaEl = document.createElement('div');
    this.metaEl.className = 'prob-meta';
    head.appendChild(this.metaEl);
    this.root.appendChild(head);

    const boardHost = document.createElement('div');
    boardHost.className = 'board-host';
    this.root.appendChild(boardHost);

    this.msgEl = document.createElement('div');
    this.msgEl.className = 'solve-msg';
    this.root.appendChild(this.msgEl);

    this.kifuEl = document.createElement('div');
    this.kifuEl.className = 'kifu';
    this.root.appendChild(this.kifuEl);

    const controls = document.createElement('div');
    controls.className = 'solve-controls';
    controls.appendChild(this.button('ヒント', 'btn-hint', () => this.showHint()));
    controls.appendChild(this.button('もう一度', 'btn-retry', () => this.restart()));
    controls.appendChild(this.button('答え', 'btn-answer', () => this.showAnswer()));
    controls.appendChild(this.button('つぎの問題 ▶', 'btn-next', () => this.nextProblem()));
    this.root.appendChild(controls);

    const settings = getSettings();
    this.board = new BoardView(boardHost, {
      onMove: (m) => this.handleMove(m),
      showGuide: settings.showGuide,
    });

    this.loadProblem();
  }

  // 設定変更（移動ガイドのON/OFFなど）を現在の盤に即時反映
  refreshSettings(): void {
    if (this.board) this.board.setGuide(getSettings().showGuide);
  }

  // 検証用（本番ビルドでは未使用）: 現在の正解手と状態を返す
  peekState(): { move: Move | null; remaining: number; finished: boolean } {
    return {
      move: solutionMove(this.pos, this.remaining),
      remaining: this.remaining,
      finished: this.finished,
    };
  }

  private button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = `ctrl-btn ${cls}`;
    b.addEventListener('click', onClick);
    return b;
  }

  private loadProblem(): void {
    this.problem = this.deps.source.next();
    this.startProblem();
  }

  private restart(): void {
    if (!this.problem) return;
    this.startProblem();
  }

  private startProblem(): void {
    const settings = getSettings();
    this.board.setGuide(settings.showGuide);
    this.pos = deserialize(this.problem.sfen);
    this.remaining = this.problem.moves;
    this.wrong = false;
    this.finished = false;
    this.recorded = false;
    this.busy = false;
    this.kifu = [];
    this.board.setLastMove(null);
    this.board.setHint(null);
    this.board.setPosition(this.pos);
    this.board.setInteractive(true);

    const handLabel = this.problem.hasHand ? '・持ち駒あり' : '・持ち駒なし';
    this.metaEl.innerHTML = `<span class="badge badge-moves">${this.problem.moves}手詰め</span><span class="badge badge-hand">${handLabel.replace('・', '')}</span>`;
    this.setMessage('あなたは ☗（下）。玉を詰ましてね！', 'info');
    this.renderKifu();
    this.deps.onProgress();
  }

  private setMessage(text: string, kind: 'info' | 'good' | 'bad' | 'win'): void {
    this.msgEl.textContent = text;
    this.msgEl.className = `solve-msg msg-${kind}`;
  }

  private renderKifu(): void {
    this.kifuEl.textContent = this.kifu.join('  ');
  }

  private handleMove(move: Move): void {
    if (this.finished || this.busy) return;
    const settings = getSettings();

    if (!moveAchievesMate(this.pos, move, this.remaining)) {
      this.wrong = true;
      playWrong(settings.sound);
      this.setMessage('うーん、ちがうみたい。もう一度かんがえてみよう！', 'bad');
      this.board.setPosition(this.pos); // 盤を元に戻す（取り消し）
      this.flash('bad');
      return;
    }

    // 正解の攻め手を適用
    playMove(settings.sound);
    this.kifu.push(moveToText(this.pos, move));
    this.pos = applyMove(this.pos, move);
    this.remaining -= 1;
    this.board.setPosition(this.pos);
    this.board.setLastMove(move);
    this.renderKifu();

    if (this.remaining <= 0) {
      this.onSolved();
      return;
    }

    // 受け方（相手）の最善応手を少し間をおいて自動で指す
    this.busy = true;
    this.board.setInteractive(false);
    this.setMessage('いいね！正解。相手のうけを見てみよう…', 'good');
    playCorrect(settings.sound);
    window.setTimeout(() => this.playDefense(), 550);
  }

  private playDefense(): void {
    const settings = getSettings();
    const def = bestDefenderMove(this.pos, this.remaining);
    if (!def) {
      // 念のため（ここに来る想定はない）
      this.onSolved();
      return;
    }
    this.kifu.push(moveToText(this.pos, def));
    this.pos = applyMove(this.pos, def);
    this.remaining -= 1;
    playMove(settings.sound);
    this.board.setPosition(this.pos);
    this.board.setLastMove(def);
    this.board.setInteractive(true);
    this.busy = false;
    this.renderKifu();
    this.setMessage('つぎの王手で詰ましてね！', 'info');
  }

  private onSolved(): void {
    const settings = getSettings();
    this.finished = true;
    this.board.setInteractive(false);
    playFinish(settings.sound);
    this.setMessage(this.wrong ? '詰み！せいかい！' : '詰み！一発せいかい！すごい！', 'win');
    this.flash('win');
    if (!this.recorded) {
      this.recorded = true;
      recordResult(this.problem.moves, true, !this.wrong);
      this.deps.onProgress();
      this.celebrateIfGoal();
    }
  }

  private showHint(): void {
    if (this.finished || this.busy) return;
    const m = solutionMove(this.pos, this.remaining);
    if (!m) return;
    // 動かす駒（盤上）を光らせる。打つ手は持ち駒なので着地点を示す。
    this.board.setHint(m.from ?? m.to);
    this.setMessage('ヒント：光っているところに注目！', 'info');
  }

  private showAnswer(): void {
    if (this.busy) return;
    const settings = getSettings();
    // 現局面からの主手順を順番に再生
    const line = principalLine(this.pos, this.remaining);
    if (line.length === 0) return;
    this.busy = true;
    this.board.setInteractive(false);
    this.board.setHint(null);
    if (!this.recorded && !this.finished) {
      this.recorded = true;
      recordResult(this.problem.moves, false, false); // 答えを見た＝未正解として記録
      this.deps.onProgress();
    }
    let i = 0;
    const step = () => {
      if (i >= line.length) {
        this.finished = true;
        this.busy = false;
        this.setMessage('これが正解の手順だよ。つぎの問題にいこう！', 'info');
        return;
      }
      const mv = line[i++];
      this.kifu.push(moveToText(this.pos, mv));
      this.pos = applyMove(this.pos, mv);
      this.board.setPosition(this.pos);
      this.board.setLastMove(mv);
      this.renderKifu();
      playMove(settings.sound);
      window.setTimeout(step, 650);
    };
    step();
  }

  private nextProblem(): void {
    if (this.busy) return;
    this.loadProblem();
  }

  private flash(kind: string): void {
    this.root.classList.remove('flash-bad', 'flash-win');
    // reflow して再度クラス付与（アニメ再生）
    void this.root.offsetWidth;
    if (kind === 'bad') this.root.classList.add('flash-bad');
    if (kind === 'win') this.root.classList.add('flash-win');
  }

  private celebrateIfGoal(): void {
    const settings = getSettings();
    const rec = getTodayRecord();
    // ちょうど目標数に達した瞬間にお祝いを表示
    if (rec.solved === settings.dailyGoal) {
      this.showCelebration(settings.dailyGoal);
    }
  }

  private showCelebration(goal: number): void {
    const overlay = document.createElement('div');
    overlay.className = 'celebrate-overlay';
    overlay.innerHTML = `
      <div class="celebrate-box">
        <div class="celebrate-stamp">🎉</div>
        <div class="celebrate-title">きょうの目標 ${goal}問 たっせい！</div>
        <div class="celebrate-sub">よくがんばったね！</div>
        <button class="celebrate-close">つづける</button>
      </div>`;
    overlay.querySelector('.celebrate-close')!.addEventListener('click', () => overlay.remove());
    this.root.appendChild(overlay);
    window.setTimeout(() => overlay.remove(), 4000);
  }
}
