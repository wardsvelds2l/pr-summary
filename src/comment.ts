import { COMMENT_MARKER, ERROR_MARKER } from './inputs.js';

export interface CommentAuthor {
  login: string | null;
  type: string | null;
}

export interface PrComment {
  id: number;
  body: string | null;
  user: CommentAuthor | null;
}

export interface CommentListClient {
  list: (args: {
    owner: string;
    repo: string;
    issue_number: number;
    per_page: number;
    page?: number;
  }) => Promise<{ data: PrComment[] }>;
}

export interface CommentWriteClient {
  create: (args: {
    owner: string;
    repo: string;
    issue_number: number;
    body: string;
  }) => Promise<{ data: { id: number } }>;
  update: (args: {
    owner: string;
    repo: string;
    comment_id: number;
    body: string;
  }) => Promise<{ data: { id: number } }>;
}

export interface CommentApis {
  list: CommentListClient;
  create: CommentWriteClient;
}

export async function findBotCommentId(
  client: CommentListClient,
  owner: string,
  repo: string,
  issueNumber: number,
  marker: string = COMMENT_MARKER
): Promise<number | null> {
  const response = await client.list({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100
  });
  for (const comment of response.data) {
    if (comment.body && comment.body.includes(marker)) {
      return comment.id;
    }
  }
  return null;
}

export async function upsertComment(
  apis: CommentApis,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<number> {
  const existing = await findBotCommentId(apis.list, owner, repo, issueNumber, COMMENT_MARKER);
  if (existing !== null) {
    const updated = await apis.create.update({
      owner,
      repo,
      comment_id: existing,
      body
    });
    return updated.data.id;
  }
  const created = await apis.create.create({
    owner,
    repo,
    issue_number: issueNumber,
    body
  });
  return created.data.id;
}

export function buildCommentBody(summary: string): string {
  return [COMMENT_MARKER, '', summary.trim()].join('\n');
}

export function buildErrorCommentBody(message: string): string {
  return [
    COMMENT_MARKER,
    ERROR_MARKER,
    '',
    '## PR Summary — error',
    '',
    'The action could not generate a summary for this pull request.',
    '',
    '```',
    truncate(message, 1500),
    '```',
    '',
    '> Please check the workflow run logs for the full stack trace.'
  ].join('\n');
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}\n... (truncated)`;
}
