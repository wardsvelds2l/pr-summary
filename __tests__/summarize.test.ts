import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/index.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCommentBody,
  buildErrorCommentBody,
  findBotCommentId,
  upsertComment
} from '../src/comment.js';
import { COMMENT_MARKER, ERROR_MARKER } from '../src/inputs.js';
import type { CommentApis, CommentListClient, CommentWriteClient, PrComment } from '../src/comment.js';

function makeChatResponse(content: string): ChatCompletion {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 0,
    model: 'gpt-4o-mini',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content, refusal: null },
        finish_reason: 'stop',
        logprobs: null
      }
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  } as unknown as ChatCompletion;
}

interface FakeClient {
  create: ReturnType<typeof vi.fn>;
}

function makeClient(): FakeClient & { chat: { completions: { create: ReturnType<typeof vi.fn> } } } {
  const create = vi.fn();
  return {
    create,
    chat: { completions: { create } }
  };
}

function getRequestArgs(client: FakeClient, idx = 0): ChatCompletionCreateParamsNonStreaming {
  const call = client.create.mock.calls[idx];
  if (!call) {
    throw new Error('no mock call recorded');
  }
  return call[0] as ChatCompletionCreateParamsNonStreaming;
}

describe('summarize.createSummarizer', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('summarizes a small diff with a single chat call', async () => {
    const client = makeClient();
    client.create.mockResolvedValueOnce(makeChatResponse('## Summary\nA short diff.'));

    const { createSummarizer } = await import('../src/summarize.js');
    const summarizer = createSummarizer(client as never, {
      githubToken: 't',
      openaiApiKey: 'k',
      openaiBaseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      maxDiffChars: 100000,
      summaryStyle: 'detailed',
      language: 'en',
      triggerEvent: 'all'
    });

    const out = await summarizer.summarizeDiff('diff --git a/x b/x\n+hello');
    expect(out).toBe('## Summary\nA short diff.');
    expect(client.create).toHaveBeenCalledTimes(1);
    const args = getRequestArgs(client);
    expect(args.model).toBe('gpt-4o-mini');
    const system = args.messages[0]?.content;
    expect(typeof system).toBe('string');
    expect(system as string).toContain('detailed');
  });

  it('returns the per-file line and meta-summary in chunked mode', async () => {
    const client = makeClient();
    client.create
      .mockResolvedValueOnce(makeChatResponse('File: src/a.ts — added greet() helper.'))
      .mockResolvedValueOnce(makeChatResponse('## Summary\nThis PR adds a greet() helper.'));

    const { createSummarizer } = await import('../src/summarize.js');
    const summarizer = createSummarizer(client as never, {
      githubToken: 't',
      openaiApiKey: 'k',
      openaiBaseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      maxDiffChars: 100000,
      summaryStyle: 'detailed',
      language: 'en',
      triggerEvent: 'all'
    });

    const out = await summarizer.summarizePerFile([
      { path: 'src/a.ts', body: 'diff --git a/src/a.ts b/src/a.ts\n+new' }
    ]);
    expect(out.files).toEqual([
      { path: 'src/a.ts', body: 'File: src/a.ts — added greet() helper.' }
    ]);
    expect(out.meta).toContain('This PR adds');
    expect(client.create).toHaveBeenCalledTimes(2);
  });

  it('throws when the LLM returns empty content', async () => {
    const client = makeClient();
    client.create.mockResolvedValueOnce(makeChatResponse(''));

    const { createSummarizer } = await import('../src/summarize.js');
    const summarizer = createSummarizer(client as never, {
      githubToken: 't',
      openaiApiKey: 'k',
      openaiBaseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      maxDiffChars: 100000,
      summaryStyle: 'brief',
      language: 'en',
      triggerEvent: 'all'
    });

    await expect(summarizer.summarizeDiff('diff')).rejects.toThrow(/empty response/);
  });

  it('passes language into the system prompt', async () => {
    const client = makeClient();
    client.create.mockResolvedValueOnce(makeChatResponse('- bullet 1'));

    const { createSummarizer } = await import('../src/summarize.js');
    const summarizer = createSummarizer(client as never, {
      githubToken: 't',
      openaiApiKey: 'k',
      openaiBaseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      maxDiffChars: 100000,
      summaryStyle: 'brief',
      language: 'ru',
      triggerEvent: 'all'
    });

    await summarizer.summarizeDiff('diff');
    const args = getRequestArgs(client);
    const system = args.messages[0]?.content;
    expect(typeof system).toBe('string');
    expect(system as string).toContain('Russian');
  });

  it('summarizeInBatches falls back to single call when diff is small enough', async () => {
    const client = makeClient();
    client.create.mockResolvedValueOnce(makeChatResponse('ok'));

    const { summarizeInBatches } = await import('../src/summarize.js');
    const out = await summarizeInBatches(client as never, 10_000, 'm', 'detailed', 'en', 'short diff');
    expect(out).toBe('ok');
    expect(client.create).toHaveBeenCalledTimes(1);
  });

  it('summarizeInBatches chunks large diffs by file and produces a meta-summary', async () => {
    const client = makeClient();
    const diff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '+' + 'x'.repeat(80),
      'diff --git a/b.ts b/b.ts',
      '--- a/b.ts',
      '+++ b/b.ts',
      '+' + 'y'.repeat(80)
    ].join('\n');
    client.create
      .mockResolvedValueOnce(makeChatResponse('File: a.ts — added padding.'))
      .mockResolvedValueOnce(makeChatResponse('File: b.ts — added padding.'))
      .mockResolvedValueOnce(makeChatResponse('## Summary\nTwo files.'));

    const { summarizeInBatches } = await import('../src/summarize.js');
    const out = await summarizeInBatches(client as never, 50, 'm', 'detailed', 'en', diff);
    expect(out).toBe('## Summary\nTwo files.');
    expect(client.create).toHaveBeenCalledTimes(3);
  });
});

describe('comment management', () => {
  it('builds a comment body with the marker', () => {
    const body = buildCommentBody('## Summary\nHi');
    expect(body.startsWith(COMMENT_MARKER)).toBe(true);
    expect(body).toContain('## Summary');
  });

  it('builds an error comment body with both markers', () => {
    const body = buildErrorCommentBody('boom');
    expect(body).toContain(COMMENT_MARKER);
    expect(body).toContain(ERROR_MARKER);
    expect(body).toContain('boom');
  });

  it('finds an existing bot comment by marker', async () => {
    const comments: PrComment[] = [
      { id: 1, body: 'normal user comment', user: { login: 'alice', type: 'User' } },
      { id: 2, body: `${COMMENT_MARKER}\n## Summary`, user: { login: 'bot', type: 'Bot' } }
    ];
    const list: CommentListClient = {
      list: vi.fn().mockResolvedValue({ data: comments })
    };
    const id = await findBotCommentId(list, 'o', 'r', 7);
    expect(id).toBe(2);
  });

  it('returns null when no bot comment exists', async () => {
    const comments: PrComment[] = [
      { id: 1, body: 'no marker here', user: { login: 'alice', type: 'User' } }
    ];
    const list: CommentListClient = {
      list: vi.fn().mockResolvedValue({ data: comments })
    };
    const id = await findBotCommentId(list, 'o', 'r', 7);
    expect(id).toBeNull();
  });

  it('upsertComment updates an existing comment instead of creating a new one', async () => {
    const update = vi.fn().mockResolvedValue({ data: { id: 99 } });
    const create = vi.fn();
    const apis: CommentApis = {
      list: { list: vi.fn().mockResolvedValue({ data: [{ id: 5, body: COMMENT_MARKER, user: null }] }) },
      create: { create, update } as unknown as CommentWriteClient
    };
    const id = await upsertComment(apis, 'o', 'r', 7, 'new body');
    expect(id).toBe(99);
    expect(update).toHaveBeenCalledWith({ owner: 'o', repo: 'r', comment_id: 5, body: 'new body' });
    expect(create).not.toHaveBeenCalled();
  });

  it('upsertComment creates a new comment when none exists', async () => {
    const update = vi.fn();
    const create = vi.fn().mockResolvedValue({ data: { id: 42 } });
    const apis: CommentApis = {
      list: { list: vi.fn().mockResolvedValue({ data: [] }) },
      create: { create, update } as unknown as CommentWriteClient
    };
    const id = await upsertComment(apis, 'o', 'r', 7, 'hello');
    expect(id).toBe(42);
    expect(create).toHaveBeenCalledWith({ owner: 'o', repo: 'r', issue_number: 7, body: 'hello' });
    expect(update).not.toHaveBeenCalled();
  });
});
