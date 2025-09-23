module.exports = {
    // Preview-only config for release/* branches. No publish plugins, no npm/github/git actions.
    branches: ["release/*"],
    plugins: [
        "@semantic-release/commit-analyzer",
        "@semantic-release/release-notes-generator"
    ]
};
