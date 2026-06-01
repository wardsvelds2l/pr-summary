export type SummaryStyle = 'brief' | 'detailed';
export type TriggerEvent = 'opened' | 'all';

export type LanguageTag =
  | 'en'
  | 'ru'
  | 'ja'
  | 'zh'
  | 'es'
  | 'fr'
  | 'de'
  | 'pt'
  | 'ko'
  | 'it'
  | 'tr'
  | 'ar'
  | 'hi'
  | 'pl'
  | 'uk';

export interface ActionInputs {
  githubToken: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  model: string;
  maxDiffChars: number;
  summaryStyle: SummaryStyle;
  language: string;
  triggerEvent: TriggerEvent;
}

export interface FileChunk {
  path: string;
  body: string;
}

export interface ChunkSummary {
  path: string;
  body: string;
}

export interface SummaryRequest {
  diff: string;
  style: SummaryStyle;
  language: string;
  model: string;
}

export interface PerFileSummaryResult {
  files: ChunkSummary[];
  meta: string;
}
