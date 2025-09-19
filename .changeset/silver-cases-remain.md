---
"@addon-core/storage": patch
---

#### 0.1.1 — Patch (upcoming)

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
