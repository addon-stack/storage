# Changelog

## 🚀 Release `@addon-core/storage` v0.4.0 (2025-10-07)


### ✨ Features

* enhance watch callbacks with key differentiation ([97e4557](https://github.com/addon-stack/storage/commit/97e45572da416e9d04619db1b5715a2ecf2595d8))

  - Updated `watch` to include key-specific callbacks and pass key names to global callbacks.
  - Refactored `StorageWatchOptions` into separate callback types for consistency.
  - Adjusted tests to validate key-specific callback behavior and new parameters.
  - Improved error handling in `AbstractStorage` for unhandled key changes.



### 📝 Documentation

* update README and CONTRIBUTING guidelines for clarity ([aa79667](https://github.com/addon-stack/storage/commit/aa79667541fb440e1f1ebf45a24c06e650001e77))

  - Expanded peer dependency details in README (including @types/react-dom).
  - Updated descriptions for `watch()` callbacks and `getAll()` behavior.
  - Clarified SecureStorage key formatting for namespaced storage.
  - Improved MonoStorage `watch()` explanation with deep comparison info.
  - Revised CONTRIBUTING.md to align with a Simplified GitFlow model.
  - Removed references to `release/*` and `hotfix/*` branches in release process.



### 🤖 CI

* replace release workflows with unified release pipeline ([a39f5d4](https://github.com/addon-stack/storage/commit/a39f5d4a4d13254e94724608161d2b8edcb8f927))

  - Consolidated `release-prepare.yml` and `release-publish.yml` into a single `release.yml`.
  - Streamlined CI with dynamic matrix computation for better flexibility and coverage.
  - Updated `.release-it.cjs` with enhanced contributor logic and changelog formatting.
  - Introduced `.gitattributes` to enforce consistent line endings across the repo.
  - Improved biome configuration to exclude coverage and dist directories.



### 🧹 Chores

* update dependencies and replace @adnbn/browser with @addon-core/browser ([fa3bbaa](https://github.com/addon-stack/storage/commit/fa3bbaad4f913d3b42365239694023442831ac38))

  - Updated `@addon-core/browser` to v0.2.1, replacing `@adnbn/browser`.
  - Bumped multiple Jest-related dependencies to v30.2.0 for consistency.
  - Included new transitive dependency `signal-exit` v4.1.0.



### 🛠️ Refactoring

* replace shallowEqual with `dequal` for deep equality checks ([d2a5e43](https://github.com/addon-stack/storage/commit/d2a5e43fcfa8100d6dee954293c4f2ec596f9846))

  - Removed custom `shallowEqual` method in favor of using `dequal` for better accuracy.
  - Updated `MonoStorage` logic to apply deep equality checks with imported `dequal`.
  - Adjusted `.gitignore` with additional entries for environment and build artifacts.
  - Updated `package-lock.json` with `dequal` dependency and removed unused modules.




### 🙌 Contributors

- [Addon Stack](https://github.com/addon-stack) (@addon-stack) — 5 commits
- [Addon Stack](addonbonedev@gmail.com) — 2 commits

## 🚀 Release `@addon-core/storage` v0.3.6 (2025-09-26)

### 🛠️ Refactoring

* update release-it config to hide unused sections ([1ce0a4d](https://github.com/addon-stack/storage/commit/1ce0a4d19dbba5c7a04806f6d683506970f44ceb))

  - Updated configuration to hide `docs`, `build`, and `chore` sections in changelogs.
  - Removed `chore` and `build` from patch types for version bump logic.
  - Added `releaseName` field in GitHub releases for better naming consistency.

* update release-it configuration for better npm publish ([ae54a77](https://github.com/addon-stack/storage/commit/ae54a77e7a603c8b842d2b2771bd847532e508f9))

## 🚀 Release `@addon-core/storage` v0.3.5 (2025-09-26)

### 🐛 Bug Fixed

* **release-it:** remove redundant `releaseName` field from config ([92bfca4](https://github.com/addon-stack/storage/commit/92bfca48d19c2dcbaa9b08c022f1e8b5d34b0a16))

  - Deleted the `releaseName` field under the GitHub section as it is not used.
  - Simplifies the configuration for release management.


### 🛠️ Refactoring

* update release-it config to hide unused sections ([1ce0a4d](https://github.com/addon-stack/storage/commit/1ce0a4d19dbba5c7a04806f6d683506970f44ceb))

  - Updated configuration to hide `docs`, `build`, and `chore` sections in changelogs.
  - Removed `chore` and `build` from patch types for version bump logic.
  - Added `releaseName` field in GitHub releases for better naming consistency.

* update release-it configuration for better npm publish ([ae54a77](https://github.com/addon-stack/storage/commit/ae54a77e7a603c8b842d2b2771bd847532e508f9))

## 🚀 Release `@addon-core/storage` v0.3.4 (2025-09-25)

### 🐛 Bug Fixed

* **ci:** migrate from semantic-release to release-it ([157a07b](https://github.com/addon-stack/storage/commit/157a07ba454bd29d0cd5f2460774aa2209f229e9))

  - Removed all semantic-release-related configurations and workflows.
  - Added release-it configurations for preview and publish workflows.
  - Updated package dependencies to replace semantic-release with release-it.

* **release-it:** add shorthash fallback and adjust release name format ([af14a46](https://github.com/addon-stack/storage/commit/af14a46768cdf91c6938e141448250fa8db99bc7))


* **release-it:** remove redundant `releaseName` field from config ([92bfca4](https://github.com/addon-stack/storage/commit/92bfca48d19c2dcbaa9b08c022f1e8b5d34b0a16))

  - Deleted the `releaseName` field under the GitHub section as it is not used.
  - Simplifies the configuration for release management.

* **release-it:** update templates for consistent formatting and naming ([a8d5293](https://github.com/addon-stack/storage/commit/a8d52937443d61a92669d6908344a7f6996a50f2))


* **release-it:** use `Map.get` for type lookup in commit transformation ([6b697be](https://github.com/addon-stack/storage/commit/6b697bea35dc4ef1ee22e0150da009eda4300ccf))



### 🤖 CI

* add CI job and update npm install commands ([009ec1f](https://github.com/addon-stack/storage/commit/009ec1ff2dd3e9d23e6c6019b01934b07f98622b))

  - Introduced a reusable `ci` job in `release-publish.yml` and `release-prepare.yml` workflows.
  - Updated `npm ci` to `npm install` for dependency installation in both workflows.

* update workflows for release management and clean up dependencies ([85da77d](https://github.com/addon-stack/storage/commit/85da77d8ed7259920651f1d9099245a95edbb727))

  - Added `name` and `needs: ci` fields in `release-publish.yml` and `release-prepare.yml`.
  - Removed redundant `npm run build` step from `release-publish.yml`.
  - Cleaned up unused dependencies from `package-lock.json` for better maintenance.

* update workflows for release preparation and publishing ([af18584](https://github.com/addon-stack/storage/commit/af1858453d8459f8ffd7245d7468a20b95a7adfe))

  - Added Git user configuration step in `release-publish.yml` for commits made by workflows.
  - Enabled `hotfix/**` branch triggering in `release-prepare.yml` for flexible hotfix management.


### 🧹 Chores

* **release-it:** add repoUrl for commit links in changelogs ([5835e68](https://github.com/addon-stack/storage/commit/5835e6857f46fa2f055b97682f135e4f85c1f6ea))


* **release-it:** enhance configuration for structured release notes ([405a947](https://github.com/addon-stack/storage/commit/405a9473ce543c5f7af15d26438eefba7aae132c))

  - Added `context` to include package name in changelog and header templates.
  - Updated `headerPartial` and introduced `mainTemplate` for improved formatting.
  - Refined `commitPartial` to ensure proper handling of commit details.
  - Simplified npm and GitHub release configurations for consistency.

* **release-it:** refactor types configuration and enhance commit processing ([d11d849](https://github.com/addon-stack/storage/commit/d11d849daaca350d667b7f8a91f1eec44a2fa368))

  - Refactored type definitions into a shared `types` array with additional metadata.
  - Introduced `typesMap` for better type lookup and handling during commit transformation.
  - Updated `context` to reuse parsed package information from `package.json`.
  - Enhanced `transform` to filter out hidden commit types and reformat body content.
  - Adjusted sorting and templates for structured and consistent release notes generation.

* **release-it:** refine configuration for enhanced changelogs and bump logic ([034ea8a](https://github.com/addon-stack/storage/commit/034ea8ab24d008241e4908b2e914ccb7ab72b8b9))

  - Made "chore" commits visible in changelogs, aligning with structured release notes.
  - Enhanced `recommendedBumpOpts` to classify commit types and prioritize breaking changes.
  - Improved `writerOpts` templates for consistent formatting with fallback handling.
  - Adjusted `file` rules in `biome.json` for expanded file type handling in source and tests.


## 0.2.0

### Minor Changes

- [`906ed65`](https://github.com/addon-stack/storage/commit/906ed6515c090427e81d86dd8c3e0d10d313fb8d) Thanks [@addon-stack](https://github.com/addon-stack)! - added storage providers and utilities:

  - `Storage`, `SecureStorage`, `MonoStorage`
  - React hook `useStorage` for convenient use of storage in components
  - Factories `Storage.Local/Sync/Session`, namespace support, and `watch` for change subscriptions

  #### Infrastructure and tooling

  - migrate: switched to `Biome` for linting and code formatting
  - chore: updated `npm` scripts and configs for consistency and stability
  - chore: refined `lint-staged`, simplified pre-commit scripts
  - chore: mass auto-formatting and import ordering

  #### CI/CD and releases

  - chore: simplified release preparation — commit changes directly to the release branch
  - CI: current CI (type checks, tests, build, `npm pack --dry-run`) updated to match new scripts/linter

  #### Reference commits

  - feat: introduce Storage, SecureStorage, MonoStorage and useStorage hook — `4459fd5`
  - migrate to Biome — `2b4d1a3`
  - update scripts/configs — `8daee6b`
  - lint-staged/pre-commit tweaks — `4ed5053`, `5ad57ac`
  - simplify release workflow — `0365825`

## 0.1.6

### Patch Changes

- [`0365825`](https://github.com/addon-stack/storage/commit/0365825edde15539e507b0fc5c115d19afe9380e) Thanks [@addon-stack](https://github.com/addon-stack)! - simplify release workflow by committing changes directly to release branch

## 0.1.5

### Patch Changes

- [`cbbb134`](https://github.com/addon-stack/storage/commit/cbbb134d46b5de858459c6e2cf78bb7215b0d509) Thanks [@addon-stack](https://github.com/addon-stack)! - add Contributor Covenant Code of Conduct

## 0.1.4

### Patch Changes

- [`c997bd4`](https://github.com/addon-stack/storage/commit/c997bd48e3f5d01933c15a3c58c1835f430d277d) Thanks [@addon-stack](https://github.com/addon-stack)! - ### Improve release workflows for branch-based releases
  - Updated `release-publish.yml` to use `npm publish` with provenance and public access.
  - Enhanced token configurations for compatibility.
  - Modified `release-prepare.yml` to handle branch-based release preparation.
  - Added automatic branch creation and targeted PR updates for release branches.

## 0.1.3

### Patch Changes

- [`4018660`](https://github.com/addon-stack/storage/commit/40186609bdbe9933908060167b5f437b702ab8f9) Thanks [@addon-stack](https://github.com/addon-stack)! - Add MIT license to package and project files
  - Added `MIT` license to `package.json`.
  - Created `LICENSE.md` containing copyright and license details.

## 0.1.2

### Patch Changes

- [`40c75eb`](https://github.com/addon-stack/storage/commit/40c75ebeaa8960e5d7f483a84ddae24b7a347f03) Thanks [@addon-stack](https://github.com/addon-stack)! - ### Configure workflows for release preparation and publishing
  - Added `release-prepare.yml` to automate versioning and changelog generation with Changesets.
  - Renamed and updated `release.yml` to `release-publish.yml` for npm publishing.
  - Enhanced `ci.yml` workflow with support for workflow calls.
  - Updated Changesets configuration and added `release` script in `package.json`.

## 0.1.1

### Patch Changes

- [`120ca74`](https://github.com/addon-stack/storage/commit/120ca74dd515728179869a895d2b4e05686d6417) Thanks [@addon-stack](https://github.com/addon-stack)! - #### 0.1.1 — Patch (upcoming)

  - Added: CI workflow for automated releases via Changesets and npm publication.
  - Added: `commitlint` for commit message validation.
  - Style: Unified code formatting (double quotes, indentation).
  - Chore: Cleaned up unused dependencies and added `overrides` for `glob`.

  #### 0.1.0 — Initial Release

  - Introduced package `@addon-core/storage` with CJS/ESM/types exports.
  - Build: Configured bundling with `@rslib/core` (`build`, `dev`).
  - Tooling: Set up TypeScript, `Biome`, `ESLint`, `Prettier`, `Jest`, `husky`, and `lint-staged`.
  - Scripts: `typecheck`, `test`, `test:run`, `test:related`.
  - CI: Added `ci.yml` to run `biome check`, `typecheck`, tests, build, and `npm pack --dry-run`; includes Node 18/20/22 matrix for `main` and PRs to `main`.
  - Releases: Added `release.yml` using `changesets/action@v1` for creating release PRs or publishing to npm (`npm publish --provenance --access public`).
  - Changesets: Added
