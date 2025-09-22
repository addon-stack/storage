---
"@addon-core/storage": minor
---

added storage providers and utilities:

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