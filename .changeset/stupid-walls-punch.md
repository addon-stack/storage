---
"@addon-core/storage": patch
---

### Configure workflows for release preparation and publishing

- Added `release-prepare.yml` to automate versioning and changelog generation with Changesets.
- Renamed and updated `release.yml` to `release-publish.yml` for npm publishing.
- Enhanced `ci.yml` workflow with support for workflow calls.
- Updated Changesets configuration and added `release` script in `package.json`.
