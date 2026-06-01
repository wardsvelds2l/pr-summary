/**
 * Local benchmark for the diff-splitting and prompt-building hot path.
 * Generates synthetic diffs of various sizes, then measures the time the
 * action spends in pure-CPU work (no LLM, no network).
 *
 * Usage:  npm run bench
 * Output: prints a table to stdout. Captured for the README's
 *         "Cost & performance" section.
 */
import { performance } from 'node:perf_hooks';
import { splitDiffByFile, chunkFiles } from '../src/diff.js';
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildPerFileSystemPrompt,
  buildMetaUserPrompt
} from '../src/prompt.js';

interface Row {
  name: string;
  iters: number;
  totalMs: number;
  meanMs: number;
}

function time<T>(name: string, iters: number, fn: () => T): Row {
  // Warm-up
  for (let i = 0; i < 5; i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  const totalMs = performance.now() - t0;
  return { name, iters, totalMs, meanMs: totalMs / iters };
}

function buildDiff(files: number, linesPerFile: number): string {
  const parts: string[] = [];
  for (let f = 0; f < files; f++) {
    parts.push(`diff --git a/src/file-${f}.ts b/src/file-${f}.ts`);
    parts.push('index 0000..1111 100644');
    parts.push(`--- a/src/file-${f}.ts`);
    parts.push(`+++ b/src/file-${f}.ts`);
    parts.push(`@@ -1,${linesPerFile} +1,${linesPerFile + 2} @@`);
    for (let l = 0; l < linesPerFile; l++) {
      parts.push(`-const old_${f}_${l} = ${l};`);
      parts.push(`+const new_${f}_${l} = ${l + 1};`);
    }
    parts.push(`+// trailing comment file ${f}`);
  }
  return parts.join('\n');
}

const ITERS = 50;
const diffs = {
  small: buildDiff(3, 30),
  medium: buildDiff(10, 200),
  large: buildDiff(50, 200),
  huge: buildDiff(80, 200)
};

console.log(`# Synthetic diff sizes`);
for (const [k, v] of Object.entries(diffs)) {
  console.log(`#   ${k}: ${v.length} chars`);
}
console.log();

const rows: Row[] = [];

rows.push(time('splitDiffByFile(small)', ITERS, () => splitDiffByFile(diffs.small)));
rows.push(time('splitDiffByFile(medium)', ITERS, () => splitDiffByFile(diffs.medium)));
rows.push(time('splitDiffByFile(large)', ITERS, () => splitDiffByFile(diffs.large)));
rows.push(time('splitDiffByFile(huge)', ITERS, () => splitDiffByFile(diffs.huge)));

rows.push(
  time('chunkFiles(large, 50000)', ITERS, () => {
    const files = splitDiffByFile(diffs.large);
    return chunkFiles(files, 50000);
  })
);

rows.push(time('buildSystemPrompt(detailed, ru)', 200, () => buildSystemPrompt('detailed', 'ru')));
rows.push(
  time('buildUserPrompt(50kB diff)', 50, () => {
    const diff = 'diff --git a/x b/x\n' + '+x\n'.repeat(5000);
    return buildUserPrompt(diff);
  })
);
rows.push(time('buildPerFileSystemPrompt(ja)', 200, () => buildPerFileSystemPrompt('ja')));
rows.push(
  time('buildMetaUserPrompt(50 lines)', 200, () => {
    const lines = Array.from({ length: 50 }, (_, i) => `File: src/f${i}.ts — change ${i}`);
    return buildMetaUserPrompt(lines);
  })
);

console.log('# Benchmark (Node 22, Linux, single core)');
console.log('# name | iters | totalMs | meanMs');
for (const r of rows) {
  console.log(`# ${r.name} | ${r.iters} | ${r.totalMs.toFixed(2)} | ${r.meanMs.toFixed(4)}`);
}
