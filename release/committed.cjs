// Production/committed semantic-release config (publishes from main)
const {commonPlugins} = require("./shared.cjs");

module.exports = {
    branches: ["main"],
    plugins: [
        ...commonPlugins,
        ["@semantic-release/changelog", {changelogFile: "CHANGELOG.md"}],
        ["@semantic-release/exec", {prepareCmd: "npm run build"}],
        ["@semantic-release/npm", {npmPublish: true}],
        "@semantic-release/github",
        [
            "@semantic-release/git",
            {
                assets: ["CHANGELOG.md", "package.json"],
                message: "chore(release): ${nextRelease.version}",
            },
        ],
    ],
};
