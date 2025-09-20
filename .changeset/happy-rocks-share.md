---
"@addon-core/storage": patch
---

add check for raw changeset files and improve npm publishing

- Added a pre-publish step in `release-publish.yml` to identify and prevent publishing with raw changeset files on the main branch.
- Updated the publish action to use `npm run release`.
- Enhanced `release-prepare.yml` to disable Husky and force push changes in branch preparation.
