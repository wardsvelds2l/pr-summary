import OpenAI from 'openai';
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming
} from 'openai/resources/chat/index.js';
import { chunkFiles, splitDiffByFile } from './diff.js';
import {
  buildMetaSystemPrompt,
  buildMetaUserPrompt,
  buildPerFileSystemPrompt,
  buildSystemPrompt,
  buildUserPrompt
} from './prompt.js';
import type {
  ActionInputs,
  ChunkSummary,
  FileChunk,
  LanguageTag,
  PerFileSummaryResult,
  SummaryStyle
} from './types.js';

export interface Summarizer {
  summarizeDiff: (diff: string) => Promise<string>;
  summarizePerFile: (files: FileChunk[]) => Promise<PerFileSummaryResult>;
  summarizeInBatches: (diff: string) => Promise<string>;
}

export interface OpenAIClient {
  chat: {
    completions: {
      create: (
        args: ChatCompletionCreateParamsNonStreaming
      ) => Promise<ChatCompletion>;
    };
  };
}

export function createOpenAIClient(inputs: Pick<ActionInputs, 'openaiApiKey' | 'openaiBaseUrl'>): OpenAIClient {
  return new OpenAI({
    apiKey: inputs.openaiApiKey,
    baseURL: inputs.openaiBaseUrl,
    timeout: 60_000,
    maxRetries: 2,
  }) as unknown as OpenAIClient;
}

export function createSummarizer(client: OpenAIClient, inputs: ActionInputs): Summarizer {
  const style: SummaryStyle = inputs.summaryStyle;
  const language = inputs.language as LanguageTag;
  const model = inputs.model;

  return {
    summarizeDiff: (diff: string) => summarizeDiff(client, model, style, language, diff),
    summarizePerFile: (files: FileChunk[]) => summarizePerFile(client, model, language, files, style),
    summarizeInBatches: (diff: string) =>
      summarizeInBatches(client, inputs.maxDiffChars, model, style, language, diff)
  };
}

export async function summarizeDiff(
  client: OpenAIClient,
  model: string,
  style: SummaryStyle,
  language: LanguageTag,
  diff: string
): Promise<string> {
  const systemPrompt = buildSystemPrompt(style, language);
  const userPrompt = buildUserPrompt(diff);
  return callChat(client, model, systemPrompt, userPrompt);
}

export async function summarizePerFile(
  client: OpenAIClient,
  model: string,
  language: LanguageTag,
  files: FileChunk[],
  style: SummaryStyle = 'detailed'
): Promise<PerFileSummaryResult> {
  const perFileSystem = buildPerFileSystemPrompt(language);
  const chunkSummaries: ChunkSummary[] = [];

  for (const file of files) {
    const oneLine = await callChat(client, model, perFileSystem, file.body);
    chunkSummaries.push({ path: file.path, body: oneLine.trim() });
  }

  const metaSystem = buildMetaSystemPrompt(style, language);
  const metaUser = buildMetaUserPrompt(chunkSummaries.map((c) => c.body));
  const meta = await callChat(client, model, metaSystem, metaUser);

  return { files: chunkSummaries, meta };
}

export async function summarizeInBatches(
  client: OpenAIClient,
  maxDiffChars: number,
  model: string,
  style: SummaryStyle,
  language: LanguageTag,
  diff: string
): Promise<string> {
  if (diff.length <= maxDiffChars) {
    return summarizeDiff(client, model, style, language, diff);
  }

  const files = splitDiffByFile(diff);
  if (files.length === 0) {
    return summarizeDiff(client, model, style, language, diff.slice(0, maxDiffChars));
  }

  const batches = chunkFiles(files, Math.max(1, Math.floor(maxDiffChars / 2)));
  const perFileLines: string[] = [];

  const perFileSystem = buildPerFileSystemPrompt(language);
  for (const batch of batches) {
    for (const file of batch) {
      const summary = await callChat(client, model, perFileSystem, file.body);
      perFileLines.push(summary.trim());
    }
  }

  const metaSystem = buildMetaSystemPrompt(style, language);
  const metaUser = buildMetaUserPrompt(perFileLines);
  return callChat(client, model, metaSystem, metaUser);
}

async function callChat(
  client: OpenAIClient,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: 1024,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });
  const choice = response.choices[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('LLM returned an empty response');
  }
  return content;
}
