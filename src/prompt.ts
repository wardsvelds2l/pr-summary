import type { LanguageTag, SummaryStyle } from './types.js';

const LANGUAGE_NAMES: Record<LanguageTag, string> = {
  en: 'English',
  ru: 'Russian',
  ja: 'Japanese',
  zh: 'Chinese (Simplified)',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  ko: 'Korean',
  it: 'Italian',
  tr: 'Turkish',
  ar: 'Arabic',
  hi: 'Hindi',
  pl: 'Polish',
  uk: 'Ukrainian'
};

const STYLE_INSTRUCTIONS: Record<SummaryStyle, string> = {
  brief: [
    'Produce a concise summary of exactly 3 bullet points describing the most important changes.',
    'Each bullet must start with "- " and be at most 20 words.',
    'Do not include sections, headings, or other prose.'
  ].join(' '),
  detailed: [
    'Produce a detailed, structured PR summary in Markdown with EXACTLY these sections in this order:',
    '## Summary (2-3 sentence TL;DR)',
    '## What changed (bulleted list; one line per file in the form "- File: path — change")',
    '## Why (one short paragraph explaining the inferred intent)',
    '## Risks (bulleted list of potential issues, edge cases, or backward-compatibility concerns)',
    '## Test plan (bulleted list of suggested test cases or manual verification steps).',
    'Do not add any other sections or commentary.'
  ].join(' ')
};

export function buildSystemPrompt(style: SummaryStyle, language: LanguageTag): string {
  const langName = LANGUAGE_NAMES[language] ?? 'English';
  return [
    'You are a senior software engineer summarizing a pull request diff for reviewers.',
    'You are precise, you never invent information that is not present in the diff,',
    'and you prefer concise, factual language over speculation.',
    `Write the summary in ${langName}.`,
    STYLE_INSTRUCTIONS[style]
  ].join(' ');
}

export function buildUserPrompt(diff: string): string {
  return [
    'Here is the unified diff of a pull request. Summarize it as instructed.',
    'If a section has no relevant content, write "None." for that section (detailed mode) or skip it (brief mode).',
    '',
    '```diff',
    diff,
    '```'
  ].join('\n');
}

export function buildPerFileSystemPrompt(language: LanguageTag): string {
  const langName = LANGUAGE_NAMES[language] ?? 'English';
  return [
    'You are a senior software engineer summarizing a single file diff for a pull request.',
    'Return exactly one line of the form: "File: <path> — <one-sentence change description>".',
    'Use the file path as it appears in the diff header. Do not add prefixes, headings, or extra commentary.',
    `Write the description in ${langName}.`
  ].join(' ');
}

export function buildMetaSystemPrompt(style: SummaryStyle, language: LanguageTag): string {
  return buildSystemPrompt(style, language);
}

export function buildMetaUserPrompt(perFileLines: string[]): string {
  return [
    'You are given per-file summaries of a pull request. Produce the final structured PR summary',
    'as you would for a complete diff.',
    '',
    'Per-file summaries:',
    ...perFileLines.map((line, idx) => `${idx + 1}. ${line}`)
  ].join('\n');
}
