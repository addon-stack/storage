// Staged/preview semantic-release config (no publish), for release/* branches
const {commonPlugins} = require("./shared.cjs");

module.exports = {
    // Preview-only config for release/* branches. No publish plugins, no npm/github/git actions.
    branches: ["release/*"],
    plugins: [...commonPlugins],
};
