# @addon-core/storage

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
