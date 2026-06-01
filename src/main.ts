import * as core from '@actions/core';
import * as github from '@actions/github';
import { buildCommentBody, buildErrorCommentBody, upsertComment } from './comment.js';
import { fetchDiff, splitDiffByFile } from './diff.js';
import { getInputs } from './inputs.js';
import { createOpenAIClient, createSummarizer } from './summarize.js';

export interface PullRequestPayload {
  number: number;
}

export interface RepoPayload {
  owner: string;
  repo: string;
}

export function isPullRequestEvent(eventName: string): boolean {
  return eventName === 'pull_request';
}

export function shouldRunForAction(
  action: string | undefined,
  triggerEvent: 'opened' | 'all'
): boolean {
  if (action !== 'opened' && action !== 'reopened' && action !== 'synchronize') {
    return false;
  }
  if (triggerEvent === 'opened') {
    return action === 'opened' || action === 'reopened';
  }
  return true;
}

export function resolveContext(
  eventName: string,
  payload: unknown,
  _repo: RepoPayload
): { ok: true; number: number; action: string | undefined } | { ok: false; reason: string } {
  if (!isPullRequestEvent(eventName)) {
    return { ok: false, reason: `event "${eventName}" is not pull_request` };
  }
  const pr = (payload as { pull_request?: PullRequestPayload } | undefined)?.pull_request;
  if (!pr || typeof pr.number !== 'number') {
    return { ok: false, reason: 'pull_request payload missing' };
  }
  const action = (payload as { action?: string } | undefined)?.action;
  return { ok: true, number: pr.number, action };
}

export async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    const context = resolveContext(github.context.eventName, github.context.payload, {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo
    });

    if (!context.ok) {
      core.debug(`Skipping: ${context.reason}`);
      return;
    }

    if (!shouldRunForAction(context.action, inputs.triggerEvent)) {
      core.debug(
        `Skipping: action "${context.action}" is not eligible for trigger-event "${inputs.triggerEvent}"`
      );
      return;
    }

    if (!inputs.openaiApiKey) {
      throw new Error('openai-api-key input is required');
    }

    const octokit = github.getOctokit(inputs.githubToken);
    const octokitAny = octokit as unknown as {
      pulls: { get: (args: unknown) => Promise<{ data: unknown }> };
      issues: {
        listComments: (args: unknown) => Promise<{ data: unknown }>;
        createComment: (args: unknown) => Promise<{ data: { id: number } }>;
        updateComment: (args: unknown) => Promise<{ data: { id: number } }>;
      };
    };
    const diff = await fetchDiff(
      { pulls: { get: octokitAny.pulls.get } },
      github.context.repo.owner,
      github.context.repo.repo,
      context.number
    );

    core.debug(`Fetched diff of ${diff.length} characters`);

    const openai = createOpenAIClient(inputs);
    const summarizer = createSummarizer(openai, inputs);

    let summary: string;
    if (diff.length > inputs.maxDiffChars) {
      const files = splitDiffByFile(diff);
      core.debug(`Diff exceeds ${inputs.maxDiffChars} chars; chunking across ${files.length} files`);
      const perFile = await summarizer.summarizePerFile(files);
      summary = perFile.meta;
    } else {
      summary = await summarizer.summarizeDiff(diff);
    }

    const body = buildCommentBody(summary);
    const listArgs: Parameters<typeof upsertComment>[0]['list'] = {
      list: octokitAny.issues.listComments as never
    };
    const createArgs: Parameters<typeof upsertComment>[0]['create'] = {
      create: octokitAny.issues.createComment as never,
      update: octokitAny.issues.updateComment as never
    };
    const commentId = await upsertComment(
      { list: listArgs, create: createArgs },
      github.context.repo.owner,
      github.context.repo.repo,
      context.number,
      body
    );

    core.setOutput('comment-id', String(commentId));
    core.setOutput('summary-length', String(summary.length));
    core.info(`Posted summary (id=${commentId}, length=${summary.length})`);
  } catch (err) {
    await handleError(err);
  }
}

async function handleError(err: unknown): Promise<void> {
  const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  core.debug(`pr-summary failed: ${message}`);

  try {
    const inputs = getInputs();
    const context = resolveContext(github.context.eventName, github.context.payload, {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo
    });
    if (!context.ok) {
      core.warning(`pr-summary failed before PR context was available: ${message}`);
      return;
    }
    const octokit = github.getOctokit(inputs.githubToken);
    const octokitAny = octokit as unknown as {
      issues: {
        listComments: (args: unknown) => Promise<{ data: unknown }>;
        createComment: (args: unknown) => Promise<{ data: { id: number } }>;
        updateComment: (args: unknown) => Promise<{ data: { id: number } }>;
      };
    };
    const body = buildErrorCommentBody(message);
    const id = await upsertComment(
      {
        list: { list: octokitAny.issues.listComments as never },
        create: {
          create: octokitAny.issues.createComment as never,
          update: octokitAny.issues.updateComment as never
        }
      },
      github.context.repo.owner,
      github.context.repo.repo,
      context.number,
      body
    );
    core.setOutput('comment-id', String(id));
    core.warning('pr-summary posted an error comment instead of failing the action.');
  } catch (inner) {
    const innerMsg = inner instanceof Error ? inner.message : String(inner);
    core.warning(`pr-summary failed and could not post an error comment: ${innerMsg}`);
  }
}
