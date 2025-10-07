# Contributing to @addon-core/storage

Thank you for your interest in contributing! This document describes how we work, the conventions we follow, and the
practical steps to get your changes merged and released.

- Project: `@addon-core/storage`
- License: MIT
- Primary language: TypeScript
- Target environment: browser extensions (WebExtensions)

Please also read and follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Table of contents
- Principles and workflow
- Git branching model (Simplified GitFlow)
- Commit messages (Conventional Commits)
- What affects versioning (SemVer policy)
- Release process (release-it + GitHub Actions)
- Code style and quality
- Local development
- Running tests
- Pull requests
- Security

---

## Principles and workflow
We value clarity, automation, and a predictable release cadence. We use:
- Simplified GitFlow (no release/* or hotfix/* branches) for branching and release discipline.
- Conventional Commits to generate CHANGELOG and calculate version bumps.
- release-it to cut releases and publish to npm and GitHub.
- Biome for formatting and linting; Jest for tests.

## Git branching model (Simplified GitFlow)
We follow a simplified GitFlow:
- `main` — production-ready branch. Merging a PR into `main` triggers a publish release.
- `develop` — integration branch for upcoming work (default target for feature PRs). After each successful release, we merge `main` back into `develop` to keep versions and files in sync.
- `feature/*` — feature branches cut from `develop`. Example: `feature/secure-storage-iv`.

Typical flows:
- New work: branch from `develop` into `feature/<name>`, open PR into `develop`.
- Release: open a pull request from the chosen base branch (typically `develop`) into `main`. After merge, CI publishes a new version and npm package. Then merge `main` back into `develop` to sync.

Note: We do not use `release/*` or `hotfix/*` branches.

## Commit messages (Conventional Commits)
We enforce Conventional Commits via commitlint. The general format is:

```
<type>(<optional scope>): <subject>

<body>

<footer>
```

Common types used in this repository:
- `feat`: a new feature
- `fix`: a bug fix
- `perf`: performance improvement
- `refactor`: code change that neither fixes a bug nor adds a feature
- `docs`: documentation only changes
- `test`: adding or updating tests
- `build`: changes that affect the build system or external dependencies
- `ci`: changes to CI configuration or scripts
- `chore`: other changes that don’t modify src or test files
- `revert`: reverts a previous commit

Examples:
- `feat(storage): add namespace support to getAll()`
- `fix(secure): handle invalid cipher text in decrypt()`
- `perf(mono): reduce allocations in shallowEqual()`
- `docs: expand README with React adapter examples`
- `ci: update release pipeline`

Breaking changes:
- Indicate with `!` after the type or include a `BREAKING CHANGE:` footer.
  - Example: `feat!: remove deprecated watch signature`
  - Footer example:
    ```
    BREAKING CHANGE: SecureStorage now requires a secureKey.
    ```

## What affects versioning (SemVer policy)
Version bumps are derived from commit history via `@release-it/conventional-changelog` and our policy:
- MAJOR (`x.0.0`) — any commit containing `BREAKING CHANGE` notes.
- MINOR (`0.y.0`) — `feat` and `revert` commits.
- PATCH (`0.0.z`) — `fix`, `perf`, `refactor`, `ci`.
- No bump by default — `docs`, `test`, `chore`, `build` (these do not trigger an automatic release by themselves).

Notes:
- If multiple types are present, the highest applicable level wins.
- Only visible types appear in the generated CHANGELOG; some meta types are hidden from release notes.

## Release process (release-it + GitHub Actions)
We automate releases with [release-it](https://github.com/release-it/release-it) and GitHub Actions.

Branches/Triggers:
- Pull requests into `main`: CI runs checks and may run a release dry-run (no tag, no publish) to validate versioning and the
  generated notes.
- `main` (on merge): CI runs a Release Publish that will:
  - determine the next version from commits (SemVer + Conventional Commits),
  - update `CHANGELOG.md`,
  - create a Git tag `vX.Y.Z` and a GitHub Release,
  - publish to npm with provenance.

Local release commands (maintainers):
- Preview locally: `npm run release:preview`
- Publish locally: `npm run release` (requires `GITHUB_TOKEN` and `NPM_TOKEN` env vars)

Important:
- Do not manually edit `CHANGELOG.md` for released versions — it’s generated.
- Ensure the intended changes are in `develop` (or the chosen base branch) before opening a PR to `main`.
- After a successful release, merge `main` back into `develop` to keep versions and files in sync.
- We do not use `release/*` or `hotfix/*` branches.

## Code style and quality
We use [Biome](https://biomejs.dev/) for formatting and linting. Key rules from `biome.json`:
- Formatting: 4 spaces, line width 120, double quotes, semicolons, ES5 trailing commas.
- Import organization enabled.
- Linting: recommended rules on; `noExplicitAny` is disabled; provider base file may be lint-disabled where needed.

Commands:
- Format (check): `npm run format:check`
- Format (write): `npm run format`
- Lint (check): `npm run lint`
- Lint (fix): `npm run lint:fix` or `npm run lint:fix:unsafe`
- Type-check: `npm run typecheck`

Pre-commit hooks:
- We use Husky + lint-staged. Staged files are formatted and related tests run automatically.
- Commit messages are validated by commitlint.

## Local development
Prerequisites:
- Node.js 20 (same as CI)
- npm (or your preferred package manager)

Setup:
- Install deps: `npm install`
- Build one-off: `npm run build`
- Build in watch mode: `npm run dev`

Project layout:
- Source: `src/`
- Tests: `tests/`
- Build artifacts: `dist/`

## Running tests
We use Jest with jsdom and WebExtensions mocks.
- Run tests: `npm test`
- CI mode: `npm run test:ci`
- Only affected tests for staged changes (via lint-staged): `npm run test:related`

Authoring tests:
- Prefer black-box tests for the public API (@addon-core/storage, providers, React adapter).
- Mock `chrome.storage` if needed (e.g., `jest-webextension-mock`).

## Pull requests
Checklist for contributors:
- [ ] Branch from `develop`.
- [ ] Follow code style and run locally:
  - `npm run format:check && npm run lint && npm run typecheck && npm test`
- [ ] Write or update tests when applicable.
- [ ] Use Conventional Commits for each commit; prefer small, focused commits.
- [ ] Update docs (README, examples) if the public API changes.
- [ ] For breaking changes, clearly call out the impact and migration steps in the PR description.

Review process:
- At least one maintainer approval is required.
- Squash or rebase may be used to keep a clean history; commit messages must remain Conventional.

## Security
If you discover a security issue, please do not open a public issue. Instead, email the maintainers at
`addonbonedev@gmail.com` with the details. We will coordinate a fix and disclosure.

Thank you for contributing!