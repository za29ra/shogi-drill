/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

// GitHub Pages はリポジトリ名のサブパスで配信されるため base を合わせる。
// 環境変数 VITE_BASE があればそれを優先（独自ドメインやローカル確認用）。
const base = process.env.VITE_BASE ?? '/shogi-drill/';

export default defineConfig({
  base,
  build: {
    target: 'es2021',
    outDir: 'dist',
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // 問題生成テストは詰め探索の実計算で重く、デフォルトの 5s を超える
    // （ローカルで最遅 ~11s / CI ランナーはさらに遅い）ため余裕を持たせる。
    testTimeout: 60000,
  },
});
