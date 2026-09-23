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
- ESLint for formatting and linting; Jest for tests.

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
- MAJOR (`x.0.0`) — a breaking commit when the current version is `1.0.0` or newer.
- MINOR (`0.y.0`) — `feat` and `revert` commits, plus breaking commits while the package is on `0.x`.
- PATCH (`0.0.z`) — `fix`, `perf`, `refactor`, `ci`.
- No bump by default — `docs`, `test`, `chore`, `build` (these do not trigger an automatic release by themselves).

Notes:
- Both the `type!:` syntax and a `BREAKING CHANGE:`/`BREAKING-CHANGE:` footer use the same breaking policy.
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
We use [ESLint](https://eslint.org/) with TypeScript support and
[ESLint Stylistic](https://eslint.style/). The single configuration is `eslint.config.js`.

Formatting and lint rules:
- Four-space indentation, double quotes (except when escaping would be needed), semicolons, and LF line endings.
- No spaces inside object/import braces. Parentheses around a single untyped arrow parameter are omitted when possible.
- Trailing commas in multiline arrays, objects, imports, exports, enums, tuples, and type parameters, but not function arguments.
- One blank line before `return` and before/after `if`, `for`, `while`, `do`, and `switch` statements.
- One blank line around multiline statements and declarations (`project/padding-around-multiline`).
  This separates neighboring statements, without adding padding at file/block boundaries or between arguments,
  object/type/class members, imports, or re-exports in the same group. Comments stay with their statements.
- At most one consecutive blank line; no trailing whitespace. Imports and re-exports are sorted.
- Import groups (`project/import-order`, based on `simple-import-sort`), separated by one blank line:
  Node.js builtins → React and React DOM → external packages → current-directory dependencies (`./...`) →
  other internal dependencies → current-directory `./types` → root `src/types` → styles and assets.
  Groups follow the source module, including mixed type/value imports. `~` and `@tests` aliases belong to internal
  dependencies; root types are recognized through either relative imports or `~/types`.
- Imports from the same module are combined (`project/no-duplicate-imports`, based on `import-x/no-duplicates`), with inline `type` specifiers for types:
  `import {type StorageObserverSnapshot, StorageStatus} from "./types";`.
  This applies to any imported values, including functions, constants, classes, and enums.
  A module used only for types uses a single `import type` declaration. Explicit side-effect imports are preserved.
  Long imports may span multiple lines. Imports with attached comments may require a manual merge.
- Recommended JavaScript/TypeScript checks. Explicit `any` is allowed; unused parameters, catch bindings, and
  variables prefixed with `_` are allowed. Other unused bindings are reported rather than silently deleted.
- Compile-only fixtures (`tests/**/*.types.ts`) allow unused bindings and expressions used as type assertions.
  These exceptions do not apply to source files.
- JSON/JSONC use two-space indentation and expanded nonempty objects/arrays. JSON is strict; JSONC permits comments.
- A 120-column width remains a readability guideline. ESLint does not wrap arbitrary long expressions automatically.

Filename rules (`project/file-naming`):
- A module defining and exporting a regular class uses that class's PascalCase name, such as `Storage.ts`.
  Multiple exported classes belong in separate matching files. Re-export barrels may keep names such as `index.ts`.
- Exception classes extending `Error` (including native subclasses and local inheritance chains) may stay in their owning module.
- Other files use kebab-case, such as `use-storage.ts` and `web-locks.ts`.
- Tests use the subject's casing: `Storage.test.ts` or `use-storage.test.ts`.
  Dot-separated suffixes such as `.integration.test`, `.config`, and `.d` stay lowercase.
- Standard metadata names (`README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`,
  `LICENSE`, `LICENSE.md`, and `AGENTS.md`) are exempt.
- Non-code files participate only in filename checks; Markdown/YAML content is not formatted.
  Renames require updating imports and links. Dependencies, build output, coverage, the lockfile, and local editor/environment files are excluded.

Commands:
- Check linting and formatting without editing: `npm run lint` (errors and warnings fail).
- Apply available lint/format fixes: `npm run fix`.
- Fix staged files: `npm run lint:staged`.
- Type-check: `npm run typecheck`

Git hooks:
- Pre-commit runs `npm run lint:staged`, then `npm run test:all`.
  `lint-staged` applies fixes to staged files and automatically stages those fixes. Unstaged portions of partially
  staged files are hidden during formatting and restored afterward without being added to the commit.
- Non-fixable lint errors (including filename errors) stop the commit; lint-staged restores its pre-lint state on task failure.
  If tests fail after formatting succeeds, the fixes remain staged for review. Tests run against the working tree.
- Pre-push runs lint, typecheck, unit tests with coverage, tooling tests, and build without fixing source files.
- Commit messages are validated by commitlint.

## Local development
Prerequisites:
- Node.js 20.9 or newer (the default CI job uses Node.js 20)
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

Runtime tests use Jest + SWC. `jest.config.ts` defines three projects: `unit` and `integration` run in Node,
while `react` runs in jsdom. Tooling and release-policy tests run in Node's native ESM environment through
`jest.tooling.config.js`; `test:tooling` supplies the required `--experimental-vm-modules` flag.

Test layout:
- `tests/unit/`: batch planning, watch dispatch, and Web Locks coordination.
- `tests/integration/providers/`: real providers, grouped by behavior, plus shared Chrome/Firefox profile contracts.
- `tests/integration/helpers/`, `observer/`, `adapters/react/`: public helpers, observer lifecycle, and React hooks.
- `tests/support/`: the browser harness, Web Locks simulator, async gates, and encrypted fixtures.
- `tests/setup/`: environment installation and cleanup.
- `tests/types/`: compile-only fixtures; `tsconfig.exact.json` checks exact optional properties separately.
- `tests/consumer-types/`: installs the packed package and checks declarations with TypeScript 5.4/current and React 18/19.
- `tests/tooling/`: lint rules, Git hooks, and release policy.

Commands:
- All runtime projects: `npm test` (Jest arguments can be passed after `--`).
- A project: `npm test -- --selectProjects react` (or `unit`, `integration`).
- A file: `npm test -- --runTestsByPath tests/integration/providers/storage/crud.test.ts`.
- Tooling and release-policy tests: `npm run test:tooling`.
- Runtime and tooling suites: `npm run test:all`.
- CI mode with source coverage: `npm run test:ci`.
- Tests related to source files: `npm run test:related -- src/watch.ts`.
- Published consumer declarations: `npm run test:consumer-types`.
- Production, test, and exact-optional type checks: `npm run typecheck`.

Imports use aliases configured in TypeScript and the runtime Jest projects:
- `~` resolves to `src/index.ts`; `~/*` resolves within `src/`.
- `@tests/*` resolves within `tests/`, for example `@tests/support/browser`.
- Keep `./...` for neighboring modules; use aliases instead of climbing parent directories in source code and tests.
- Consumer declaration checks replace source aliases with published package entry points. Plain Node tooling scripts
  keep Node-compatible imports; TypeScript path mappings do not configure Node's runtime resolver.

```ts
import Storage from "~/providers/Storage";
import {browser} from "@tests/support/browser";

import type {StorageProvider} from "~/types";
```

Authoring tests:
- Exercise real providers and the real `@addon-core/browser` wrapper. Browser API simulation comes exclusively from
  `@addon-core/browser/testing`; do not add a second storage mock or patch provider reads to accommodate one.
- Import `browser` from `tests/support/browser.ts` for state inspection, call records, `failNext`, or exceptional raw events.
  Normal writes automatically emit `onChanged`; never emit the same event manually after a write.
- Harness controls are not Jest mocks. Assert `method.calls`, including `args`, `callback`, and `sequence` when relevant.
  `setResult`, `queueResult`, and `setImplementation` replace normal behavior; they do not persist data or emit changes.
- Supply managed policy data through constructor seeds, for example with `withBrowser`; managed writes must reject.
- Use real Web Crypto. Ciphertext fixtures use the public SecureStorage API. Targeted spies may control crypto failures
  or completion order; they must not replace encryption for the whole suite.
- Use deferred promises for races and contention. Use fake timers for timeout behavior. Native `flushChanges()` waits
  for returned listener work; detached provider queues need a consumer completion signal or a condition-based assertion.
- Dispose subscriptions and resolve controlled work. RTL unmounts hooks and the observer releases them before the next
  test resets the harness. The main harness keeps stable facade identity for the shared default observer.
- Chrome/Firefox profiles are testkit simulations, not proof of behavior in a real browser.

Hook tests use temporary Git clones to verify staging, partial staging, rollback, and ignored files without changing
this checkout's Git state. Formatting checks also verify that a second pass makes no further edits.

## Pull requests
Checklist for contributors:
- [ ] Branch from `develop`.
- [ ] Follow code style and run locally:
  - `npm run lint && npm run typecheck && npm run test:all && npm run build`
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
