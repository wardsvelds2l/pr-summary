# pr-summary

[![CI](https://github.com/anomalyco/pr-summary/actions/workflows/ci.yml/badge.svg)](https://github.com/anomalyco/pr-summary/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)

A GitHub Action that generates a structured, LLM-written summary for every pull request and posts it as a single, idempotent comment.

## Why this exists

Reviewing pull requests is the bottleneck of every mid-size engineering team. Reviewers spend the first 5–10 minutes of every PR just reconstructing the change in their head: "what files moved, what was added, what's the risk?". On a healthy team with dozens of PRs a day, that is hours of low-value reading.

PR Summary automates the first pass. When a PR is opened, updated, or reopened, the action pulls the diff, sends it to an OpenAI-compatible LLM, and posts a single comment with sections for **Summary**, **What changed**, **Why**, **Risks**, and **Test plan**. The comment is keyed by a hidden HTML marker, so subsequent runs update the same comment instead of spamming the PR with duplicates. Reviewers can glance at the summary and dive straight into the files that matter.

## Quick start

```yaml
# .github/workflows/pr-summary.yml
name: PR Summary
on:
  pull_request:
    types: [opened, reopened, synchronize]

permissions:
  pull-requests: write

jobs:
  summary:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anomalyco/pr-summary@v0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
```

That's it. The action will post (and update on every push) a single summary comment.

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `github-token` | yes | — | GitHub token used to read the diff and post the comment. |
| `openai-api-key` | yes | — | API key for an OpenAI-compatible LLM endpoint. |
| `openai-base-url` | no | `https://api.openai.com/v1` | Base URL for the OpenAI-compatible API. Works with Azure, Together, Groq, OpenRouter, local llama.cpp, etc. |
| `model` | no | `gpt-4o-mini` | Model name passed to the LLM. |
| `max-diff-chars` | no | `120000` | If the diff exceeds this many characters, it is split by file and summarized per-file, then a meta-summary is generated. |
| `summary-style` | no | `detailed` | `detailed` (sections) or `brief` (3 bullets). |
| `language` | no | `en` | BCP-47 language tag for the comment. Supported: `en`, `ru`, `ja`, `zh`, `es`, `fr`, `de`, `pt`, `ko`, `it`, `tr`, `ar`, `hi`, `pl`, `uk`. Other tags fall back to English. |
| `trigger-event` | no | `all` | `opened` runs only on `opened`/`reopened`; `all` also runs on `synchronize`. |

## Outputs

| Name | Description |
| --- | --- |
| `comment-id` | ID of the posted or updated bot comment. |
| `summary-length` | Character length of the generated summary. |

## Example output

```markdown
<!-- pr-summary-bot -->

## Summary
Adds a CSV exporter to the report service, splits the existing renderer into smaller helpers, and introduces a cache layer to avoid re-parsing large files on every request.

## What changed
- File: src/reports/exporter.ts — added `toCsv(report)` with streaming and proper escaping
- File: src/reports/render.ts — split monolithic `render()` into `layout()`, `rows()`, `footer()` helpers
- File: src/reports/cache.ts — added TTL-based cache for parsed report payloads
- File: src/reports/__tests__/exporter.test.ts — covers escaping, streaming, and empty inputs

## Why
The legacy `render()` had grown to 600 lines and was the top contributor to slow first-paint on the reports page. This refactor paves the way for the new CSV download feature requested in PROJ-482 without regressing existing performance.

## Risks
- The cache invalidation is keyed on `report.updatedAt`; if upstream writes bypass the ORM, stale data may be served for up to 5 minutes
- The CSV exporter does not currently support multi-sheet workbooks (follow-up issue tracked in PROJ-491)
- Renaming `render()` internals could break any third-party plugin that monkey-patches the function

## Test plan
- Add round-trip CSV tests with quoted fields, embedded newlines, and Unicode
- Verify cache hit/miss metrics under `npm run bench`
- Smoke-test the dashboard with the cache disabled to confirm no behavioral regressions
```

## Comparison to alternatives

There are several existing tools in this space. PR Summary tries to be the simplest one that still does the job well.

- **[github-copilot-summarize](https://github.com/marketplace/actions/copilot-summarize)** — Uses GitHub Copilot's API and is tightly coupled to GitHub-hosted Copilot. PR Summary works with any OpenAI-compatible endpoint (Azure, Together, OpenRouter, llama.cpp) and is fully self-hostable.
- **[reviewnet](https://github.com/inspirezonetech/reviewnet)** — A learning-based model trained specifically for code review. Heavier to set up, requires a dedicated GPU or hosted inference endpoint, and is opinionated about review comments (not just summaries). PR Summary is a thin wrapper around an LLM you already pay for.
- **PR-Agent / QodanaPR** — More featureful (review, describe, improve, ask). Heavier: they include additional bot comments, more configuration, and a more opinionated prompt set. PR Summary is intentionally minimal: one summary, one comment, one LLM call.
- **DIY `openai-action` style scripts** — Many blogs show a 20-line workflow calling the OpenAI API directly. PR Summary adds the comment-marker idempotency, per-file chunking, language switching, and error-fallback behavior that those scripts typically lack.

The honest overlap: all of these will produce roughly similar text given the same model. PR Summary's edge is operational — idempotency, predictable costs, deterministic output, and a single bundled `dist/index.js` with zero runtime dependencies.

## Cost considerations

Costs depend entirely on the model and the size of the diff. As a rough guide with `gpt-4o-mini` at current list prices (early 2024):

- **Small PR (1–5 files, < 20k chars)**: a single completion, well under $0.005.
- **Typical PR (10–30 files, 20–80k chars)**: still a single completion, $0.005–$0.02.
- **Large PR (50+ files, triggers chunking)**: 1 per-file call + 1 meta-summary call per batch, $0.01–$0.05 total.
- **Self-hosted llama.cpp / Ollama**: effectively free, but you trade latency and quality.

You can cap spend by lowering `max-diff-chars` (forcing chunking at a smaller threshold) and by choosing a cheaper model.

## Limitations

- **Diff size cap.** Beyond roughly 200k characters the per-file chunking strategy still works, but the meta-summary will start to lose detail. For very large PRs, consider splitting the work into multiple workflow runs.
- **LLM hallucination risk.** The summary is generated by a model. It may mis-describe a change, miss a subtle side effect, or invent a risk that does not exist. **Always read the diff yourself.** The summary is a starting point, not a substitute for review.
- **Token cost.** Every `synchronize` push re-summarizes the PR. On a long-lived branch with many small commits, this can add up. Use `trigger-event: opened` to limit the action to the initial open and reopens.
- **Language support.** The action supports a fixed list of language tags (see the table above). Anything else falls back to English. The summary will be in the chosen language, but the section headings remain in English unless you fork the prompt.
- **Single model per run.** You cannot compare two models in the same workflow run.

## Contributing

Bug reports and pull requests are welcome. The repo is small on purpose — please open an issue first if you are planning a non-trivial change so we can agree on the approach.

Development setup:

```bash
git clone https://github.com/anomalyco/pr-summary
cd pr-summary
npm install
npm run typecheck
npm test
```

The repository ships an `npm run all` target that runs `lint`, `typecheck`, `test`, and `bundle` in sequence. CI runs the same target on every push and PR.

## License

MIT — see [LICENSE](./LICENSE).
