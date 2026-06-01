import * as core from '@actions/core';
import type { ActionInputs, SummaryStyle, TriggerEvent } from './types.js';

export const COMMENT_MARKER = '<!-- pr-summary-bot -->';
export const ERROR_MARKER = '<!-- pr-summary-bot:error -->';

export function getInputs(): ActionInputs {
  const summaryStyle = (core.getInput('summary-style') || 'detailed').toLowerCase();
  const triggerEvent = (core.getInput('trigger-event') || 'all').toLowerCase();
  const maxDiffCharsRaw = core.getInput('max-diff-chars') || '120000';

  const githubToken = core.getInput('github-token') || process.env.GITHUB_TOKEN || '';
  const openaiApiKey = core.getInput('openai-api-key') || process.env.OPENAI_API_KEY || '';
  const openaiBaseUrl = core.getInput('openai-base-url') || 'https://api.openai.com/v1';

  if (githubToken) core.setSecret(githubToken);
  if (openaiApiKey) core.setSecret(openaiApiKey);

  validateOpenAIBaseUrl(openaiBaseUrl);

  return {
    githubToken,
    openaiApiKey,
    openaiBaseUrl,
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

function isPrivate172(hostname: string): boolean {
  if (!hostname.startsWith('172.')) return false;
  const parts = hostname.split('.');
  if (parts.length < 2) return false;
  const secondOctet = Number.parseInt(parts[1], 10);
  return Number.isFinite(secondOctet) && secondOctet >= 16 && secondOctet <= 31;
}

function validateOpenAIBaseUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid openai-base-url: "${url}" is not a valid URL.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Invalid openai-base-url: "${url}" must use HTTPS.`);
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.startsWith('10.') ||
    isPrivate172(hostname) ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('169.254.')
  ) {
    throw new Error(`Invalid openai-base-url: "${url}" points to a private/local address.`);
  }
}
