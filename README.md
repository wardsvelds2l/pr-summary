# pr-summary

> Drop-in GitHub Action that posts AI-generated summaries of pull request diffs as a single idempotent comment. Works with any OpenAI-compatible API (OpenAI, Azure OpenAI, Groq, OpenRouter, Anthropic via proxy, local LLMs).

[![CI](https://github.com/wardsvelds2l/pr-summary/actions/workflows/ci.yml/badge.svg)](https://github.com/wardsvelds2l/pr-summary/actions/workflows/ci.yml)
[![GitHub release](https://img.shields.io/github/v/release/wardsvelds2l/pr-summary.svg)](https://github.com/wardsvelds2l/pr-summary/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://github.com/wardsvelds2l/pr-summary/blob/main/package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![codecov](https://codecov.io/gh/wardsvelds2l/pr-summary/branch/main/graph/badge.svg)](https://codecov.io/gh/wardsvelds2l/pr-summary)

---

## Why

Reviewing pull requests is the bottleneck of every mid-size engineering team. The first 5–15 minutes of every PR go to reconstructing the change in the reviewer's head: *what files moved, what was added, what is the risk?* On a healthy team with dozens of PRs a day, that is hours of low-value reading.

`pr-summary` automates the first pass. On every `pull_request` (opened, reopened, or synchronize) the action:

1. Fetches the unified diff from the GitHub API.
2. Sends it to an **OpenAI-compatible LLM** of your choice (OpenAI, Groq, OpenRouter, Azure, Ollama, LM Studio, Anthropic via a proxy — anything that speaks `/v1/chat/completions`).
3. Posts a single comment with structured sections — **Summary**, **What changed**, **Why**, **Risks**, **Test plan** — or a 3-bullet **brief** version.
4. Updates the same comment on subsequent pushes instead of spamming the PR.

Reviewers can glance at the summary, jump straight to the files that matter, and skip the diff on a no-op PR. No vendor lock-in, no per-seat fees, and the action is fully self-hostable.

## Quick start

### Use in a GitHub Action workflow

Create `.github/workflows/pr-summary.yml` in your repo:

```yaml
name: PR Summary
on:
  pull_request:
    types: [opened, reopened, synchronize]

permissions:
  contents: read
  pull-requests: write

jobs:
  summary:
    runs-on: ubuntu-latest
    steps:
      - uses: wardsvelds2l/pr-summary@v0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
```

Add an `OPENAI_API_KEY` secret and you are done. The action will post (and update on every push) a single summary comment.

### Run locally (development / testing)

```bash
git clone https://github.com/wardsvelds2l/pr-summary.git
cd pr-summary
npm install
npm run all          # typecheck → lint → test → build → bundle
```

`dist/index.js` is the bundled action entrypoint (built with `@vercel/ncc`). It is meant to run inside the GitHub Actions runtime — it expects `GITHUB_TOKEN`, `OPENAI_API_KEY`, and `INPUT_*` environment variables injected by the runner.

For local testing you can:
- Use [`act`](https://github.com/nektos/act) to run the action locally.
- Run the example script that generates a comment from a patch:
  ```bash
  npm run examples:comment
  ```
- Execute the test suite:
  ```bash
  npm test
  ```

## Demo

Below is the actual comment `pr-summary` would post for the synthetic PR in [`examples/sample-diff.patch`](./examples/sample-diff.patch) (8 files, 250 lines — a reports service gaining an in-process cache, an RFC-4180 CSV renderer, a small structured logger, and an ESM migration). The script that produces this output from the patch is `scripts/generate-example-comment.ts`; regenerate it with `npm run examples:comment`.

```markdown
<!-- pr-summary-bot -->

## Summary
Introduces a 5-minute in-process cache for the report lookup endpoint, adds an RFC-4180-compliant CSV renderer with a streaming variant, and ships a tiny structured logger. The service is migrated to ESM and the README is updated to describe the new behaviour.

## What changed
- File: src/api/reports.ts — added Cache and logger imports; introduced in-process caching for GET /reports/:id with X-Cache HIT/MISS headers
- File: src/services/report-service.ts — added optional `format` field, new `exportCsv(id)` method, and `invalidateCacheFor(id)` helper
- File: src/services/csv-renderer.ts — new module providing `renderCsv()` and `streamCsv()` helpers with RFC-4180 escaping
- File: src/lib/cache.ts — new module with a generic TTL+LRU Cache class used by the reports route
- File: src/lib/logger.ts — new module exposing a tiny structured JSON logger (debug/info/warn/error)
- File: src/api/reports.test.ts — new vitest specs covering cache HIT/MISS behaviour and the exportCsv error path
- File: package.json — set the package to ESM via "type": "module"
- File: README.md — documented the new GET /reports/:id endpoint, caching semantics, and CSV export helper

## Why
Reports on the dashboard are the slowest first-paint in the app because every fetch re-parses large rows. Caching the parsed payload in-process is a cheap, zero-dependency fix that fits the existing single-instance deployment, and the CSV export unblocks the spreadsheet download flow requested by the analytics team.

## Risks
- In-process cache means each replica has its own view; with N replicas the effective miss rate stays roughly 1/N for the TTL window
- The LRU cap of 1000 entries is silent — under heavy churn, older reports get evicted before their TTL
- `invalidateCacheFor` only bumps `updated_at`; if upstream writes bypass the ORM, the cache will serve stale data for up to 5 minutes
- CSV export assumes the first row defines the column set; heterogeneous rows will silently drop fields not present in `rows[0]`
- Migrating to ESM is breaking for any consumer doing `require("reports-service")` — flagged in the breaking change notes

## Test plan
- Add round-trip CSV tests for quoted fields, embedded newlines, and Unicode characters
- Verify cache HIT/MISS metrics under `npm run bench` with a cold and warm process
- Smoke-test the dashboard with the cache disabled to confirm no behavioural regressions
- Force a write outside the ORM and assert that the cache invalidation actually expires the entry
```

`summary-style: brief` produces just three bullets — useful for high-traffic repos that want a glance-friendly comment.

## Configuration reference

| Input | Required | Default | Description | Example |
| --- | --- | --- | --- | --- |
| `github-token` | yes | `${{ github.token }}` | GitHub token used to read the diff and post the comment. | `secrets.GITHUB_TOKEN` |
| `openai-api-key` | yes | — | API key for the OpenAI-compatible endpoint. | `secrets.OPENAI_API_KEY` |
| `openai-base-url` | no | `https://api.openai.com/v1` | Base URL of the OpenAI-compatible API. | `https://api.groq.com/openai/v1` |
| `model` | no | `gpt-4o-mini` | Model name passed to the LLM. | `claude-3-5-sonnet-latest` (via proxy) |
| `max-diff-chars` | no | `120000` | If the diff exceeds this many characters, it is split by file and summarised per-file, then a meta-summary is generated. | `40000` (small-context local models) |
| `summary-style` | no | `detailed` | `detailed` (sections) or `brief` (3 bullets). | `brief` |
| `language` | no | `en` | BCP-47 language code. Supported: `en, ru, ja, zh, es, fr, de, pt, ko, it, tr, ar, hi, pl, uk`. Unknown codes fall back to English. | `ja` |
| `trigger-event` | no | `all` | `opened` runs only on opened/reopened; `all` also runs on `synchronize`. | `opened` |

### Outputs

| Output | Description |
| --- | --- |
| `comment-id` | Numeric ID of the posted or updated bot comment. |
| `summary-length` | Character length of the generated summary (excluding the bot marker). |

### Example workflows

The [`examples/`](./examples) directory contains ready-to-paste workflows:

- [`examples/minimal-workflow.yml`](./examples/minimal-workflow.yml) — the smallest possible workflow.
- [`examples/detailed-workflow.yml`](./examples/detailed-workflow.yml) — every input set explicitly, with comments.
- [`examples/multilingual.yml`](./examples/multilingual.yml) — posts summaries in English, Russian, and Japanese in parallel jobs.
- [`examples/anthropic-compat.yml`](./examples/anthropic-compat.yml) — fronting Anthropic with LiteLLM or OpenRouter (Anthropic's first-party API is not OpenAI-compatible).
- [`examples/self-hosted-llm.yml`](./examples/self-hosted-llm.yml) — Ollama and LM Studio setups.

## Cost & performance

Costs depend entirely on the model and the size of the diff. The numbers below are estimates for `summary-style: detailed` against an 8-file, ~5000-line synthetic PR (≈ 90 kB unified diff).

| Model | Approx. cost / PR | Notes |
| --- | --- | --- |
| `gpt-4o-mini` | $0.002 – $0.008 | Default. Best price/perf for most teams. |
| `gpt-4o` | $0.03 – $0.08 | Higher quality; recommended for security-sensitive repos. |
| `claude-3-5-sonnet-latest` (via LiteLLM/OpenRouter) | $0.04 – $0.10 | Strongest reasoning; best for large refactors. |
| `claude-3-5-haiku-latest` (via LiteLLM/OpenRouter) | $0.005 – $0.015 | Cheap and fast; comparable to `gpt-4o-mini`. |
| Local `llama3.1:8b` (Ollama) | $0 | Hardware and electricity only. ~5–15 s/PR on a single A100/4090. |
| Local `qwen2.5-coder:7b` (LM Studio) | $0 | Slightly better code reasoning; ~10–20 s/PR on consumer GPUs. |

A large PR that triggers chunking costs roughly **N + 1** LLM calls (N per-file summaries + 1 meta-summary). Lower `max-diff-chars` to force chunking at a smaller threshold if you want predictable per-call cost caps; raise it to reduce call count.

### Action processing time (no LLM, no network)

Measured on Node 22, Linux, single core, 50 iterations per operation. The action's own CPU work is **negligible** — the cost is dominated by the LLM round-trip and the diff fetch.

| Operation | Synthetic diff size | Mean time |
| --- | --- | --- |
| `splitDiffByFile` (small) | 4.3 kB | 0.02 ms |
| `splitDiffByFile` (medium) | 93 kB | 0.19 ms |
| `splitDiffByFile` (large) | 482 kB | 0.65 ms |
| `splitDiffByFile` (huge) | 774 kB | 1.12 ms |
| `chunkFiles` (large, 50 kB batch) | 482 kB | 0.66 ms |
| `buildSystemPrompt(detailed, ru)` | — | 0.0002 ms |
| `buildUserPrompt(50 kB diff)` | — | 0.0007 ms |
| `buildPerFileSystemPrompt(ja)` | — | 0.0001 ms |
| `buildMetaUserPrompt(50 lines)` | — | 0.006 ms |

`npm run bundle` (ncc 0.38.4, TypeScript 5.9) takes ~2.8 s wall-clock on the same machine. The shipped `dist/index.js` is **1.94 MB** (2037 762 bytes, before gzip; the npm tarball is 843 kB packed).

## How it works

```
┌────────────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  pull_request      │     │ GitHub REST API  │     │ OpenAI-compatible    │
│  (opened / sync)   │     │  GET /repos/.../  │     │ /v1/chat/completions │
│                    │     │      pulls/:n     │     │                      │
└─────────┬──────────┘     │   (media: diff)  │     └──────────┬───────────┘
          │                └────────┬─────────┘                │
          │                         │                          │
          ▼                         ▼                          │
   ┌─────────────┐         ┌────────────────┐                   │
   │ skip if not │         │ unified diff   │                   │
   │ PR event /  │         │ (string)       │                   │
   │ eligible    │         └────────┬───────┘                   │
   │ action      │                  │                           │
   └─────────────┘                  ▼                           │
                          ┌──────────────────────┐              │
                          │  diff.ts             │              │
                          │  - splitDiffByFile   │              │
                          │  - chunkFiles        │              │
                          └────────┬─────────────┘              │
                                   │                            │
                       diff ≤ N     │     diff > N              │
                       (default 120k)   (chunked mode)         │
                                   │                            │
                                   ▼                            ▼
                          ┌─────────────────────────────────────────────┐
                          │  prompt.ts (system + user)                   │
                          │  summarize.ts (OpenAI client, chat call)    │
                          └────────────────────┬────────────────────────┘
                                               │
                                               ▼
                                ┌────────────────────────────┐
                                │ Markdown summary           │
                                │ (Summary / What / Why / …)  │
                                └────────┬───────────────────┘
                                         │
                                         ▼
                          ┌─────────────────────────────┐
                          │  comment.ts                 │
                          │  1. listComments → find     │
                          │     comment w/ marker       │
                          │  2. update if found          │
                          │     else create             │
                          └────────┬────────────────────┘
                                   │
                                   ▼
                          ┌─────────────────────────────┐
                          │ One bot comment on the PR   │
                          │ (updated, not duplicated)   │
                          └─────────────────────────────┘
```

## Idempotency & comment management

Every bot comment starts with an invisible HTML marker:

```markdown
<!-- pr-summary-bot -->
```

Before posting, the action calls `GET /repos/:owner/:repo/issues/:n/comments?per_page=100` and searches the response for a comment whose body contains the marker. If found, it issues `PATCH /repos/.../comments/:id` with the new body. If not, it issues `POST /repos/.../comments`. The marker therefore:

- Prevents duplicate comments when the action runs more than once for the same PR.
- Survives force-pushes: the comment ID is preserved because the action updates the existing comment rather than creating a new one.
- Is invisible in the rendered PR view (browsers treat `<!-- … -->` as an HTML comment).

On unrecoverable errors the action still posts — but with a distinct **error** marker:

```markdown
<!-- pr-summary-bot -->
<!-- pr-summary-bot:error -->
```

…so a human reviewer's next pass sees a clear "summary failed — see logs" note rather than a stale or empty summary.

## Diff chunking

Above the `max-diff-chars` threshold (default 120 000), the action switches from a single LLM call to a **per-file + meta-summary** strategy:

1. `splitDiffByFile` splits the unified diff by `diff --git` header.
2. `chunkFiles` packs files into batches that respect `max-diff-chars / 2` per batch.
3. Each file is sent to the LLM with the **per-file** system prompt — a single-line "File: path — change" template.
4. The collected per-file lines are sent back to the LLM with the **detailed** or **brief** template, which produces the final structured summary.

This is what allows the action to summarise 200-file PRs on models with 8 k–32 k context windows. Lower `max-diff-chars` for very small context windows; raise it (up to ~250 k) when running on a 200 k-token model like `gpt-4o` or `claude-3-5-sonnet`.

## Comparison

| | **pr-summary** | Copilot PR Summarise | PR-Agent / QodanaPR | DIY `openai-action` |
| --- | --- | --- | --- | --- |
| **Cost** | Pay for LLM tokens only | Bundled with Copilot seat | Pay for LLM tokens | Pay for LLM tokens |
| **Model choice** | Any OpenAI-compatible API | GitHub-hosted Copilot only | Any OpenAI-compatible API | Any OpenAI-compatible API |
| **Idempotent** | ✅ HTML marker | ✅ Built-in | ✅ Built-in | ❌ manual |
| **Custom prompts** | ✅ fork src | ❌ closed | ⚠️ limited config | ✅ |
| **Per-file chunking** | ✅ built-in | ⚠️ partial | ✅ | ❌ |
| **Multi-language** | ✅ 15 languages | ⚠️ English only | ⚠️ | ❌ |
| **Open source** | ✅ MIT | ❌ proprietary | ✅ Apache 2.0 | ✅ |
| **Self-hostable** | ✅ bring your own LLM | ❌ | ✅ | ✅ |
| **Marketplace Action** | ✅ | ✅ | ✅ | varies |
| **Single-file bundle** | ✅ 1.94 MB | n/a | ❌ multi-file | varies |

`pr-summary`'s edge is operational: it does **one thing** (one summary, one comment, one LLM call per chunk) with a strict 0-dependency-runtime bundle and predictable costs.

## Limitations

- **Diff size cap.** Beyond ≈ 200 k characters the per-file chunking still works, but the meta-summary will start to lose detail. For very large PRs, consider splitting into multiple workflow runs.
- **LLM hallucination risk.** The summary is generated by a model. It may mis-describe a change, miss a subtle side effect, or invent a risk that does not exist. **Always read the diff yourself.** The summary is a starting point, not a substitute for review.
- **Token cost.** Every `synchronize` push re-summarises the PR. On a long-lived branch with many small commits this adds up. Use `trigger-event: opened` to limit runs to the initial open and reopens.
- **Language support.** The action supports a fixed list of language tags (see the table above). Anything else falls back to English. The summary is written in the chosen language, but the section headings remain in English unless you fork the prompt.
- **Anthropic requires a proxy.** Anthropic's first-party API does **not** speak the OpenAI protocol. Use LiteLLM, OpenRouter, or another proxy. See [`examples/anthropic-compat.yml`](./examples/anthropic-compat.yml).
- **No code-aware understanding.** The action is text-only — it does not run the diff, parse an AST, or follow cross-file references. Summaries are best-effort over the diff as text.
- **No multi-turn conversation.** Each run is independent. There is no "summarise the changes since the last review" feature.

## Security

- The action sends the **unified diff** of each PR to the configured OpenAI-compatible endpoint (`openai-base-url`). If your PRs contain secrets in the diff, those secrets will be sent to the LLM provider — but a secret embedded in the diff is already a much bigger problem (it is in your git history).
- The action is stateless. It does not write to disk, ship telemetry, or contact any service other than GitHub and your LLM provider.
- The default `github-token` is the workflow-provided `GITHUB_TOKEN`. It has read access to the PR diff and write access to issue comments; it does **not** have write access to the repository contents.
- The bundled `dist/index.js` is built from `src/` using `@vercel/ncc` and is reproducible with `npm ci && npm run bundle`. CI runs a `dist-sync` job that fails the build if `dist/` is out of sync with `src/`.

To report a vulnerability, follow the process in [`SECURITY.md`](./SECURITY.md). We use GitHub Security Advisories only.

## Roadmap

- **PR review suggestions** — extend the per-file prompt to flag risky patterns (e.g. SQL string concatenation, unchecked env reads) with citations back to the diff.
- **Multi-file aggregation improvements** — detect and merge near-duplicate file summaries to reduce token cost.
- **Inline comment mode** — instead of a single comment, post inline review comments anchored to file:line. Optional, off by default.
- **GitLab CI support** — the prompt / summarise layer is provider-agnostic; only `src/main.ts` and `src/diff.ts` are GitHub-specific.

## Contributing

We welcome PRs! Start with [`CONTRIBUTING.md`](./CONTRIBUTING.md). Highlights:

- `npm install` → `npm run all` to get to a passing build.
- New behaviour needs tests; we run the full Vitest suite in CI on Node 20/22 × Linux/macOS/Windows.
- **After changing anything under `src/`, run `npm run bundle` and commit `dist/` in the same PR** — GitHub Actions executes the bundle, not the source. CI has a `dist-sync` check that will fail your PR if you forget.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) so `release-please` can cut releases automatically.
- Sign-off (`git commit -s`) is required (DCO).

## License

[MIT](./LICENSE) — © pr-summary contributors.

## Acknowledgments

- The [GitHub Actions toolkit](https://github.com/actions/toolkit) (`@actions/core`, `@actions/github`) and the [`@vercel/ncc`](https://github.com/vercel/ncc) bundler.
- The [OpenAI Node SDK](https://github.com/openai/openai-node), which gives us a clean OpenAI-compatible client for the same code path to talk to OpenAI, Azure, Groq, OpenRouter, Together, Ollama, LM Studio, llama.cpp, and Anthropic via a proxy.
- The [actions/toolkit `typescript-action` template](https://github.com/actions/typescript-action) for the bundling conventions.
- The [Contributor Covenant](https://www.contributor-covenant.org/) for the Code of Conduct.
- Anthropic, OpenAI, and the broader LLM community for the models that make this kind of action possible.
