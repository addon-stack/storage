# Changelog

## 🚀 Release `@addon-core/storage` v0.3.2 (2025-09-25)

### 🐛 Bug Fixed

* **ci:** migrate from semantic-release to release-it ([157a07b](https://github.com/addon-stack/storage/commit/157a07ba454bd29d0cd5f2460774aa2209f229e9))

  - Removed all semantic-release-related configurations and workflows.
  - Added release-it configurations for preview and publish workflows.
  - Updated package dependencies to replace semantic-release with release-it.

* **release-it:** add shorthash fallback and adjust release name format ([af14a46](https://github.com/addon-stack/storage/commit/af14a46768cdf91c6938e141448250fa8db99bc7))


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

* update configurations for formatting consistency and file handling ([699854d](https://github.com/addon-stack/storage/commit/699854d787f23fe14ffde3d11d2cd89cf4befa67))

## 🚀 0.3.1


* re-enable and refine writerOpts for release configuration- Uncommented and refined `writerOpts` in `shared.cjs` for structured release notes.
- Enhanced `commitPartial` to properly handle `subject` fallback and `body` rendering.
- Restored and fine-tuned sorting for `type`, `scope`, and `subject` fields.
* **shared.cjs:** comment out writerOpts in release configuration- Temporarily disabled `writerOpts` block by commenting it out in `shared.cjs`.
- Ensures configuration is bypassed while retaining the original logic for reference.
* **ci:** improve commitPartial and release notes grouping logic- Updated `commitPartial` in `shared.cjs` to include `type` and `scope` formatting enhancements.
- Enabled grouping of commits by `type` with sorting on `scope` and `subject`.
- Adjusted `commitGroupsSort` and `commitsSort` for better structured release notes.
* **ci:** streamline release messaging and enhance template structure- Updated `committed.cjs` to remove release notes from commit message template.
- Improved `shared.cjs` by adjusting `commitPartial` to use headers for better readability.
- Added `headerPartial` to include version information in generated release notes.
* **ci:** update release-sync workflow and enhance commitPartial- Updated `release-sync.yml` to use `devmasx/merge-branch@master` for branch syncing.
- Migrated workflow syntax to use `from_branch` and `target_branch` for clarity.
- Improved `commitPartial` in `shared.cjs` by adjusting templates and ensuring better alignment.
- Enabled `hidden` attribute for all Semantic Release type presets.

## 0.3.0 (2025-09-24)

**ci:** add workflow to sync main into develop upon release

- Introduced `release-sync.yml` to automatically merge `main` into `develop` post-release.
- Utilizes `tibdex/merge-branch@v3` to handle the branch sync process.
- Triggers on successful completion of the `Release Publish` workflow.
**ci:** enhance commitPartial to properly handle type and scope checks

- Updated `commitPartial` template in `shared.cjs` to include a type check.
- Ensures release notes are generated only if a valid `type` is present.
add keywords, author, and contributors metadata

- Added `keywords` for improved discoverability of the package.
- Included `author` and `contributors` fields for better attribution.

## <small>0.2.3 (2025-09-23)</small>

Merge branch 'main' into develop

Merge branch 'release/next'

Merge remote-tracking branch 'origin/main'

standardize indentation and adjust lint-staged configuration

- Updated indentation in all Semantic Release config files for consistency.
- Standardized import format for `commonPlugins` across configs.
- Enhanced `lint-staged` and `biome.json` to include `.cjs` and `.mjs` file formats.
restructure Semantic Release configs and update workflows

- Moved release configs to `release` directory for better organization.
- Split shared plugins into `shared.cjs` for reduced duplication across configs.
- Updated `release-publish.yml` and `release-prepare.yml` to reference new config paths.
- Removed outdated `semantic-release.config.cjs` and `semantic-release.preview.cjs`.
- Excluded `src/types.ts` from the build entrypoint in `tsup.config.ts`.
migrate build tooling to `tsup` and update dependencies

- Replaced `@rslib/core` build config with `tsup` for a streamlined setup.
- Removed `.changeset` directory and `rslib.config.ts` as part of build tool migration.
- Updated `semantic-release.preview.cjs` indentation for consistency.
- Added `esbuild-fix-imports-plugin` and `tsup` to `devDependencies` for improved module bundling.
- Updated import in `useStorage.ts` to reflect proper module export.

## [0.2.2](https://github.com/addon-stack/storage/compare/v0.2.1...v0.2.2) (2025-09-23)


### Bug Fixes

* remove unused `--debug` flag from Semantic Release dry run ([9108ff3](https://github.com/addon-stack/storage/commit/9108ff3e5a257053a8f4c969d308e44714b20dec))

# @addon-core/storage

## 0.2.1

### Patch Changes

- [`e39a7db`](https://github.com/addon-stack/storage/commit/e39a7dbfe1c91bdb6ee6f9f50e08215304fd9ed8) Thanks [@addon-stack](https://github.com/addon-stack)! - update release workflow to run build step before publishing

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
