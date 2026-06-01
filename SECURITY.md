# Security

The pr-summary maintainers take security seriously. Thank you for helping us keep the project and its users safe.

## Supported versions

| Version | Supported |
| ------- | --------- |
| `v0.2.x` | ✅ Active |
| `v0.1.x` | ⚠️ Critical fixes only — please upgrade |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Use GitHub's private Security Advisories flow:

1. Go to <https://github.com/wardsvelds2l/pr-summary/security/advisories/new>
2. Fill in a clear title and a detailed description:
   - What is the impact?
   - Which version(s) are affected?
   - What is the reproduction / proof of concept?
   - Are there any workarounds?
3. Submit. Only the maintainer team will see the report.

We aim to **acknowledge** new reports within 72 hours and ship a fix or mitigation
within 30 days for high-severity issues, faster for critical ones. We follow
[coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure):
please give us a reasonable window before publishing details.

## What we will not do

- We do **not** operate a public security@ mailbox for this project. Use the GitHub Advisories tab.
- We do **not** accept vulnerability reports via social media, comments on commits, or pull requests.
- We will not pursue legal action against researchers who act in good faith and stay within the coordinated-disclosure window.

## What you should know about running this action

- The action sends the unified diff of every pull request to the configured OpenAI-compatible endpoint (`openai-base-url`). If your repository's PRs contain secrets in the diff (they shouldn't), those secrets will be sent to the LLM provider.
- The action stores nothing; every run is stateless. There is no database, no log shipping, and no telemetry.
- The default `github-token` input is the workflow-provided `GITHUB_TOKEN`, which has read access to the PR diff and write access to issue comments. It does not have write access to the repository contents.
- The bundled `dist/index.js` is built from `src/` using `@vercel/ncc`; you can verify the build is reproducible with `npm ci && npm run bundle` and diffing against the committed `dist/`.

## Acknowledgments

Researchers who report valid vulnerabilities will be credited in the release notes unless they ask to remain anonymous.
