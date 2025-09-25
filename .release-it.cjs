// release-it configuration with Conventional Commits and custom templates
// Docs: https://github.com/release-it/release-it and https://github.com/release-it/conventional-changelog

/** @type {import('release-it').Config} */
module.exports = {
    plugins: {
        "@release-it/conventional-changelog": {
            preset: "conventionalcommits",
            infile: "CHANGELOG.md",
            // Customize sections and writer options
            presetConfig: {
                types: [
                    {type: "feat", section: "Features", hidden: false},
                    {type: "fix", section: "BugFixed", hidden: false},
                    {type: "perf", section: "Performance Improvements", hidden: false},
                    {type: "refactor", section: "Refactoring", hidden: false},
                    {type: "docs", section: "Documentation", hidden: false},
                    {type: "test", section: "Tests", hidden: true},
                    {type: "build", section: "Build System", hidden: false},
                    {type: "ci", section: "CI", hidden: false},
                    {type: "chore", section: "Chores", hidden: true},
                    {type: "revert", section: "Reverts", hidden: false}
                ]
            },
            writerOpts: {
                // Per-release header with package name, version and date
                headerPartial: "## 🚀 {{#if @root.pkg}}{{@root.pkg.name}} {{/if}}{{version}} ({{date}})\n\n",
                // Show full commit body for each entry
                commitPartial:
                    "{{#if type}}* {{#if scope}}**{{scope}}:** {{/if}}{{#if subject}}{{subject}}{{else}}{{header}}{{/if}}\n\n{{~#if body}}{{{body}}}\n{{/if}}{{/if}}",
                groupBy: "type",
                commitGroupsSort: "title",
                commitsSort: ["scope", "subject"]
            }
        }
    },
    git: {
        requireCleanWorkingDir: true,
        requireUpstream: false,
        requireBranch: false,
        commit: true,
        commitMessage: "chore(release): v${version} [skip ci]",
        tag: true,
        tagName: "v${version}",
        tagAnnotation: "v${version}",
        push: true
    },
    npm: {
        publish: true,
        // Do not run npm version; release-it updates package.json itself
        // Set to false to prevent creating a git tag via npm
        versionArgs: ["--no-git-tag-version"]
    },
    github: {
        release: true,
        releaseName: "🚀 ${name} ${version} (${date,YYYY-MM-DD})"
    },
    // Default to CI mode in CI environments
    ci: true
};
