/** @type {import('release-it').Config} */
module.exports = {
    plugins: {
        "@release-it/conventional-changelog": {
            preset: "conventionalcommits",
            infile: "CHANGELOG.md",
            context: {
                name: require("./package.json").name,
                pkg: {name: require("./package.json").name}
            },
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
                headerPartial: "## 🚀 {{#if name}}{{name}} {{else}}{{#if @root.pkg}}{{@root.pkg.name}} {{/if}}{{/if}}v{{version}} ({{date}})\n\n",
                mainTemplate:
                    "{{> header}}\n" +
                    "{{#each commitGroups}}\n### {{title}}\n\n{{#each commits}}{{> commit root=@root}}\n{{/each}}\n\n{{/each}}" +
                    "{{#unless commitGroups}}\n{{#each commits}}{{> commit root=@root}}\n{{/each}}{{/unless}}",
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
        versionArgs: ["--no-git-tag-version"]
    },
    github: {
        release: true,
        releaseName: "🚀 ${name} ${version} (${date,YYYY-MM-DD})"
    },
    ci: true
};
