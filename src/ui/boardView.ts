// 盤の描画とタッチ/クリック操作。駒を選ぶと移動先（ガイド）をハイライトする。
// 詰将棋のルールは知らず、単に局面を描画し「指された手」を通知する。

import {
  BLACK,
  HAND_TYPES,
  Move,
  PieceType,
  WHITE,
  colOf,
  rowOf,
  sq,
} from '../engine/types.ts';
import { Position, isPromoted, pieceColor, pieceType } from '../engine/board.ts';
import { generatePseudoMoves } from '../engine/moves.ts';
import { fileOf, pieceKanji } from '../engine/notation.ts';

type Selection = { kind: 'board'; from: number } | { kind: 'drop'; type: PieceType } | null;

export interface BoardViewOptions {
  onMove: (move: Move) => void;
  showGuide: boolean;
}

const FILE_LABELS = ['９', '８', '７', '６', '５', '４', '３', '２', '１'];
const RANK_LABELS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

export class BoardView {
  private root: HTMLElement;
  private boardEl!: HTMLElement;
  private topHandEl!: HTMLElement;
  private bottomHandEl!: HTMLElement;
  private pos: Position = new Position();
  private opts: BoardViewOptions;
  private selection: Selection = null;
  private interactive = true;
  private legalForSelection: Move[] = [];
  private lastMove: Move | null = null;
  private hintSquare: number | null = null;

  constructor(root: HTMLElement, opts: BoardViewOptions) {
    this.root = root;
    this.opts = opts;
    this.build();
  }

  private build(): void {
    this.root.classList.add('board-view');
    this.root.innerHTML = '';

    this.topHandEl = document.createElement('div');
    this.topHandEl.className = 'komadai komadai-top';
    this.root.appendChild(this.topHandEl);

    const wrap = document.createElement('div');
    wrap.className = 'board-wrap';
    this.boardEl = document.createElement('div');
    this.boardEl.className = 'board';
    wrap.appendChild(this.boardEl);
    this.root.appendChild(wrap);

    this.bottomHandEl = document.createElement('div');
    this.bottomHandEl.className = 'komadai komadai-bottom';
    this.root.appendChild(this.bottomHandEl);
  }

  setPosition(pos: Position): void {
    this.pos = pos.clone();
    this.selection = null;
    this.legalForSelection = [];
    this.render();
  }

  setInteractive(b: boolean): void {
    this.interactive = b;
    this.render();
  }

  setGuide(b: boolean): void {
    this.opts.showGuide = b;
    this.render();
  }

  setLastMove(m: Move | null): void {
    this.lastMove = m;
  }

  setHint(square: number | null): void {
    this.hintSquare = square;
    this.render();
  }

  clearSelection(): void {
    this.selection = null;
    this.legalForSelection = [];
    this.render();
  }

  getPosition(): Position {
    return this.pos;
  }

  // 現在の選択に対する合法手（移動先ガイド用）
  private computeLegal(): void {
    if (!this.selection) {
      this.legalForSelection = [];
      return;
    }
    const all = generatePseudoMoves(this.pos, this.pos.turn);
    if (this.selection.kind === 'board') {
      const from = this.selection.from;
      this.legalForSelection = all.filter((m) => m.from === from);
    } else {
      const type = this.selection.type;
      this.legalForSelection = all.filter((m) => m.from === null && m.type === type);
    }
  }

  private destSquares(): Set<number> {
    return new Set(this.legalForSelection.map((m) => m.to));
  }

  private onSquareTap(square: number): void {
    if (!this.interactive) return;
    const code = this.pos.board[square];
    const dests = this.destSquares();

    // すでに選択中で、移動先がタップされた → 着手
    if (this.selection && dests.has(square)) {
      this.commitTo(square);
      return;
    }

    // 自分の駒をタップ → 選択
    if (code !== 0 && pieceColor(code) === this.pos.turn) {
      this.selection = { kind: 'board', from: square };
      this.computeLegal();
      this.render();
      return;
    }

    // それ以外 → 選択解除
    this.selection = null;
    this.legalForSelection = [];
    this.render();
  }

  private onHandTap(type: PieceType): void {
    if (!this.interactive) return;
    if (this.pos.hands[this.pos.turn][type] <= 0) return;
    if (this.selection && this.selection.kind === 'drop' && this.selection.type === type) {
      this.selection = null;
    } else {
      this.selection = { kind: 'drop', type };
    }
    this.computeLegal();
    this.render();
  }

  private commitTo(square: number): void {
    const variants = this.legalForSelection.filter((m) => m.to === square);
    if (variants.length === 0) return;
    const canPromote = variants.some((m) => m.promote);
    const canStay = variants.some((m) => !m.promote);
    if (canPromote && canStay) {
      this.askPromotion((promote) => {
        const m = variants.find((v) => v.promote === promote)!;
        this.playMove(m);
      });
      return;
    }
    this.playMove(variants[0]);
  }

  private playMove(m: Move): void {
    this.selection = null;
    this.legalForSelection = [];
    this.opts.onMove(m);
  }

  private askPromotion(cb: (promote: boolean) => void): void {
    const overlay = document.createElement('div');
    overlay.className = 'promo-overlay';
    const box = document.createElement('div');
    box.className = 'promo-box';
    box.innerHTML = '<div class="promo-title">成りますか？</div>';
    const btns = document.createElement('div');
    btns.className = 'promo-btns';
    const yes = document.createElement('button');
    yes.textContent = '成る';
    yes.className = 'promo-yes';
    const no = document.createElement('button');
    no.textContent = 'そのまま';
    no.className = 'promo-no';
    btns.appendChild(yes);
    btns.appendChild(no);
    box.appendChild(btns);
    overlay.appendChild(box);
    const close = (promote: boolean) => {
      overlay.remove();
      cb(promote);
    };
    yes.addEventListener('click', () => close(true));
    no.addEventListener('click', () => close(false));
    this.root.appendChild(overlay);
  }

  private render(): void {
    this.computeLegal();
    const dests = this.destSquares();
    this.boardEl.innerHTML = '';

    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const square = sq(row, col);
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.sq = String(square);

        if (this.selection && this.selection.kind === 'board' && this.selection.from === square) {
          cell.classList.add('selected');
        }
        if (this.lastMove && this.lastMove.to === square) cell.classList.add('lastmove');
        if (this.hintSquare === square) cell.classList.add('hint');

        const code = this.pos.board[square];
        if (code !== 0) {
          const piece = document.createElement('div');
          const color = pieceColor(code);
          piece.className = `piece ${color === BLACK ? 'sente' : 'gote'}`;
          if (isPromoted(code)) piece.classList.add('promoted');
          piece.textContent = pieceKanji(pieceType(code), isPromoted(code));
          cell.appendChild(piece);
        }

        if (this.opts.showGuide && dests.has(square)) {
          const dot = document.createElement('div');
          dot.className = code !== 0 ? 'guide guide-capture' : 'guide guide-move';
          cell.appendChild(dot);
          cell.classList.add('targetable');
        }

        cell.addEventListener('click', () => this.onSquareTap(square));
        this.boardEl.appendChild(cell);
      }
    }

    this.renderHands();
    this.renderLabels();
  }

  private renderLabels(): void {
    // 既存ラベルを除去
    this.root.querySelectorAll('.file-labels, .rank-labels').forEach((e) => e.remove());
    const wrap = this.boardEl.parentElement!;
    const files = document.createElement('div');
    files.className = 'file-labels';
    for (const f of FILE_LABELS) {
      const s = document.createElement('span');
      s.textContent = f;
      files.appendChild(s);
    }
    const ranks = document.createElement('div');
    ranks.className = 'rank-labels';
    for (const r of RANK_LABELS) {
      const s = document.createElement('span');
      s.textContent = r;
      ranks.appendChild(s);
    }
    wrap.appendChild(files);
    wrap.appendChild(ranks);
  }

  private renderHands(): void {
    this.renderHand(this.bottomHandEl, BLACK, true);
    this.renderHand(this.topHandEl, WHITE, false);
  }

  private renderHand(el: HTMLElement, color: number, interactive: boolean): void {
    el.innerHTML = '';
    const label = document.createElement('div');
    label.className = 'komadai-label';
    label.textContent = color === BLACK ? '☗もちごま' : '☖もちごま';
    el.appendChild(label);
    const pieces = document.createElement('div');
    pieces.className = 'komadai-pieces';
    let any = false;
    for (const type of HAND_TYPES) {
      const n = this.pos.hands[color][type];
      if (n <= 0) continue;
      any = true;
      const item = document.createElement('div');
      item.className = 'hand-piece';
      if (
        interactive &&
        this.selection &&
        this.selection.kind === 'drop' &&
        this.selection.type === type
      ) {
        item.classList.add('selected');
      }
      const glyph = document.createElement('span');
      glyph.className = 'piece sente';
      glyph.textContent = pieceKanji(type, false);
      item.appendChild(glyph);
      if (n > 1) {
        const cnt = document.createElement('span');
        cnt.className = 'hand-count';
        cnt.textContent = String(n);
        item.appendChild(cnt);
      }
      if (interactive && this.pos.turn === (color as 0 | 1)) {
        item.addEventListener('click', () => this.onHandTap(type));
      }
      pieces.appendChild(item);
    }
    if (!any) {
      const none = document.createElement('div');
      none.className = 'hand-none';
      none.textContent = 'なし';
      pieces.appendChild(none);
    }
    el.appendChild(pieces);
  }
}

// 補助: 表示用にマスの筋ラベルを返す（デバッグ等）
export function squareLabel(square: number): string {
  return `${FILE_LABELS[colOf(square)] ?? fileOf(square)}${RANK_LABELS[rowOf(square)]}`;
}
