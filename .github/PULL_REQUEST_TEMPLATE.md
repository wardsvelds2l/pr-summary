---
name: Pull request
about: Submit a change to pr-summary
---

<!--
Thanks for taking the time to send a PR! The checklist below is the same one
the CI workflow enforces. If you cannot tick all the boxes, your PR will be
asked to fix them before merge.
-->

## What does this PR do?

One or two sentences. Link the issue it closes with `Closes #123` or `Fixes #123`.

## Type of change

- [ ] Bug fix (`fix:`)
- [ ] New feature (`feat:`)
- [ ] Refactor / internal (`refactor:`)
- [ ] Documentation (`docs:`)
- [ ] CI / tooling (`ci:`, `chore:`, `build:`)
- [ ] Other (describe in summary)

## Checklist

- [ ] I read [`CONTRIBUTING.md`](../../CONTRIBUTING.md) and followed the local dev steps.
- [ ] `npm run lint` passes locally.
- [ ] `npm run typecheck` passes locally.
- [ ] `npm test` passes locally.
- [ ] `npm run test:coverage` keeps coverage at or above the project threshold (≥90% on `src/`).
- [ ] New behaviour is covered by tests, and existing tests still pass.
- [ ] I added or updated documentation for user-facing changes (README, examples, or `action.yml`).
- [ ] If I changed anything under `src/`, I ran `npm run bundle` and committed the updated `dist/` in the same PR.
- [ ] If this is a **breaking change**, I added a `BREAKING CHANGE:` footer to the commit message and a migration note in the PR description.
- [ ] Commit messages follow Conventional Commits.
- [ ] Commits are signed off (`git commit -s`).

## Screenshots / logs

If the change affects the rendered PR comment, paste before/after samples. If it affects runtime behaviour, paste the action's log output.

## Notes for reviewers

Anything reviewers should pay particular attention to, or that you deliberately did not do.
