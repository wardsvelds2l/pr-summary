import { describe, expect, it, vi } from 'vitest';
import {
  buildCommentBody,
  buildErrorCommentBody,
  findBotCommentId,
  upsertComment
} from '../src/comment.js';
import { COMMENT_MARKER, ERROR_MARKER } from '../src/inputs.js';
import type { CommentApis, CommentListClient, CommentWriteClient, PrComment } from '../src/comment.js';

describe('inputs fallback (via env mocks)', () => {
  it('falls back when max-diff-chars is not a positive integer', async () => {
    process.env.INPUT_GITHUB_TOKEN = 't';
    process.env.INPUT_OPENAI_API_KEY = 'k';
    process.env.INPUT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
    process.env.INPUT_MODEL = 'gpt-4o-mini';
    process.env.INPUT_MAX_DIFF_CHARS = 'not-a-number';
    process.env.INPUT_SUMMARY_STYLE = 'detailed';
    process.env.INPUT_LANGUAGE = 'en';
    process.env.INPUT_TRIGGER_EVENT = 'all';
    const { getInputs } = await import('../src/inputs.js');
    const inputs = getInputs();
    expect(inputs.maxDiffChars).toBe(120000);
    delete process.env.INPUT_GITHUB_TOKEN;
    delete process.env.INPUT_OPENAI_API_KEY;
    delete process.env.INPUT_OPENAI_BASE_URL;
    delete process.env.INPUT_MODEL;
    delete process.env.INPUT_MAX_DIFF_CHARS;
    delete process.env.INPUT_SUMMARY_STYLE;
    delete process.env.INPUT_LANGUAGE;
    delete process.env.INPUT_TRIGGER_EVENT;
  });

  it('falls back when summary-style is unknown', async () => {
    process.env.INPUT_GITHUB_TOKEN = 't';
    process.env.INPUT_OPENAI_API_KEY = 'k';
    process.env.INPUT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
    process.env.INPUT_MODEL = 'gpt-4o-mini';
    process.env.INPUT_MAX_DIFF_CHARS = '100000';
    process.env.INPUT_SUMMARY_STYLE = 'nonsense';
    process.env.INPUT_LANGUAGE = 'en';
    process.env.INPUT_TRIGGER_EVENT = 'all';
    const { getInputs } = await import('../src/inputs.js');
    const inputs = getInputs();
    expect(inputs.summaryStyle).toBe('detailed');
    delete process.env.INPUT_GITHUB_TOKEN;
    delete process.env.INPUT_OPENAI_API_KEY;
    delete process.env.INPUT_OPENAI_BASE_URL;
    delete process.env.INPUT_MODEL;
    delete process.env.INPUT_MAX_DIFF_CHARS;
    delete process.env.INPUT_SUMMARY_STYLE;
    delete process.env.INPUT_LANGUAGE;
    delete process.env.INPUT_TRIGGER_EVENT;
  });

  it('falls back when trigger-event is unknown', async () => {
    process.env.INPUT_GITHUB_TOKEN = 't';
    process.env.INPUT_OPENAI_API_KEY = 'k';
    process.env.INPUT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
    process.env.INPUT_MODEL = 'gpt-4o-mini';
    process.env.INPUT_MAX_DIFF_CHARS = '100000';
    process.env.INPUT_SUMMARY_STYLE = 'detailed';
    process.env.INPUT_LANGUAGE = 'en';
    process.env.INPUT_TRIGGER_EVENT = 'nonsense';
    const { getInputs } = await import('../src/inputs.js');
    const inputs = getInputs();
    expect(inputs.triggerEvent).toBe('all');
    delete process.env.INPUT_GITHUB_TOKEN;
    delete process.env.INPUT_OPENAI_API_KEY;
    delete process.env.INPUT_OPENAI_BASE_URL;
    delete process.env.INPUT_MODEL;
    delete process.env.INPUT_MAX_DIFF_CHARS;
    delete process.env.INPUT_SUMMARY_STYLE;
    delete process.env.INPUT_LANGUAGE;
    delete process.env.INPUT_TRIGGER_EVENT;
  });
});

describe('buildCommentBody', () => {
  it('prepends the marker and trims the summary', () => {
    const body = buildCommentBody('  ## Summary\n  Hi\n  ');
    expect(body).toBe(`${COMMENT_MARKER}\n\n## Summary\n  Hi`);
  });
});

describe('buildErrorCommentBody', () => {
  it('includes both markers, a heading, and the error message', () => {
    const body = buildErrorCommentBody('LLM timed out');
    expect(body).toContain(COMMENT_MARKER);
    expect(body).toContain(ERROR_MARKER);
    expect(body).toContain('PR Summary — error');
    expect(body).toContain('LLM timed out');
  });

  it('truncates very long error messages', () => {
    const big = 'a'.repeat(5000);
    const body = buildErrorCommentBody(big);
    expect(body).toContain('(truncated)');
    expect(body.length).toBeLessThan(big.length);
  });
});

describe('findBotCommentId', () => {
  it('skips comments that are not bot comments', async () => {
    const list: CommentListClient = {
      list: vi.fn().mockResolvedValue({
        data: [{ id: 1, body: 'hello', user: { login: 'alice', type: 'User' } }]
      })
    };
    const id = await findBotCommentId(list, 'o', 'r', 1);
    expect(id).toBeNull();
  });

  it('skips comments with null bodies', async () => {
    const list: CommentListClient = {
      list: vi.fn().mockResolvedValue({
        data: [{ id: 1, body: null, user: null } satisfies PrComment]
      })
    };
    const id = await findBotCommentId(list, 'o', 'r', 1);
    expect(id).toBeNull();
  });
});

describe('upsertComment', () => {
  it('uses create when no existing bot comment is found', async () => {
    const create = vi.fn().mockResolvedValue({ data: { id: 100 } });
    const update = vi.fn();
    const apis: CommentApis = {
      list: { list: vi.fn().mockResolvedValue({ data: [] }) },
      create: { create, update } as unknown as CommentWriteClient
    };
    await expect(upsertComment(apis, 'o', 'r', 1, 'body')).resolves.toBe(100);
    expect(create).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      issue_number: 1,
      body: 'body'
    });
  });

  it('uses update when a bot comment is found', async () => {
    const create = vi.fn();
    const update = vi.fn().mockResolvedValue({ data: { id: 5 } });
    const apis: CommentApis = {
      list: {
        list: vi.fn().mockResolvedValue({
          data: [{ id: 5, body: `${COMMENT_MARKER} old`, user: null }]
        })
      },
      create: { create, update } as unknown as CommentWriteClient
    };
    await expect(upsertComment(apis, 'o', 'r', 1, 'new body')).resolves.toBe(5);
    expect(update).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      comment_id: 5,
      body: 'new body'
    });
    expect(create).not.toHaveBeenCalled();
  });
});
