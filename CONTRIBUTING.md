# Contributing to pr-summary

Thanks for your interest in contributing! This document covers everything you need to make a change, run the test suite, and open a pull request.

## Project layout

```
.
├── action.yml                 # GitHub Action manifest
├── src/                       # TypeScript source
│   ├── comment.ts             # Build + upsert bot comments
│   ├── diff.ts                # Fetch + chunk the PR diff
│   ├── index.ts               # Action entrypoint
│   ├── inputs.ts              # Parse action inputs / env
│   ├── main.ts                # Orchestration
│   ├── prompt.ts              # System + user prompt templates
│   ├── summarize.ts           # OpenAI client + chunked summarisation
│   └── types.ts               # Shared types
├── __tests__/                 # Vitest test suites
├── dist/                      # Bundled single-file action (COMMITTED)
├── examples/                  # Sample workflows + fixtures
├── scripts/                   # Build helpers (example-comment generator)
├── .github/workflows/         # CI, release-please, publish
└── examples/                  # User-facing workflow examples
```

## Development setup

Requirements: **Node 18+** and **npm 9+**. The repository ships an `npm` lockfile; please use `npm` to keep CI reproducible.

```bash
git clone https://github.com/wardsvelds2l/pr-summary
cd pr-summary
npm install
npm run all
```

`npm run all` runs `lint`, `typecheck`, `test`, and `bundle` in sequence — the same target CI uses. To work iteratively:

| Command | Purpose |
| --- | --- |
| `npm run lint` | ESLint over `src/` and `__tests__/`. |
| `npm run typecheck` | `tsc --noEmit` against the strict `tsconfig.json`. |
| `npm test` | Vitest once. |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run test:coverage` | Vitest with v8 coverage (≥90% on `src/`). |
| `npm run build` | Compile TypeScript to `lib/` (only used as a sanity check). |
| `npm run bundle` | Run `ncc` to produce `dist/index.js` + source map. |

## Rebuilding `dist/` after `src/` changes

`dist/index.js` is the **single file that GitHub Actions actually executes** when someone uses `wardsvelds2l/pr-summary@v0`. Unlike a normal npm package, a GitHub Action needs the bundled output present in the repo at the tagged commit.

After changing anything under `src/`:

```bash
npm run bundle
git add dist/
git commit -m "chore: rebuild dist"
```

CI runs the same `npm run bundle` step and a follow-up **`dist-sync`** job that fails the build if `git diff --exit-code dist/index.js` shows pending changes. If your PR modifies `src/` and CI complains, you forgot to rebuild.

## Coding style

- TypeScript strict mode is on. Avoid `any` (it is currently `warn`, not `error`).
- Prettier 3 with the repo's `.prettierrc` (single quotes, 2 spaces, no trailing commas, LF). Run `npm run format` before pushing.
- ESLint extends `@typescript-eslint/recommended` and `eslint-config-prettier`. Unused variables must start with `_`.
- Public functions and exported types should carry short TSDoc comments when their behaviour is not obvious from the name.

## Tests

- Tests live in `__tests__/` and use **Vitest**.
- Each new feature should add at least one unit test; every bug fix should add a regression test that fails on `main`.
- Coverage thresholds: `src/index.ts` and `src/types.ts` are excluded (pure entrypoints). All other files should stay above 90% lines.
- When mocking the OpenAI SDK, mirror the existing pattern in `__tests__/main.test.ts` (`vi.hoisted` + `vi.mock('openai', ...)`).

## Commit messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/) so that `release-please` can produce release notes and bump the version automatically:

```
feat(summarizer): add streaming support
fix(comment): handle null author in PR comments
docs: clarify Anthropic compatibility note
chore: rebuild dist
test: add chunkFiles edge cases
```

Types we use: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `build`, `ci`, `chore`, `perf`. Breaking changes add a `!` after the type/scope and a `BREAKING CHANGE:` footer.

## Pull request process

1. Open an issue first for non-trivial changes so we can agree on the approach.
2. Fork the repo, create a branch from `main`, and push your commits.
3. Make sure `npm run all` passes locally.
4. Make sure `npm run test:coverage` stays above 90%.
5. **Rebuild `dist/`** if you touched `src/` (see above).
6. Open a PR against `main`. The PR template will guide you through the checklist.
7. Expect review within a few days. Squash-merge is the default; release-please will then cut the next release.

## Release process

- `release-please` opens a release PR whenever conventional commits land on `main`.
- Merging the release PR creates a `vX.Y.Z` tag.
- The `publish.yml` workflow then runs `npm publish --provenance --access public` (requires the `NPM_TOKEN` secret on the repo).

## Developer Certificate of Origin (DCO)

We use the [DCO](https://developercertificate.org/) in lieu of a CLA. By contributing you agree to the DCO; in practice this means sign-off on every commit:

```bash
git commit -s -m "feat: your change"
```

The `-s` flag appends a `Signed-off-by: Your Name <you@example.com>` line using your local `git config user.name` and `user.email`. The DCO bot will block PRs that contain unsigned commits.

## Reporting security issues

**Do not open a public GitHub issue for security vulnerabilities.** Follow the process in [`SECURITY.md`](./SECURITY.md) — we accept reports through GitHub Security Advisories only.
