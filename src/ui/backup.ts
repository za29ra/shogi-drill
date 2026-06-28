// 成績データのバックアップ書き出し／復元（DOM 操作部分）。
//
// Web アプリからは iCloud へ直接アクセスできないため、
//  - 書き出し: 共有シート(navigator.share)経由で「ファイルに保存」→ iCloud Drive へ。
//              非対応環境ではダウンロード（Safari なら共有→ファイルに保存で iCloud へ）。
//  - 復元: ファイル選択（iCloud Drive から選べる）→ JSON を読み込んで反映。
// という手動連携で「バックアップ・復元・別端末への移動」を実現する。

import { exportBackup, importBackup } from '../store/store.ts';

export function backupFilename(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `shogi-drill-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

// バックアップを書き出す。'shared'（共有シート）か 'downloaded'（ダウンロード）を返す。
export async function exportBackupFile(): Promise<'shared' | 'downloaded'> {
  const json = JSON.stringify(exportBackup(), null, 2);
  const filename = backupFilename();

  // iOS Safari: 共有シート → 「ファイルに保存」→ iCloud Drive
  try {
    const file = new File([json], filename, { type: 'application/json' });
    if (
      typeof navigator.canShare === 'function' &&
      typeof navigator.share === 'function' &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({ files: [file], title: '詰将棋ドリル 成績バックアップ' });
      return 'shared';
    }
  } catch (e) {
    // 共有のキャンセルや失敗時はダウンロードにフォールバック
    if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
  }

  // フォールバック: ファイルとしてダウンロード
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return 'downloaded';
}

// ファイルを選んで復元する。結果メッセージを onDone に渡す。
export function pickAndRestoreBackup(onDone: (message: string, ok: boolean) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const f = input.files && input.files[0];
    input.remove();
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const res = importBackup(data);
        onDone(`復元しました（記録 ${res.total} 日分）。`, true);
      } catch {
        onDone('読み込めませんでした。詰将棋ドリルのバックアップファイルか確認してください。', false);
      }
    };
    reader.onerror = () => onDone('ファイルの読み込みに失敗しました。', false);
    reader.readAsText(f);
  });
  document.body.appendChild(input);
  input.click();
}
