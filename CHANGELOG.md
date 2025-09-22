# @addon-core/storage

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
