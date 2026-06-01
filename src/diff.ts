import type { FileChunk } from './types.js';

export interface OctokitLike {
  pulls: {
    get: (args: {
      owner: string;
      repo: string;
      pull_number: number;
      mediaType: { format: 'diff' };
    }) => Promise<{ data: unknown }>;
  };
}

export async function fetchDiff(
  octokit: OctokitLike,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<string> {
  const response = await octokit.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
    mediaType: { format: 'diff' }
  });
  if (typeof response.data !== 'string') {
    throw new Error('Unexpected diff response: expected string body');
  }
  return response.data;
}

/**
 * Splits a unified diff into per-file chunks. Each chunk contains everything from a
 * "diff --git" header (inclusive) up to the next one (exclusive).
 */
export function splitDiffByFile(diff: string): FileChunk[] {
  if (!diff) {
    return [];
  }
  const lines = diff.split('\n');
  const chunks: FileChunk[] = [];
  let current: string[] = [];
  let currentPath: string | null = null;

  const flush = (): void => {
    if (currentPath === null) {
      return;
    }
    const body = current.join('\n');
    if (body.length > 0) {
      chunks.push({ path: currentPath, body });
    }
  };

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flush();
      current = [line];
      currentPath = parseFilePathFromDiffHeader(line);
    } else {
      current.push(line);
    }
  }
  flush();
  return chunks;
}

export function parseFilePathFromDiffHeader(header: string): string {
  // Example: diff --git a/src/foo.ts b/src/foo.ts
  // Example: diff --git a/foo b/bar (renamed)
  const match = header.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (!match) {
    return 'unknown';
  }
  const left = match[1] ?? '';
  const right = match[2] ?? '';
  if (left === right) {
    return left;
  }
  return `${left} -> ${right}`;
}

/**
 * Splits a list of file chunks into batches that respect a per-batch character limit.
 * Chunks that individually exceed the limit are kept whole; the caller is expected to
 * truncate them upstream if needed.
 */
export function chunkFiles(files: FileChunk[], maxCharsPerBatch: number): FileChunk[][] {
  if (files.length === 0) {
    return [];
  }
  const batches: FileChunk[][] = [];
  let current: FileChunk[] = [];
  let currentSize = 0;

  for (const file of files) {
    if (currentSize + file.body.length > maxCharsPerBatch && current.length > 0) {
      batches.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(file);
    currentSize += file.body.length;
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}
