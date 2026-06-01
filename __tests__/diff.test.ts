import { describe, expect, it } from 'vitest';
import { chunkFiles, parseFilePathFromDiffHeader, splitDiffByFile } from '../src/diff.js';

describe('splitDiffByFile', () => {
  it('returns an empty array for an empty diff', () => {
    expect(splitDiffByFile('')).toEqual([]);
  });

  it('splits a multi-file diff into per-file chunks', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 0000..1111 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
      'diff --git a/src/b.ts b/src/b.ts',
      'index 0000..2222 100644',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -1,1 +1,1 @@',
      '-foo',
      '+bar'
    ].join('\n');

    const chunks = splitDiffByFile(diff);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.path).toBe('src/a.ts');
    expect(chunks[0]?.body).toContain('-old');
    expect(chunks[1]?.path).toBe('src/b.ts');
    expect(chunks[1]?.body).toContain('-foo');
  });

  it('marks renamed files with an arrow', () => {
    const diff = [
      'diff --git a/old/name.ts b/new/name.ts',
      'index 0000..1111 100644',
      '--- a/old/name.ts',
      '+++ b/new/name.ts',
      '@@ -1 +1 @@',
      '-a',
      '+b'
    ].join('\n');

    const chunks = splitDiffByFile(diff);
    expect(chunks[0]?.path).toBe('old/name.ts -> new/name.ts');
  });

  it('returns "unknown" for diff headers that cannot be parsed', () => {
    const parsed = parseFilePathFromDiffHeader('diff --git foo bar');
    expect(parsed).toBe('unknown');
  });
});

describe('chunkFiles', () => {
  it('returns an empty array for no files', () => {
    expect(chunkFiles([], 1000)).toEqual([]);
  });

  it('packs files into a single batch when they all fit', () => {
    const files = [
      { path: 'a.ts', body: 'x'.repeat(10) },
      { path: 'b.ts', body: 'x'.repeat(10) }
    ];
    expect(chunkFiles(files, 100)).toHaveLength(1);
  });

  it('splits files across multiple batches when they exceed the limit', () => {
    const files = [
      { path: 'a.ts', body: 'x'.repeat(40) },
      { path: 'b.ts', body: 'x'.repeat(40) },
      { path: 'c.ts', body: 'x'.repeat(40) }
    ];
    const batches = chunkFiles(files, 100);
    expect(batches).toHaveLength(2);
    expect(batches[0]?.map((f) => f.path)).toEqual(['a.ts', 'b.ts']);
    expect(batches[1]?.map((f) => f.path)).toEqual(['c.ts']);
  });
});
