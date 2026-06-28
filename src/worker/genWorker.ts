// 問題を自動生成する Web Worker。UI スレッドを止めずに裏で生成し続ける。

import { mulberry32, generateProblem } from '../engine/generator.ts';

const rng = mulberry32(((Date.now() ^ (Math.random() * 1e9)) | 0) >>> 0);
const seen = new Set<string>();

interface Req {
  id: number;
  n: number;
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, n } = e.data;
  // 1問だけ生成して返す（時間がかかってもUIには影響しない）
  const prob = generateProblem(n, rng, { maxAttempts: 30000, seen });
  (self as unknown as Worker).postMessage({ id, prob });
};
