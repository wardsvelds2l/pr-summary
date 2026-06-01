import * as core from '@actions/core';
import type { ActionInputs, SummaryStyle, TriggerEvent } from './types.js';

export const COMMENT_MARKER = '<!-- pr-summary-bot -->';
export const ERROR_MARKER = '<!-- pr-summary-bot:error -->';

export function getInputs(): ActionInputs {
  const summaryStyle = (core.getInput('summary-style') || 'detailed').toLowerCase();
  const triggerEvent = (core.getInput('trigger-event') || 'all').toLowerCase();
  const maxDiffCharsRaw = core.getInput('max-diff-chars') || '120000';

  return {
    githubToken: core.getInput('github-token') || process.env.GITHUB_TOKEN || '',
    openaiApiKey: core.getInput('openai-api-key') || process.env.OPENAI_API_KEY || '',
    openaiBaseUrl: core.getInput('openai-base-url') || 'https://api.openai.com/v1',
    model: core.getInput('model') || 'gpt-4o-mini',
    maxDiffChars: parsePositiveInt(maxDiffCharsRaw, 120000),
    summaryStyle: validateEnum<SummaryStyle>(summaryStyle, ['brief', 'detailed'], 'detailed'),
    language: (core.getInput('language') || 'en').toLowerCase(),
    triggerEvent: validateEnum<TriggerEvent>(triggerEvent, ['opened', 'all'], 'all')
  };
}

function parsePositiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return n;
}

function validateEnum<T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T
): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
