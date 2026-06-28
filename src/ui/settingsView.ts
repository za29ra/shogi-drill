// 設定画面。手数・1日の問題数・効果音・移動ガイド・データ消去。

import { getSettings, saveSettings, Settings } from '../store/store.ts';
import { exportBackupFile, pickAndRestoreBackup } from './backup.ts';

export interface SettingsViewDeps {
  onChange: (s: Settings) => void;
}

export class SettingsView {
  private root: HTMLElement;
  private deps: SettingsViewDeps;
  constructor(root: HTMLElement, deps: SettingsViewDeps) {
    this.root = root;
    this.deps = deps;
  }

  mount(): void {
    this.render();
  }

  private update(mut: (s: Settings) => void): void {
    const s = getSettings();
    mut(s);
    saveSettings(s);
    this.deps.onChange(s);
    this.render();
  }

  private render(): void {
    const s = getSettings();
    this.root.innerHTML = '';
    this.root.classList.add('settings');

    // 手数
    const moveSec = this.section('問題の手数', 'やさしい1手から。慣れたら3手・5手に挑戦！');
    const opts = document.createElement('div');
    opts.className = 'chip-group';
    for (const n of [1, 3, 5]) {
      const active = s.moveCounts.includes(n);
      const chip = document.createElement('button');
      chip.className = `chip ${active ? 'chip-on' : ''}`;
      chip.textContent = `${n}手詰め`;
      chip.addEventListener('click', () => {
        this.update((st) => {
          const set = new Set(st.moveCounts);
          if (set.has(n)) set.delete(n);
          else set.add(n);
          if (set.size === 0) set.add(n); // 最低1つは残す
          st.moveCounts = [...set].sort((a, b) => a - b);
        });
      });
      opts.appendChild(chip);
    }
    moveSec.appendChild(opts);
    this.root.appendChild(moveSec);

    // 1日の問題数
    const goalSec = this.section('1日に解く問題数', 'むりのない数からはじめよう。');
    const stepper = document.createElement('div');
    stepper.className = 'stepper';
    const minus = document.createElement('button');
    minus.className = 'step-btn';
    minus.textContent = '−';
    minus.addEventListener('click', () => this.update((st) => (st.dailyGoal = Math.max(1, st.dailyGoal - 1))));
    const val = document.createElement('div');
    val.className = 'step-val';
    val.textContent = `${s.dailyGoal} 問`;
    const plus = document.createElement('button');
    plus.className = 'step-btn';
    plus.textContent = '＋';
    plus.addEventListener('click', () => this.update((st) => (st.dailyGoal = Math.min(50, st.dailyGoal + 1))));
    stepper.appendChild(minus);
    stepper.appendChild(val);
    stepper.appendChild(plus);
    goalSec.appendChild(stepper);
    this.root.appendChild(goalSec);

    // トグル
    const toggleSec = this.section('ひょうじ・おと', '');
    toggleSec.appendChild(
      this.toggle('駒の動かせる場所を見せる（ガイド）', s.showGuide, (v) =>
        this.update((st) => (st.showGuide = v)),
      ),
    );
    toggleSec.appendChild(
      this.toggle('こうかおん', s.sound, (v) => this.update((st) => (st.sound = v))),
    );
    this.root.appendChild(toggleSec);

    // バックアップ（iCloud Drive など）
    const backupSec = this.section(
      'バックアップ（iCloud）',
      '成績をファイルに書き出して iCloud Drive に保存できます。別の端末では「復元」で読み込めます。',
    );
    const backupMsg = document.createElement('div');
    backupMsg.className = 'backup-msg';
    const backupBtns = document.createElement('div');
    backupBtns.className = 'backup-btns';

    const exportBtn = document.createElement('button');
    exportBtn.className = 'backup-btn backup-export';
    exportBtn.textContent = '📤 バックアップを書き出す';
    exportBtn.addEventListener('click', async () => {
      exportBtn.disabled = true;
      try {
        const how = await exportBackupFile();
        backupMsg.textContent =
          how === 'shared'
            ? '共有メニューの「ファイルに保存」から iCloud Drive を選んで保存してください。'
            : 'バックアップファイルを書き出しました。「ファイル」アプリで iCloud Drive に移せます。';
        backupMsg.className = 'backup-msg ok';
      } catch {
        backupMsg.textContent = '書き出しに失敗しました。';
        backupMsg.className = 'backup-msg ng';
      } finally {
        exportBtn.disabled = false;
      }
    });

    const importBtn = document.createElement('button');
    importBtn.className = 'backup-btn backup-import';
    importBtn.textContent = '📥 バックアップから復元';
    importBtn.addEventListener('click', () => {
      if (!confirm('バックアップを読み込みます。現在の記録と統合（多い方を採用）します。よろしいですか？')) return;
      pickAndRestoreBackup((message, ok) => {
        if (ok) {
          // 復元後は設定（手数・目標）が変わるので再描画してから、新しい要素にメッセージを出す
          this.deps.onChange(getSettings());
          this.render();
          const m = this.root.querySelector('.backup-msg');
          if (m) {
            m.textContent = message;
            m.className = 'backup-msg ok';
          }
        } else {
          backupMsg.textContent = message;
          backupMsg.className = 'backup-msg ng';
        }
      });
    });

    backupBtns.appendChild(exportBtn);
    backupBtns.appendChild(importBtn);
    backupSec.appendChild(backupBtns);
    backupSec.appendChild(backupMsg);
    this.root.appendChild(backupSec);

    // データ
    const dataSec = this.section('データ', '成績はこの端末だけに保存されます。');
    const reset = document.createElement('button');
    reset.className = 'danger-btn';
    reset.textContent = '成績をリセットする';
    reset.addEventListener('click', () => {
      if (confirm('これまでの成績をすべて消します。よろしいですか？')) {
        localStorage.removeItem('shogi-drill:history:v1');
        this.deps.onChange(getSettings());
        alert('成績をリセットしました。');
      }
    });
    dataSec.appendChild(reset);
    this.root.appendChild(dataSec);
  }

  private section(title: string, desc: string): HTMLElement {
    const sec = document.createElement('div');
    sec.className = 'setting-section';
    const h = document.createElement('h3');
    h.className = 'section-title';
    h.textContent = title;
    sec.appendChild(h);
    if (desc) {
      const p = document.createElement('p');
      p.className = 'section-desc';
      p.textContent = desc;
      sec.appendChild(p);
    }
    return sec;
  }

  private toggle(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
    const row = document.createElement('label');
    row.className = 'toggle-row';
    const span = document.createElement('span');
    span.textContent = label;
    const sw = document.createElement('button');
    sw.className = `switch ${value ? 'on' : ''}`;
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(value));
    sw.addEventListener('click', () => onChange(!value));
    row.appendChild(span);
    row.appendChild(sw);
    return row;
  }
}
