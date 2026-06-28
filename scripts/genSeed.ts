// 検証済みのフォールバック問題集を生成して src/data/seedProblems.ts に書き出す。
// 実行: npm run gen:seed
//
// 生成器はランタイム(Worker)でも動くが、初回表示を即座にし、オフラインでも
// 常に問題があるようにするための種データを用意する。

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mulberry32, generateProblem, type GeneratedProblem } from '../src/engine/generator.ts';

const COUNTS: Record<number, number> = { 1: 30, 3: 26, 5: 18, 7: 10 };
const SEED = 20260628;

// 手数ごとの生成パラメータ。長手数ほど出現率が低く 1 問あたりの試行・時間がかかるため、
// 試行上限(maxAttempts)とリトライ上限(want * factor)を手数別に引き上げる。
const GEN_PARAMS: Record<number, { maxAttempts: number; triesFactor: number }> = {
  1: { maxAttempts: 12000, triesFactor: 6 },
  3: { maxAttempts: 12000, triesFactor: 6 },
  5: { maxAttempts: 12000, triesFactor: 6 },
  7: { maxAttempts: 40000, triesFactor: 30 },
};

function main() {
  const rng = mulberry32(SEED);
  const seen = new Set<string>();
  const problems: GeneratedProblem[] = [];
  const start = Date.now();

  for (const n of [1, 3, 5, 7]) {
    const want = COUNTS[n];
    const { maxAttempts, triesFactor } = GEN_PARAMS[n] ?? { maxAttempts: 12000, triesFactor: 6 };
    let got = 0;
    let tries = 0;
    while (got < want && tries < want * triesFactor) {
      tries++;
      const t0 = Date.now();
      const prob = generateProblem(n, rng, { maxAttempts, seen });
      if (!prob) continue;
      problems.push(prob);
      got++;
      process.stdout.write(`  ${n}手 ${got}/${want} (${Date.now() - t0}ms)\n`);
    }
    console.log(`${n}手詰め: ${got}問`);
  }

  const withHand = problems.filter((p) => p.hasHand).length;
  console.log(
    `合計 ${problems.length}問 / 持ち駒あり ${withHand} なし ${problems.length - withHand} / ${(
      (Date.now() - start) /
      1000
    ).toFixed(1)}s`,
  );

  const body = problems
    .map((p) => `  { sfen: '${p.sfen}', moves: ${p.moves}, hasHand: ${p.hasHand} },`)
    .join('\n');
  const content = `// 自動生成（scripts/genSeed.ts）。手で編集しない。
// すべて「ちょうどN手詰め・余詰なし」を検証済み。

export interface SeedProblem {
  sfen: string;
  moves: number;
  hasHand: boolean;
}

export const SEED_PROBLEMS: SeedProblem[] = [
${body}
];
`;

  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(here, '../src/data/seedProblems.ts');
  writeFileSync(outPath, content, 'utf8');
  console.log(`書き出し: ${outPath}`);
}

main();
