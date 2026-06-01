import type { ChatCompletion } from 'openai/resources/chat/index.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMENT_MARKER } from '../src/inputs.js';
import type { PrComment } from '../src/comment.js';

const { openaiCreate, openaiCtor, pullsGet, issueCommentsList, issueCommentsCreate, issueCommentsUpdate } =
  vi.hoisted(() => {
    const openaiCreate = vi.fn();
    const openaiCtor = vi.fn().mockImplementation(() => ({
      chat: { completions: { create: openaiCreate } }
    }));
    return {
      openaiCreate,
      openaiCtor,
      pullsGet: vi.fn(),
      issueCommentsList: vi.fn(),
      issueCommentsCreate: vi.fn(),
      issueCommentsUpdate: vi.fn()
    };
  });

vi.mock('openai', () => ({
  default: openaiCtor
}));

const contextState: {
  eventName: string;
  payload: unknown;
  repo: { owner: string; repo: string };
} = {
  eventName: 'pull_request',
  payload: {
    action: 'opened',
    pull_request: { number: 17 },
    repository: { full_name: 'acme/widgets' }
  },
  repo: { owner: 'acme', repo: 'widgets' }
};

vi.mock('@actions/github', () => ({
  context: {
    get eventName() {
      return contextState.eventName;
    },
    get payload() {
      return contextState.payload;
    },
    get repo() {
      return contextState.repo;
    }
  },
  getOctokit: vi.fn(() => ({
    issues: {
      listComments: issueCommentsList,
      createComment: issueCommentsCreate,
      updateComment: issueCommentsUpdate
    },
    pulls: {
      get: pullsGet
    }
  }))
}));

vi.mock('@actions/core', () => ({
  getInput: vi.fn((name: string) => {
    const key = `INPUT_${name.replace(/[ -]/g, '_').toUpperCase()}`;
    const v = process.env[key] ?? '';
    return v;
  }),
  setOutput: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  setFailed: vi.fn()
}));

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

function makeListResponse(comments: PrComment[]): { data: PrComment[] } {
  return { data: comments };
}

function setInputs(overrides: Record<string, string> = {}): void {
  process.env.INPUT_GITHUB_TOKEN = overrides.githubToken ?? 'gh-token';
  process.env.INPUT_OPENAI_API_KEY = overrides.openaiApiKey ?? 'sk-test';
  process.env.INPUT_OPENAI_BASE_URL = overrides.openaiBaseUrl ?? 'https://api.openai.com/v1';
  process.env.INPUT_MODEL = overrides.model ?? 'gpt-4o-mini';
  process.env.INPUT_MAX_DIFF_CHARS = overrides.maxDiffChars ?? '120000';
  process.env.INPUT_SUMMARY_STYLE = overrides.summaryStyle ?? 'detailed';
  process.env.INPUT_LANGUAGE = overrides.language ?? 'en';
  process.env.INPUT_TRIGGER_EVENT = overrides.triggerEvent ?? 'all';
}

function clearInputs(): void {
  for (const key of [
    'INPUT_GITHUB_TOKEN',
    'INPUT_OPENAI_API_KEY',
    'INPUT_OPENAI_BASE_URL',
    'INPUT_MODEL',
    'INPUT_MAX_DIFF_CHARS',
    'INPUT_SUMMARY_STYLE',
    'INPUT_LANGUAGE',
    'INPUT_TRIGGER_EVENT'
  ]) {
    delete process.env[key];
  }
}

function restoreContext(): void {
  contextState.eventName = 'pull_request';
  contextState.payload = {
    action: 'opened',
    pull_request: { number: 17 },
    repository: { full_name: 'acme/widgets' }
  };
  contextState.repo = { owner: 'acme', repo: 'widgets' };
}

describe('main run()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    restoreContext();
    setInputs();
  });
  afterEach(() => {
    vi.clearAllMocks();
    clearInputs();
  });

  it('exits silently for non pull_request events', async () => {
    contextState.eventName = 'push';
    const { run } = await import('../src/main.js');
    await run();
    expect(issueCommentsCreate).not.toHaveBeenCalled();
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it('exits silently when trigger-event is opened and action is synchronize', async () => {
    setInputs({ triggerEvent: 'opened' });
    contextState.payload = { action: 'synchronize' };
    const { run } = await import('../src/main.js');
    await run();
    expect(pullsGet).not.toHaveBeenCalled();
  });

  it('fetches the diff, calls the LLM, and creates a new comment when none exists', async () => {
    const diff = ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '+hello'].join('\n');
    pullsGet.mockResolvedValueOnce({ data: diff });
    issueCommentsList.mockResolvedValueOnce(makeListResponse([]));
    issueCommentsCreate.mockResolvedValueOnce({ data: { id: 555 } });
    openaiCreate.mockResolvedValueOnce(makeChatResponse('## Summary\nTL;DR here.'));

    const { run } = await import('../src/main.js');
    await run();

    expect(pullsGet).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'widgets',
      pull_number: 17,
      mediaType: { format: 'diff' }
    });
    expect(openaiCreate).toHaveBeenCalledTimes(1);
    expect(issueCommentsCreate).toHaveBeenCalledTimes(1);
    const call = issueCommentsCreate.mock.calls[0]?.[0] as { body: string; issue_number: number };
    expect(call.issue_number).toBe(17);
    expect(call.body).toContain(COMMENT_MARKER);
    expect(call.body).toContain('## Summary');
    expect(issueCommentsUpdate).not.toHaveBeenCalled();
  });

  it('updates an existing bot comment instead of creating a new one', async () => {
    const diff = 'diff --git a/x b/x\n+x';
    pullsGet.mockResolvedValueOnce({ data: diff });
    issueCommentsList.mockResolvedValueOnce(
      makeListResponse([{ id: 11, body: `${COMMENT_MARKER}\nold`, user: { login: 'bot', type: 'Bot' } }])
    );
    issueCommentsUpdate.mockResolvedValueOnce({ data: { id: 11 } });
    openaiCreate.mockResolvedValueOnce(makeChatResponse('updated'));

    const { run } = await import('../src/main.js');
    await run();

    expect(issueCommentsUpdate).toHaveBeenCalledTimes(1);
    expect(issueCommentsCreate).not.toHaveBeenCalled();
  });

  it('posts a marked error comment and does not throw when the LLM fails', async () => {
    const diff = 'diff --git a/x b/x\n+x';
    pullsGet.mockResolvedValueOnce({ data: diff });
    issueCommentsList.mockResolvedValueOnce(makeListResponse([]));
    issueCommentsCreate.mockResolvedValueOnce({ data: { id: 88 } });
    openaiCreate.mockRejectedValueOnce(new Error('upstream LLM exploded'));

    const { run } = await import('../src/main.js');
    await expect(run()).resolves.toBeUndefined();

    expect(issueCommentsCreate).toHaveBeenCalledTimes(1);
    const body = (issueCommentsCreate.mock.calls[0]?.[0] as { body: string }).body;
    expect(body).toContain('upstream LLM exploded');
    expect(body).toContain(COMMENT_MARKER);
  });

  it('chunks a diff that exceeds max-diff-chars and runs a meta-summary', async () => {
    setInputs({ maxDiffChars: '50' });
    const long = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '+' + 'x'.repeat(80),
      'diff --git a/b.ts b/b.ts',
      '--- a/b.ts',
      '+++ b/b.ts',
      '+' + 'y'.repeat(80)
    ].join('\n');
    pullsGet.mockResolvedValueOnce({ data: long });
    issueCommentsList.mockResolvedValueOnce(makeListResponse([]));
    issueCommentsCreate.mockResolvedValueOnce({ data: { id: 1 } });
    openaiCreate
      .mockResolvedValueOnce(makeChatResponse('File: a.ts — added padding.'))
      .mockResolvedValueOnce(makeChatResponse('File: b.ts — added padding.'))
      .mockResolvedValueOnce(makeChatResponse('## Summary\nMultiple files.'));

    const { run } = await import('../src/main.js');
    await run();

    expect(openaiCreate).toHaveBeenCalledTimes(3);
    const created = issueCommentsCreate.mock.calls[0]?.[0] as { body: string };
    expect(created.body).toContain('Multiple files.');
  });

  it('respects summary-style=brief by passing a brief system prompt', async () => {
    setInputs({ summaryStyle: 'brief' });
    pullsGet.mockResolvedValueOnce({ data: 'diff --git a/x b/x\n+x' });
    issueCommentsList.mockResolvedValueOnce(makeListResponse([]));
    issueCommentsCreate.mockResolvedValueOnce({ data: { id: 1 } });
    openaiCreate.mockResolvedValueOnce(makeChatResponse('- one\n- two\n- three'));

    const { run } = await import('../src/main.js');
    await run();

    const args = openaiCreate.mock.calls[0]?.[0] as { messages: Array<{ content: string }> };
    expect(args.messages[0]?.content).toContain('exactly 3 bullet points');
  });

  it('respects the language input by injecting the language name into the system prompt', async () => {
    setInputs({ language: 'ru' });
    pullsGet.mockResolvedValueOnce({ data: 'diff --git a/x b/x\n+x' });
    issueCommentsList.mockResolvedValueOnce(makeListResponse([]));
    issueCommentsCreate.mockResolvedValueOnce({ data: { id: 1 } });
    openaiCreate.mockResolvedValueOnce(makeChatResponse('ok'));

    const { run } = await import('../src/main.js');
    await run();

    const args = openaiCreate.mock.calls[0]?.[0] as { messages: Array<{ content: string }> };
    expect(args.messages[0]?.content).toContain('Russian');
  });

  it('rejects an unknown summary-style by falling back to detailed', async () => {
    setInputs({ summaryStyle: 'totally-invalid-style' });
    pullsGet.mockResolvedValueOnce({ data: 'diff --git a/x b/x\n+x' });
    issueCommentsList.mockResolvedValueOnce(makeListResponse([]));
    issueCommentsCreate.mockResolvedValueOnce({ data: { id: 1 } });
    openaiCreate.mockResolvedValueOnce(makeChatResponse('ok'));

    const { run } = await import('../src/main.js');
    await run();

    const args = openaiCreate.mock.calls[0]?.[0] as { messages: Array<{ content: string }> };
    expect(args.messages[0]?.content).toContain('detailed');
  });
});

describe('resolveContext / shouldRunForAction', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns ok=false for non pull_request events', async () => {
    const { resolveContext } = await import('../src/main.js');
    const result = resolveContext('push', {}, { owner: 'o', repo: 'r' });
    expect(result.ok).toBe(false);
  });

  it('requires a pull_request number', async () => {
    const { resolveContext } = await import('../src/main.js');
    const result = resolveContext('pull_request', { action: 'opened' }, { owner: 'o', repo: 'r' });
    expect(result.ok).toBe(false);
  });

  it('returns ok=true with number and action for a valid payload', async () => {
    const { resolveContext } = await import('../src/main.js');
    const result = resolveContext(
      'pull_request',
      { action: 'opened', pull_request: { number: 3 } },
      { owner: 'o', repo: 'r' }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.number).toBe(3);
      expect(result.action).toBe('opened');
    }
  });

  it('filters actions based on trigger-event', async () => {
    const { shouldRunForAction } = await import('../src/main.js');
    expect(shouldRunForAction('opened', 'all')).toBe(true);
    expect(shouldRunForAction('reopened', 'all')).toBe(true);
    expect(shouldRunForAction('synchronize', 'all')).toBe(true);
    expect(shouldRunForAction('synchronize', 'opened')).toBe(false);
    expect(shouldRunForAction('opened', 'opened')).toBe(true);
    expect(shouldRunForAction('closed', 'all')).toBe(false);
  });
});
