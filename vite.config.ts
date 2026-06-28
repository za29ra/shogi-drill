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
  },
});
