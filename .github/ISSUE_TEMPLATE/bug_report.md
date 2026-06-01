---
name: Bug report
about: Report something broken or unexpected
title: "bug: "
labels: ["bug"]
assignees: []
---

## Action version

What version of the action did you use? (For example `wardsvelds2l/pr-summary@v0` resolves to a specific commit/tag — please pin it: `wardsvelds2l/pr-summary@v0.2.0` or `@<full-sha>`.)

## Environment

- **Runner OS:** (e.g. `ubuntu-latest`, `macos-latest`, `windows-latest`)
- **Node version:** (the runner default is usually 20; the action also supports 18 and 22)
- **LLM provider / model:** (e.g. `openai/gpt-4o-mini`, `groq/llama-3.1-70b-versatile`, self-hosted)
- **`openai-base-url`:** (omit if you used the default)
- **PR size:** (approximate number of files changed and total diff size)

## Workflow snippet

Please paste the relevant step(s) from your `.github/workflows/*.yml`. **Redact all secrets** (`${{ secrets.OPENAI_API_KEY }}` etc.) and any tokens — leave the variable names, not the values.

```yaml
- uses: wardsvelds2l/pr-summary@v0
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
    # openai-base-url: ...
    # model: ...
    # max-diff-chars: ...
    # summary-style: ...
    # language: ...
    # trigger-event: ...
```

## Expected behavior

What you expected the action to do.

## Actual behavior

What it actually did. Please include the action's log output (the section between `::group::` markers is most useful).

```text
<paste the action's log output here>
```

## Reproduction

Smallest possible repro: a link to (or inline text of) a PR that triggers the bug.

## Anything else?

Screenshots, links, related issues, guesses about root cause. All welcome.
